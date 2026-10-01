// Distância e tempo das rotas do TaxiDog (Google Maps) — parte de servidor
// usada pelas Server Actions (actions-rotas.ts, painel web) e pela rota de
// API que o app mobile chama (/api/rotas/recalcular). Não é um arquivo
// 'use server': só é importado por eles. Recebe o client de quem chama —
// sempre o do usuário (RLS), nunca o admin.
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatarEnderecoLoja } from '@/lib/format'
import { calcularTrajeto, chamadasNecessarias, googleMapsConfigurado, limiteMensalGoogle, type PontoRota } from '@/lib/rotas-mapa'
import { normalizarRota, type ItemParada, type Rota } from '@/lib/taxidog-rotas'

type Supabase = SupabaseClient

export async function carregarRota(supabase: Supabase, idRota: string): Promise<Rota | null> {
  const { data } = await supabase.rpc('fn_listar_rotas', { p_data_ini: '2000-01-01', p_data_fim: '2000-01-01', p_id_rota: idRota })
  const linha = (data as Record<string, unknown>[] | null)?.[0]
  return linha ? normalizarRota(linha) : null
}

// ── Distância e tempo (Google Maps) ─────────────────────────
async function pontoDaLoja(supabase: Supabase, idLojista: string): Promise<PontoRota | null> {
  const completa = await supabase
    .from('lojista')
    .select('endereco, numero, complemento, bairro, cidade, estado, cep')
    .eq('id_lojista', idLojista)
    .maybeSingle()
  const loja = completa.error
    ? (await supabase.from('lojista').select('endereco, cidade, estado, cep').eq('id_lojista', idLojista).maybeSingle()).data
    : completa.data
  if (!loja?.cidade) return null
  const texto = [formatarEnderecoLoja(loja).replace(/ · /g, ', '), loja.cep, 'Brasil'].filter(Boolean).join(', ')
  return { endereco: texto }
}

function pontoDoCliente(i: ItemParada): PontoRota {
  if (i.lat != null && i.lng != null) return { lat: i.lat, lng: i.lng }
  return { endereco: `${i.logradouro}, ${i.numero} - ${i.bairro}, ${i.cidade} - ${i.uf}, ${i.cep}, Brasil` }
}

// Calcula de novo se a rota mudou desde o último cálculo. Sem chave do
// Google, não faz nada (a tela avisa). Devolve o motivo quando não deu.
export async function recalcularRota(supabase: Supabase, idRota: string, idLojista: string): Promise<string | null> {
  if (!googleMapsConfigurado()) return null
  const rota = await carregarRota(supabase, idRota)
  if (!rota || rota.calculo_versao === rota.versao || rota.paradas.length === 0) return null
  const loja = await pontoDaLoja(supabase, idLojista)
  if (!loja) return 'Cadastre o endereço da loja para calcular a distância.'
  const pontos: PontoRota[] = [
    loja,
    ...rota.paradas.map(p => (p.local === 'loja' || !p.itens[0] ? loja : pontoDoCliente(p.itens[0]))),
  ]
  // Conta as chamadas do mês antes de chamar o Google (migration 055).
  const { data: liberado, error: erroLimite } = await supabase.rpc('fn_reservar_chamadas_google', {
    p_quantidade: chamadasNecessarias(pontos),
    p_limite: limiteMensalGoogle(),
  })
  if (erroLimite) {
    return erroLimite.code === 'PGRST202' || erroLimite.message.includes('Could not find the function')
      ? 'Execute a migration 055_google_maps_limite.sql para liberar o cálculo de distância.'
      : 'Não foi possível calcular a distância agora.'
  }
  if (!liberado) return 'O limite grátis do Google Maps deste mês acabou — a distância volta no mês que vem.'

  const r = await calcularTrajeto(pontos)
  if (!r.ok) {
    if (r.motivo === 'falha') console.error('[rotas] Google Maps:', r.detalhe)
    return 'O Google Maps não conseguiu calcular esta rota agora.'
  }
  await supabase.rpc('fn_salvar_calculo_rota', {
    p_id_rota: idRota,
    p_versao: rota.versao,
    p_distancia_m: Math.round(r.distanciaM),
    p_duracao_s: Math.round(r.duracaoS),
  })
  return null
}
