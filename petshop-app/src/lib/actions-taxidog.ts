'use server'

// Server Actions do TaxiDog (migration 042). Separado de actions.ts só
// por tamanho — mesmas convenções: contexto da loja resolvido aqui, regra
// de negócio e autorização de verdade dentro das funções do banco.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterContextoLojista } from '@/lib/lojista-context'
import { enderecoTaxiDogSchema, perfilPetSchema, taxiDogConfigSchema } from '@/lib/validations'
import { geocodificarEndereco, geocodificarLoja } from '@/lib/geocodificacao'
import { MODALIDADES, type CotacaoTaxiDog, type ModalidadeTaxiDog } from '@/lib/taxidog'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// As funções do TaxiDog levantam exceções com texto já pensado pro
// usuário ("Esta corrida não está atribuída a você" etc.) — repassa. Só
// traduz o caso "a migration ainda não rodou", que chega técnico.
function mensagemRpc(error: { message?: string; code?: string } | null, fallback: string): string {
  const msg = error?.message ?? ''
  if (error?.code === 'PGRST202' || msg.includes('Could not find the function') || msg.includes('does not exist')) {
    return 'O TaxiDog ainda não está instalado no banco. Execute a migration 042_taxidog.sql.'
  }
  return msg || fallback
}

// ============================================================
// Cotação — chamada pela etapa "Como seu pet irá até a loja?"
// ============================================================
// Devolve as três modalidades de uma vez (uma geocodificação só), pra
// trocar entre "buscar", "entregar" e "buscar e entregar" ser instantâneo.
export async function cotarTaxiDogAction(
  idLojista: string,
  enderecoBruto: unknown
): Promise<{
  error?: string
  cotacoes?: Record<ModalidadeTaxiDog, CotacaoTaxiDog>
  precisao?: 'endereco' | 'bairro' | 'cidade' | null
}> {
  if (!UUID_RE.test(idLojista)) return { error: 'Loja inválida.' }
  const parsed = enderecoTaxiDogSchema.safeParse(enderecoBruto)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const endereco = parsed.data

  const supabase = await createClient()
  const { data: pub, error: pubError } = await supabase.rpc('fn_taxidog_publico', { p_id_lojista: idLojista })
  if (pubError) return { error: mensagemRpc(pubError, 'Não foi possível consultar o TaxiDog.') }
  const info = (pub as { disponivel: boolean; modo_cobranca: string }[] | null)?.[0]
  if (!info?.disponivel) return { error: 'O TaxiDog não está disponível nesta loja no momento.' }

  const precisaDistancia = info.modo_cobranca === 'distancia' || info.modo_cobranca === 'personalizado'
  const coords = precisaDistancia ? await geocodificarEndereco(endereco) : null

  const resultados = await Promise.all(
    MODALIDADES.map(async modalidade => {
      const { data, error } = await supabase.rpc('fn_cotar_taxidog', {
        p_id_lojista: idLojista,
        p_modalidade: modalidade,
        p_bairro: endereco.bairro,
        p_cidade: endereco.cidade,
        p_uf: endereco.uf,
        p_lat: coords?.lat ?? null,
        p_lng: coords?.lng ?? null,
      })
      const linha = (data as Array<{ disponivel: boolean; valor: unknown; distancia_km: unknown; criterio: string | null; motivo: string | null }> | null)?.[0]
      const cotacao: CotacaoTaxiDog = error || !linha
        ? { disponivel: false, valor: null, distanciaKm: null, criterio: null, motivo: mensagemRpc(error, 'Não foi possível calcular a taxa.') }
        : {
            // NUMERIC pode chegar como string via PostgREST.
            disponivel: !!linha.disponivel,
            valor: linha.valor == null ? null : Number(linha.valor),
            distanciaKm: linha.distancia_km == null ? null : Number(linha.distancia_km),
            criterio: linha.criterio,
            motivo: linha.motivo,
          }
      return [modalidade, cotacao] as const
    })
  )

  return {
    cotacoes: Object.fromEntries(resultados) as Record<ModalidadeTaxiDog, CotacaoTaxiDog>,
    precisao: coords?.precisao as 'endereco' | 'bairro' | 'cidade' | undefined ?? null,
  }
}

