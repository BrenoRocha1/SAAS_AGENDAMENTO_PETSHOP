'use server'

// Server Actions dos serviços adicionais (migration 095). Quem pode e as
// regras (loja certa, adicional ativo e compatível, pedido já pago,
// cobrança repetida) ficam nas funções do banco — aqui é validação de
// formato, a leitura para as telas e o texto do aviso ao cliente.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import {
  COLUNAS_ADICIONAL,
  COLUNAS_ADICIONAL_DO_AGENDAMENTO,
  MSG_MIGRATION_ADICIONAIS,
  adicionalValePara,
  faltaMigrationAdicionais,
  lerAdicionais,
  lerAdicionaisDoAgendamento,
  mensagemAvisoAdicional,
  mensagemErroAdicional,
  type AdicionalDoAgendamento,
  type AvisoAdicional,
  type ServicoAdicional,
} from '@/lib/adicionais'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ABERTOS = ['Pendente', 'Confirmado', 'Em andamento']

function erroDoBanco(erro: { code?: string; message?: string }, generico: string): string {
  if (faltaMigrationAdicionais(erro)) return MSG_MIGRATION_ADICIONAIS
  const pronto = mensagemErroAdicional(erro.message)
  if (pronto) return pronto
  console.error('[adicionais] erro:', erro.code, erro.message)
  return process.env.NODE_ENV !== 'production' && erro.message ? `${generico} [DEV: ${erro.message}]` : generico
}

function revalidarAgenda() {
  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/kanban')
  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/relatorios')
  revalidatePath('/cliente/agendamentos')
}

// ============================================================
// Catálogo (tela de Serviços)
// ============================================================

export interface DadosServicoAdicional {
  nome: string
  descricao: string
  preco: number
  disponivelOnline: boolean
  disponivelAtendimento: boolean
  // Serviços principais para os quais vale; vazio = todos.
  servicos: string[]
}

export async function salvarServicoAdicionalAction(
  idAdicional: string | null,
  dados: DadosServicoAdicional,
): Promise<{ error?: string; success?: boolean; adicionais?: ServicoAdicional[] }> {
  if (idAdicional !== null && !UUID_RE.test(String(idAdicional))) return { error: 'Serviço adicional inválido.' }
  const nome = String(dados?.nome ?? '').trim()
  const descricao = String(dados?.descricao ?? '').trim()
  const preco = Number(dados?.preco)
  const servicos = Array.isArray(dados?.servicos) ? dados.servicos.map(String) : []
  if (nome.length < 2 || nome.length > 100) return { error: 'O nome precisa ter entre 2 e 100 caracteres.' }
  if (descricao.length > 500) return { error: 'A descrição passa de 500 caracteres.' }
  if (!Number.isFinite(preco) || preco <= 0) return { error: 'Informe um preço maior que zero.' }
  if (servicos.some(s => !UUID_RE.test(s))) return { error: 'Serviço inválido.' }
  if (!dados.disponivelOnline && !dados.disponivelAtendimento) {
    return { error: 'Deixe o adicional disponível no agendamento online, no atendimento ou nos dois.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.rpc('fn_salvar_servico_adicional', {
    p_id_adicional: idAdicional,
    p_nome: nome,
    p_descricao: descricao || null,
    p_preco: preco,
    p_disponivel_online: !!dados.disponivelOnline,
    p_disponivel_atendimento: !!dados.disponivelAtendimento,
    p_servicos: servicos,
  })
  if (error) return { error: erroDoBanco(error, 'Não foi possível salvar o serviço adicional.') }

  revalidatePath('/lojista/servicos')
  return { success: true, adicionais: await listarAdicionaisDaLoja(supabase, user.id, user.user_metadata?.role) }
}

