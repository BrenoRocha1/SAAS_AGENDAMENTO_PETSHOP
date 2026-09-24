'use server'

// Server Actions das ROTAS do TaxiDog (migration 052). A regra de
// negócio e a autorização de verdade estão nas funções do banco; aqui a
// aplicação monta/reordena o plano (lib/taxidog-rotas) e recalcula
// distância e tempo no Google Maps depois de cada mudança.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import { formatarEnderecoLoja } from '@/lib/format'
import { taxiDogAgendamentoSchema } from '@/lib/validations'
import { coordenadasParaTaxiDog, mensagemErroTaxiDog } from '@/lib/taxidog-servidor'
import { calcularTrajeto, googleMapsConfigurado, type PontoRota } from '@/lib/rotas-mapa'
import {
  montarPlanoInicial,
  normalizarPlano,
  normalizarRota,
  normalizarTrecho,
  planoDaRota,
  planoParaBanco,
  type ItemParada,
  type ParadaPlano,
  type Rota,
  type Trecho,
} from '@/lib/taxidog-rotas'

type Supabase = Awaited<ReturnType<typeof createClient>>
type Resultado = { error?: string; success?: boolean }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// As funções do banco já levantam mensagens pensadas pro usuário; só o
// caso "migration não rodou" chega técnico.
function mensagem(error: { message?: string; code?: string } | null, fallback: string): string {
  const msg = error?.message ?? ''
  if (error?.code === 'PGRST202' || msg.includes('Could not find the function') || msg.includes('does not exist')) {
    return 'As rotas do TaxiDog ainda não estão no banco. Execute a migration 052_taxidog_rotas.sql.'
  }
  return mensagemErroTaxiDog(msg)?.replace(/^TaxiDog: /, '') ?? (msg || fallback)
}

function revalidar() {
  revalidatePath('/lojista/kanban')
  revalidatePath('/lojista/taxidog')
  revalidatePath('/lojista/agendamentos')
}