// ============================================================
// Configuração (Configurações → Operação → TaxiDog)
// ============================================================
export async function salvarTaxiDogConfigAction(payload: unknown): Promise<{
  error?: string
  success?: boolean
  aviso?: string
  origemEndereco?: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Apenas o responsável pela loja ou um administrador pode configurar o TaxiDog.' }
  }

  const parsed = taxiDogConfigSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const cfg = parsed.data

  // Coordenada da loja — só faz falta quando a cobrança usa distância. Se
  // a geocodificação falhar, mantém a última que deu certo e avisa.
  const { data: atual } = await supabase
    .from('taxidog_config')
    .select('origem_lat, origem_lng, origem_endereco')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()

  let origem = {
    lat: (atual?.origem_lat as number | null) ?? null,
    lng: (atual?.origem_lng as number | null) ?? null,
    endereco: (atual?.origem_endereco as string | null) ?? null,
  }
  let aviso: string | undefined

  if (cfg.modo_cobranca === 'distancia' || cfg.modo_cobranca === 'personalizado') {
    const { data: loja } = await supabase
      .from('lojista')
      .select('endereco, cidade, estado')
      .eq('id_lojista', contexto.idLojista)
      .maybeSingle()

    const enderecoLoja = [loja?.endereco, loja?.cidade, loja?.estado].filter(Boolean).join(', ')
    if (!loja?.cidade) {
      aviso = 'Complete o endereço da loja (Configurações → Dados da loja) para o cálculo por distância funcionar.'
    } else {
      const coords = await geocodificarLoja({ endereco: loja.endereco, cidade: loja.cidade, estado: loja.estado })
      if (coords) {
        origem = { lat: coords.lat, lng: coords.lng, endereco: enderecoLoja }
        if (coords.precisao === 'cidade') {
          aviso = 'Não encontramos a rua da loja no mapa — a distância está sendo medida a partir do centro da cidade. Confira o endereço em Dados da loja.'
        }
      } else if (origem.lat == null) {
        aviso = 'Não conseguimos localizar o endereço da loja no mapa agora. A cobrança por distância só funciona depois disso — confira o endereço em Dados da loja e salve de novo.'
      } else {
        aviso = 'Não conseguimos atualizar a localização da loja agora; mantivemos a última localização salva.'
      }
    }
  }

  const { error } = await supabase.rpc('fn_salvar_taxidog_config', {
    p_id_lojista: contexto.idLojista,
    p_ativo: cfg.ativo,
    p_disponivel_online: cfg.disponivel_online,
    p_modo_cobranca: cfg.modo_cobranca,
    p_valor_buscar: cfg.valor_buscar,
    p_valor_entregar: cfg.valor_entregar,
    p_valor_buscar_entregar: cfg.valor_buscar_entregar,
    p_distancia_max_km: cfg.distancia_max_km,
    p_valor_minimo: cfg.valor_minimo,
    p_origem_lat: origem.lat,
    p_origem_lng: origem.lng,
    p_origem_endereco: origem.endereco,
    p_faixas: cfg.faixas,
    p_regioes: cfg.regioes.map(r => ({ ...r, bairro: r.bairro || null, uf: r.uf || null })),
  })

  if (error) {
    if (error.message.includes('idx_taxidog_regiao_unica') || error.code === '23505') {
      return { error: 'Existem duas regiões iguais (mesmo bairro e cidade). Remova a repetida.' }
    }
    return { error: mensagemRpc(error, 'Não foi possível salvar a configuração do TaxiDog.') }
  }

  revalidatePath('/lojista/configuracoes')
  revalidatePath('/lojista/configuracoes/agendamentos')
  revalidatePath('/lojista/configuracoes/taxidog')
  // Sidebar (item "TaxiDog" aparece/some) mora no layout.
  revalidatePath('/lojista', 'layout')
  return { success: true, aviso, origemEndereco: origem.endereco }
}

// ============================================================
// Operação das corridas
// ============================================================
export async function atribuirCorridaAction(idCorrida: string, idFuncionario: string | null) {
  if (!UUID_RE.test(idCorrida) || (idFuncionario && !UUID_RE.test(idFuncionario))) return { error: 'Dados inválidos.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_atribuir_corrida', {
    p_id_corrida: idCorrida,
    p_id_funcionario: idFuncionario,
  })
  if (error) return { error: mensagemRpc(error, 'Não foi possível atribuir a corrida.') }
  revalidatePath('/lojista/taxidog')
  return { success: true }
}

export async function avancarCorridaAction(idCorrida: string, novoStatus: string) {
  if (!UUID_RE.test(idCorrida)) return { error: 'Corrida inválida.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_avancar_corrida', {
    p_id_corrida: idCorrida,
    p_novo_status: novoStatus,
  })
  if (error) return { error: mensagemRpc(error, 'Não foi possível atualizar a corrida.') }
  revalidatePath('/lojista/taxidog')
  return { success: true, status: data as string }
}

export async function cancelarCorridaAction(idCorrida: string) {
  if (!UUID_RE.test(idCorrida)) return { error: 'Corrida inválida.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cancelar_corrida', { p_id_corrida: idCorrida })
  if (error) return { error: mensagemRpc(error, 'Não foi possível cancelar o TaxiDog.') }
  revalidatePath('/lojista/taxidog')
  revalidatePath('/lojista/kanban')
  return { success: true }
}

// ============================================================
// Perfil opcional do pet (pelagem, comportamento…)
// ============================================================
export async function salvarPerfilPetAction(idPet: string, payload: unknown) {
  if (!UUID_RE.test(idPet)) return { error: 'Pet inválido.' }
  const parsed = perfilPetSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_salvar_perfil_pet', {
    p_id_pet: idPet,
    p_pelagem: parsed.data.pelagem,
    p_comprimento_pelo: parsed.data.comprimento_pelo,
    p_caracteristicas: parsed.data.caracteristicas,
    p_comportamento: parsed.data.comportamento,
    p_obs_comportamento: parsed.data.obs_comportamento,
  })
  if (error) return { error: mensagemRpc(error, 'Não foi possível salvar as informações adicionais do pet.') }

  revalidatePath('/lojista/pets')
  revalidatePath(`/lojista/pets/${idPet}`)
  return { success: true }
}

// ============================================================
// "Preços do agendamento online podem ser estimativa"
// ============================================================
export async function alternarPrecosEstimadosAction(ativo: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { error: 'Acesso não autorizado' }
  }

  // Mesmo padrão de clienteParaEscritaLojista (actions.ts): administrador
  // não tem policy de escrita em `lojista`, grava pelo client admin depois
  // de a permissão ter sido conferida acima.
  const db = contexto.role === 'lojista' ? supabase : createAdminClient()
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }

  const { error } = await db
    .from('lojista')
    .update({ precos_estimados: ativo })
    .eq('id_lojista', contexto.idLojista)

  if (error) {
    if (error.code === '42703' || error.message?.includes('precos_estimados')) {
      return { error: 'Execute a migration 042_taxidog.sql para usar esta opção.' }
    }
    return { error: 'Erro ao atualizar a configuração.' }
  }

  revalidatePath('/lojista/configuracoes/agendamentos')
  return { success: true }
}