export async function alternarStatusServicoAdicionalAction(idAdicional: string, ativo: boolean): Promise<{ error?: string; success?: boolean }> {
  if (!UUID_RE.test(String(idAdicional))) return { error: 'Serviço adicional inválido.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await supabase.rpc('fn_status_servico_adicional', { p_id_adicional: idAdicional, p_ativo: !!ativo })
  if (error) return { error: erroDoBanco(error, 'Não foi possível atualizar o serviço adicional.') }
  revalidatePath('/lojista/servicos')
  return { success: true }
}

// Sem cobrança ligada, apaga de vez; com histórico, sai da lista e fica só
// nos atendimentos em que já foi cobrado.
export async function excluirServicoAdicionalAction(idAdicional: string): Promise<{ error?: string; success?: boolean }> {
  if (!UUID_RE.test(String(idAdicional))) return { error: 'Serviço adicional inválido.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await supabase.rpc('fn_excluir_servico_adicional', { p_id_adicional: idAdicional })
  if (error) return { error: erroDoBanco(error, 'Não foi possível excluir o serviço adicional.') }
  revalidatePath('/lojista/servicos')
  return { success: true }
}

async function listarAdicionaisDaLoja(
  supabase: Awaited<ReturnType<typeof createClient>>,
  idUsuario: string,
  role: string | undefined,
): Promise<ServicoAdicional[]> {
  const contexto = await obterContextoLojista(supabase, idUsuario, role)
  if (!contexto) return []
  const { data } = await supabase
    .from('servico_adicional')
    .select(COLUNAS_ADICIONAL)
    .eq('id_lojista', contexto.idLojista)
    .is('excluido_em', null)
    .order('created_at', { ascending: false })
  return lerAdicionais(data)
}

// ============================================================
// No atendimento (detalhe do agendamento)
// ============================================================

export interface AdicionaisDoAtendimento {
  // false enquanto a migration 095 não rodou: o bloco nem aparece.
  instalado: boolean
  itens: AdicionalDoAgendamento[]
  // O que ainda dá para incluir: ativo, liberado para o atendimento, vale
  // para o serviço e não está no agendamento.
  disponiveis: ServicoAdicional[]
  podeAlterar: boolean
  // Total do agendamento (já com os adicionais) e quanto deles é adicional.
  valor: number
  totalAdicionais: number
  pago: boolean
}

const VAZIO: AdicionaisDoAtendimento = { instalado: false, itens: [], disponiveis: [], podeAlterar: false, valor: 0, totalAdicionais: 0, pago: false }

export async function adicionaisDoAgendamentoAction(idAgendamento: string): Promise<AdicionaisDoAtendimento> {
  if (!UUID_RE.test(String(idAgendamento))) return VAZIO
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return VAZIO
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return VAZIO

  const [{ data: ag }, itensR, catalogoR] = await Promise.all([
    supabase.from('agendamento')
      .select('id_servico, valor, status, status_pagamento')
      .eq('id_agendamento', idAgendamento)
      .eq('id_lojista', contexto.idLojista)
      .maybeSingle(),
    supabase.from('agendamento_adicional')
      .select(COLUNAS_ADICIONAL_DO_AGENDAMENTO)
      .eq('id_agendamento', idAgendamento)
      .eq('id_lojista', contexto.idLojista)
      .order('created_at'),
    supabase.from('servico_adicional')
      .select(COLUNAS_ADICIONAL)
      .eq('id_lojista', contexto.idLojista)
      .eq('status', 'Ativo')
      .eq('disponivel_atendimento', true)
      .is('excluido_em', null)
      .order('nome'),
  ])
  if (!ag || itensR.error || catalogoR.error) return VAZIO

  const itens = lerAdicionaisDoAgendamento(itensR.data)
  const ativos = itens.filter(i => i.status === 'ativo')
  const jaNoAgendamento = new Set(ativos.map(i => i.id_adicional))
  const podeAlterar = contexto.podeGerenciarAgenda && ABERTOS.includes(ag.status as string)
  return {
    instalado: true,
    itens,
    disponiveis: podeAlterar
      ? lerAdicionais(catalogoR.data).filter(a => adicionalValePara(a, ag.id_servico as string) && !jaNoAgendamento.has(a.id_adicional))
      : [],
    podeAlterar,
    valor: Number(ag.valor),
    totalAdicionais: ativos.reduce((soma, i) => soma + i.valor_total, 0),
    pago: ag.status_pagamento === 'pago',
  }
}

export interface ResultadoInclusao {
  error?: string
  success?: boolean
  // O pedido está marcado como pago: a tela pede a confirmação e chama de
  // novo com `reabrirPagamento`.
  pedidoPago?: boolean
  // Os que entraram (pode ser parte, se um falhou no meio).
  incluidos?: { nome: string; preco: number }[]
  valorAnterior?: number
  valorNovo?: number
  pagamentoReaberto?: boolean
  // Dados reais do atendimento e o texto pronto para avisar o cliente.
  aviso?: AvisoAdicional & { mensagem: string }
}

// A loja inclui um ou mais adicionais num atendimento. Cada um é uma
// chamada ao banco (que trava o agendamento e recusa repetido); se um
// falhar, os anteriores ficam e a tela mostra o que entrou e o erro.
export async function incluirAdicionaisAction(
  idAgendamento: string,
  idsAdicionais: string[],
  observacao: string | null,
  reabrirPagamento = false,
): Promise<ResultadoInclusao> {
  if (!UUID_RE.test(String(idAgendamento))) return { error: 'Agendamento inválido.' }
  const ids = [...new Set((Array.isArray(idsAdicionais) ? idsAdicionais : []).map(String))]
  if (ids.length === 0) return { error: 'Escolha pelo menos um serviço adicional.' }
  if (ids.length > 20 || ids.some(i => !UUID_RE.test(i))) return { error: 'Serviço adicional inválido.' }
  const obs = String(observacao ?? '').trim()
  if (obs.length > 500) return { error: 'A observação passa de 500 caracteres.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const incluidos: { nome: string; preco: number }[] = []
  let valorAnterior: number | undefined
  let valorNovo: number | undefined
  let pagamentoReaberto = false
  let erro: string | undefined
  for (const id of ids) {
    const { data, error } = await supabase.rpc('fn_adicionar_adicional_agendamento', {
      p_id_agendamento: idAgendamento,
      p_id_adicional: id,
      p_observacao: obs || null,
      p_reabrir_pagamento: !!reabrirPagamento,
    })
    if (error) {
      if (incluidos.length === 0 && /já está marcado como pago/.test(error.message ?? '')) {
        return { pedidoPago: true, error: mensagemErroAdicional(error.message) ?? 'Este atendimento já está marcado como pago.' }
      }
      erro = erroDoBanco(error, 'Não foi possível incluir o serviço adicional.')
      break
    }
    const r = data as { nome: string; preco: number; valor_anterior: number; valor_novo: number; pagamento_reaberto?: boolean }
    incluidos.push({ nome: r.nome, preco: Number(r.preco) })
    valorAnterior ??= Number(r.valor_anterior)
    valorNovo = Number(r.valor_novo)
    pagamentoReaberto ||= !!r.pagamento_reaberto
  }
  if (incluidos.length === 0) return { error: erro ?? 'Não foi possível incluir o serviço adicional.' }

  revalidarAgenda()
  const aviso = await montarAviso(supabase, idAgendamento, incluidos.map(i => i.nome), valorAnterior ?? 0, obs || null)
  return {
    success: !erro,
    error: erro,
    incluidos,
    valorAnterior,
    valorNovo: aviso?.valorNovo ?? valorNovo,
    pagamentoReaberto,
    aviso: aviso ?? undefined,
  }
}

export async function removerAdicionalAction(
  idAgendamentoAdicional: string,
  motivo: string | null,
  reabrirPagamento = false,
): Promise<{ error?: string; success?: boolean; pedidoPago?: boolean; valorAnterior?: number; valorNovo?: number; pagamentoReaberto?: boolean }> {
  if (!UUID_RE.test(String(idAgendamentoAdicional))) return { error: 'Cobrança inválida.' }
  const texto = String(motivo ?? '').trim()
  if (texto.length > 500) return { error: 'O motivo passa de 500 caracteres.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data, error } = await supabase.rpc('fn_remover_adicional_agendamento', {
    p_id_agendamento_adicional: idAgendamentoAdicional,
    p_motivo: texto || null,
    p_reabrir_pagamento: !!reabrirPagamento,
  })
  if (error) {
    if (/já está marcado como pago/.test(error.message ?? '')) {
      return { pedidoPago: true, error: mensagemErroAdicional(error.message) ?? 'Este atendimento já está marcado como pago.' }
    }
    return { error: erroDoBanco(error, 'Não foi possível remover a cobrança.') }
  }
  const r = data as { valor_anterior: number; valor_novo: number; pagamento_reaberto?: boolean }
  revalidarAgenda()
  return { success: true, valorAnterior: Number(r.valor_anterior), valorNovo: Number(r.valor_novo), pagamentoReaberto: !!r.pagamento_reaberto }
}

// Dados do atendimento, lidos depois da inclusão, para o resumo e para a
// mensagem ao cliente — nada vem da tela.
async function montarAviso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  idAgendamento: string,
  nomesNovos: string[],
  valorAnterior: number,
  observacao: string | null,
): Promise<(AvisoAdicional & { mensagem: string }) | null> {
  const [{ data: ag }, { data: itens }, { data: produtos }, { data: corridas }] = await Promise.all([
    supabase.from('agendamento')
      .select('valor, cliente:id_cliente ( nome, telefone ), pet:id_pet ( nome ), servico:id_servico ( nome )')
      .eq('id_agendamento', idAgendamento)
      .maybeSingle(),
    supabase.from('agendamento_adicional').select('nome, valor_total').eq('id_agendamento', idAgendamento).eq('status', 'ativo').order('created_at'),
    supabase.from('agendamento_produto').select('quantidade, preco_unitario').eq('id_agendamento', idAgendamento),
    supabase.from('taxidog_corrida').select('valor').eq('id_agendamento', idAgendamento).neq('status', 'cancelada'),
  ])
  const info = ag as unknown as {
    valor: number
    cliente: { nome: string; telefone: string | null } | null
    pet: { nome: string } | null
    servico: { nome: string } | null
  } | null
  if (!info) return null

  const adicionais = ((itens ?? []) as { nome: string; valor_total: number }[]).map(i => ({
    nome: i.nome,
    valor: Number(i.valor_total),
    novo: nomesNovos.includes(i.nome),
  }))
  const valorNovo = Number(info.valor)
  const valorProdutos = ((produtos ?? []) as { quantidade: number; preco_unitario: number }[]).reduce((s, p) => s + Number(p.quantidade) * Number(p.preco_unitario), 0)
  const valorTaxiDog = ((corridas ?? []) as { valor: number }[]).reduce((s, c) => s + Number(c.valor), 0)
  const totalAdicionais = adicionais.reduce((s, a) => s + a.valor, 0)
  const aviso: AvisoAdicional = {
    nomeCliente: info.cliente?.nome ?? null,
    telefoneCliente: info.cliente?.telefone ?? null,
    nomePet: info.pet?.nome ?? null,
    nomeServico: info.servico?.nome ?? 'Serviço',
    valorAnterior,
    valorNovo,
    valorServico: Math.max(0, Math.round((valorNovo - totalAdicionais - valorProdutos - valorTaxiDog) * 100) / 100),
    valorProdutos,
    valorTaxiDog,
    adicionais,
    observacao,
  }
  return { ...aviso, mensagem: mensagemAvisoAdicional(aviso) }
}