async function carregarRota(supabase: Supabase, idRota: string): Promise<Rota | null> {
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
async function recalcular(supabase: Supabase, idRota: string, idLojista: string): Promise<string | null> {
  if (!googleMapsConfigurado()) return null
  const rota = await carregarRota(supabase, idRota)
  if (!rota || rota.calculo_versao === rota.versao || rota.paradas.length === 0) return null
  const loja = await pontoDaLoja(supabase, idLojista)
  if (!loja) return 'Cadastre o endereço da loja para calcular a distância.'
  const pontos: PontoRota[] = [
    loja,
    ...rota.paradas.map(p => (p.local === 'loja' || !p.itens[0] ? loja : pontoDoCliente(p.itens[0]))),
  ]
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

async function contextoGestor(supabase: Supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  return contexto?.podeGerenciarAgenda ? contexto : null
}

async function salvarPlano(supabase: Supabase, rota: Rota, plano: ParadaPlano[], mensagemAlteracao: string, idLojista: string): Promise<Resultado> {
  const { error } = await supabase.rpc('fn_salvar_paradas', {
    p_id_rota: rota.id_rota,
    p_paradas: planoParaBanco(plano),
    p_mensagem: mensagemAlteracao,
  })
  if (error) return { error: mensagem(error, 'Não foi possível atualizar a rota.') }
  await recalcular(supabase, rota.id_rota, idLojista)
  revalidar()
  return { success: true }
}

// ============================================================
// Organização (dono / equipe com agenda)
// ============================================================
export async function criarRotaAction(
  data: string,
  idFuncionario: string | null,
  trechos: { id_corrida: string; trecho: Trecho }[]
): Promise<Resultado & { id_rota?: string }> {
  if (!DATA_RE.test(data) || (idFuncionario && !UUID_RE.test(idFuncionario))) return { error: 'Dados inválidos.' }
  if (!Array.isArray(trechos) || trechos.length === 0) return { error: 'Escolha ao menos uma solicitação.' }
  if (trechos.some(t => !UUID_RE.test(t.id_corrida) || (t.trecho !== 'busca' && t.trecho !== 'entrega'))) return { error: 'Dados inválidos.' }

  const supabase = await createClient()
  const contexto = await contextoGestor(supabase)
  if (!contexto) return { error: 'Você não tem permissão para organizar as rotas.' }

  const { data: pendentesRaw, error: pendErro } = await supabase.rpc('fn_trechos_pendentes', { p_data: data })
  if (pendErro) return { error: mensagem(pendErro, 'Não foi possível carregar as solicitações.') }
  const pendentes = ((pendentesRaw ?? []) as Record<string, unknown>[]).map(normalizarTrecho)
  const escolhidos = pendentes.filter(p => trechos.some(t => t.id_corrida === p.id_corrida && t.trecho === p.trecho))
  if (escolhidos.length !== trechos.length) {
    return { error: 'Alguma solicitação escolhida já entrou em outra rota ou foi cancelada. Atualize a página.' }
  }

  const { data: idRota, error } = await supabase.rpc('fn_criar_rota', {
    p_data: data,
    p_id_funcionario: idFuncionario,
    p_paradas: planoParaBanco(montarPlanoInicial(escolhidos)),
  })
  if (error) return { error: mensagem(error, 'Não foi possível criar a rota.') }

  await recalcular(supabase, idRota as string, contexto.idLojista)
  revalidar()
  return { success: true, id_rota: idRota as string }
}

// Nova ordem das paradas ainda não feitas (ids na ordem desejada).
export async function reordenarParadasAction(idRota: string, idsPendentes: string[]): Promise<Resultado> {
  if (!UUID_RE.test(idRota) || !Array.isArray(idsPendentes)) return { error: 'Dados inválidos.' }
  const supabase = await createClient()
  const contexto = await contextoGestor(supabase)
  if (!contexto) return { error: 'Você não tem permissão para organizar as rotas.' }

  const rota = await carregarRota(supabase, idRota)
  if (!rota) return { error: 'Rota não encontrada.' }
  const { fixas, pendentes } = planoDaRota(rota)
  const porId = new Map(pendentes.map(p => [p.id, p]))
  if (idsPendentes.length !== pendentes.length || idsPendentes.some(id => !porId.has(id))) {
    return { error: 'A rota mudou enquanto você organizava. Atualize a página.' }
  }
  const plano = normalizarPlano(fixas, idsPendentes.map(id => porId.get(id)!))
  return salvarPlano(supabase, rota, plano, 'A ordem das paradas foi alterada', contexto.idLojista)
}

export async function removerDaRotaAction(idRota: string, idCorrida: string): Promise<Resultado> {
  if (!UUID_RE.test(idRota) || !UUID_RE.test(idCorrida)) return { error: 'Dados inválidos.' }
  const supabase = await createClient()
  const contexto = await contextoGestor(supabase)
  if (!contexto) return { error: 'Você não tem permissão para organizar as rotas.' }

  const rota = await carregarRota(supabase, idRota)
  if (!rota) return { error: 'Rota não encontrada.' }
  const itens = rota.paradas.flatMap(p => p.itens.map(i => ({ ...i, statusParada: p.status })))
  const doPet = itens.filter(i => i.id_corrida === idCorrida)
  if (doPet.length === 0) return { error: 'Este pet não está nesta rota.' }
  const pet = doPet[0].pet_nome

  if (doPet.some(i => i.statusParada === 'chegou')) return { error: `O TaxiDog está na parada de ${pet} agora.` }
  const embarcou = doPet.some(i => i.acao === 'embarcar' && i.feito)
  const deixou = doPet.some(i => i.acao === 'deixar_loja' && i.feito)
  const pegou = doPet.some(i => i.acao === 'pegar_loja' && i.feito)
  const entregou = doPet.some(i => i.acao === 'entregar' && i.feito)
  if ((embarcou && !deixou) || (pegou && !entregou)) return { error: `${pet} já está no carro — conclua as paradas dele primeiro.` }

  const { fixas, pendentes } = planoDaRota(rota)
  const plano = normalizarPlano(fixas, pendentes.map(p => ({ ...p, itens: p.itens.filter(i => i.id_corrida !== idCorrida) })))
  return salvarPlano(supabase, rota, plano, `A parada de ${pet} foi removida`, contexto.idLojista)
}

export async function adicionarNaRotaAction(idRota: string, idCorrida: string, trecho: Trecho): Promise<Resultado> {
  if (!UUID_RE.test(idRota) || !UUID_RE.test(idCorrida) || (trecho !== 'busca' && trecho !== 'entrega')) return { error: 'Dados inválidos.' }
  const supabase = await createClient()
  const contexto = await contextoGestor(supabase)
  if (!contexto) return { error: 'Você não tem permissão para organizar as rotas.' }

  const rota = await carregarRota(supabase, idRota)
  if (!rota) return { error: 'Rota não encontrada.' }
  const { data: pendentesRaw, error: pendErro } = await supabase.rpc('fn_trechos_pendentes', { p_data: rota.data })
  if (pendErro) return { error: mensagem(pendErro, 'Não foi possível carregar as solicitações.') }
  const t = ((pendentesRaw ?? []) as Record<string, unknown>[]).map(normalizarTrecho).find(p => p.id_corrida === idCorrida && p.trecho === trecho)
  if (!t) return { error: 'Esta solicitação não está mais pendente. Atualize a página.' }

  const { fixas, pendentes } = planoDaRota(rota)
  const nova: ParadaPlano = { local: 'cliente', itens: [{ id_corrida: idCorrida, acao: trecho === 'busca' ? 'embarcar' : 'entregar' }] }
  const plano = normalizarPlano(fixas, [...pendentes, nova])
  return salvarPlano(supabase, rota, plano, trecho === 'busca' ? `Nova parada: buscar ${t.pet_nome}` : `Nova parada: entregar ${t.pet_nome}`, contexto.idLojista)
}

export async function atribuirRotaAction(idRota: string, idFuncionario: string | null): Promise<Resultado> {
  if (!UUID_RE.test(idRota) || (idFuncionario && !UUID_RE.test(idFuncionario))) return { error: 'Dados inválidos.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_atribuir_rota', { p_id_rota: idRota, p_id_funcionario: idFuncionario })
  if (error) return { error: mensagem(error, 'Não foi possível trocar o TaxiDog.') }
  revalidar()
  return { success: true }
}

export async function cancelarRotaAction(idRota: string): Promise<Resultado> {
  if (!UUID_RE.test(idRota)) return { error: 'Rota inválida.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cancelar_rota', { p_id_rota: idRota })
  if (error) return { error: mensagem(error, 'Não foi possível cancelar a rota.') }
  revalidar()
  return { success: true }
}

// Chamado pelas telas quando a rota mudou por fora (ex.: cliente cancelou
// e o banco tirou a parada) e a distância ficou desatualizada.
export async function recalcularRotaAction(idRota: string): Promise<Resultado> {
  if (!UUID_RE.test(idRota)) return { error: 'Rota inválida.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  const falha = await recalcular(supabase, idRota, contexto.idLojista)
  return falha ? { error: falha } : { success: true }
}

// ============================================================
// Execução (TaxiDog da rota)
// ============================================================
export async function iniciarRotaAction(idRota: string): Promise<Resultado> {
  if (!UUID_RE.test(idRota)) return { error: 'Rota inválida.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_iniciar_rota', { p_id_rota: idRota })
  if (error) return { error: mensagem(error, 'Não foi possível iniciar a rota.') }
  revalidar()
  return { success: true }
}

export async function chegarParadaAction(idParada: string): Promise<Resultado> {
  if (!UUID_RE.test(idParada)) return { error: 'Parada inválida.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_chegar_parada', { p_id_parada: idParada })
  if (error) return { error: mensagem(error, 'Não foi possível registrar a chegada.') }
  revalidar()
  return { success: true }
}

// itensOk = pets confirmados (null = todos). Quem ficar de fora (não
// embarcou / não estava pronto) sai da rota e volta a ficar pendente.
export async function concluirParadaAction(idParada: string, itensOk: string[] | null): Promise<Resultado & { statusRota?: string }> {
  if (!UUID_RE.test(idParada) || (itensOk && itensOk.some(i => !UUID_RE.test(i)))) return { error: 'Dados inválidos.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_concluir_parada', { p_id_parada: idParada, p_itens: itensOk })
  if (error) return { error: mensagem(error, 'Não foi possível confirmar a parada.') }
  revalidar()
  return { success: true, statusRota: data as string }
}

// Troca o transporte de um agendamento já feito (dono / equipe com
// agenda). `dadosBrutos` null = sem TaxiDog. O banco cuida da visita
// inteira, da taxa e de tirar o pet das rotas (migration 052).
export async function alterarTransporteAction(idAgendamento: string, dadosBrutos: unknown | null): Promise<Resultado & { mensagem?: string }> {
  if (!UUID_RE.test(idAgendamento)) return { error: 'Agendamento inválido.' }
  const supabase = await createClient()
  const contexto = await contextoGestor(supabase)
  if (!contexto) return { error: 'Você não tem permissão para alterar este agendamento.' }

  let params: Record<string, unknown> = { p_id_agendamento: idAgendamento, p_modalidade: null }
  if (dadosBrutos != null) {
    const parsed = taxiDogAgendamentoSchema.safeParse(dadosBrutos)
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    const e = parsed.data.endereco
    const coords = await coordenadasParaTaxiDog(supabase, contexto.idLojista, e, true)
    params = {
      p_id_agendamento: idAgendamento,
      p_modalidade: parsed.data.modalidade,
      p_cep: e.cep,
      p_logradouro: e.logradouro,
      p_numero: e.numero,
      p_complemento: e.complemento || null,
      p_bairro: e.bairro,
      p_cidade: e.cidade,
      p_uf: e.uf,
      p_lat: coords?.lat ?? null,
      p_lng: coords?.lng ?? null,
    }
  }

  const { data, error } = await supabase.rpc('fn_alterar_transporte_agendamento', params)
  if (error) return { error: mensagem(error, 'Não foi possível alterar o transporte.') }
  revalidar()
  return { success: true, mensagem: (data as string | null) ?? undefined }
}
