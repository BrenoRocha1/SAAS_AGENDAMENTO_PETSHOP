import { supabase } from '@/lib/supabase'

// Serviços adicionais (migration 095) — o mesmo módulo do site
// (petshop-app/src/lib/adicionais.ts): cobranças extras que a loja cadastra
// e que entram num agendamento, escolhidas pelo cliente ao agendar ou
// incluídas pela loja no atendimento. O app lê direto do banco (as policies
// decidem o que cada um vê) e grava pelas actions do site.

export interface ServicoAdicional {
  id_adicional: string
  nome: string
  descricao: string | null
  preco: number
  status: 'Ativo' | 'Inativo'
  disponivel_online: boolean
  disponivel_atendimento: boolean
  // Serviços principais para os quais vale. Vazio = todos os da loja.
  servicos: string[]
}

export type OrigemAdicional = 'cliente_online' | 'funcionario' | 'lojista'

export interface AdicionalDoAgendamento {
  id_agendamento_adicional: string
  id_adicional: string | null
  nome: string
  descricao: string | null
  preco_unitario: number
  quantidade: number
  valor_total: number
  observacao: string | null
  origem: OrigemAdicional
  nome_usuario: string | null
  status: 'ativo' | 'removido'
  created_at: string
  removido_em: string | null
  nome_removido_por: string | null
  motivo_remocao: string | null
}

export interface AvisoAdicional {
  nomeCliente: string | null
  telefoneCliente: string | null
  nomePet: string | null
  nomeServico: string
  valorAnterior: number
  valorNovo: number
  valorServico: number
  mensagem: string
}

// O que volta de incluirAdicionaisAction.
export interface ResultadoInclusao {
  pedidoPago?: boolean
  incluidos?: { nome: string; preco: number }[]
  valorAnterior?: number
  valorNovo?: number
  pagamentoReaberto?: boolean
  aviso?: AvisoAdicional
}

const COLUNAS_ADICIONAL =
  'id_adicional, nome, descricao, preco, status, disponivel_online, disponivel_atendimento, vinculos:servico_adicional_servico ( id_servico )'

const COLUNAS_ADICIONAL_DO_AGENDAMENTO =
  'id_agendamento_adicional, id_adicional, nome, descricao, preco_unitario, quantidade, valor_total, observacao, origem, nome_usuario, status, created_at, removido_em, nome_removido_por, motivo_remocao'

type LinhaAdicional = Omit<ServicoAdicional, 'servicos' | 'preco'> & { preco: number | string; vinculos?: { id_servico: string }[] | null }

function lerAdicionais(linhas: unknown): ServicoAdicional[] {
  return ((linhas ?? []) as LinhaAdicional[]).map(({ vinculos, ...a }) => ({
    ...a,
    preco: Number(a.preco),
    servicos: (vinculos ?? []).map(v => v.id_servico),
  }))
}

// Sem serviço marcado, o adicional vale para todos.
export function adicionalValePara(adicional: Pick<ServicoAdicional, 'servicos'>, idServico: string): boolean {
  return adicional.servicos.length === 0 || adicional.servicos.includes(idServico)
}

export function rotuloOrigemAdicional(item: Pick<AdicionalDoAgendamento, 'origem' | 'nome_usuario'>): string {
  if (item.origem === 'cliente_online') return 'Escolhido pelo cliente ao agendar'
  if (item.origem === 'funcionario') return `Incluído por ${item.nome_usuario ?? 'funcionário'}`
  return 'Incluído pela loja'
}

// Catálogo da loja (tela de Serviços). `null` = a migration 095 ainda não
// rodou: a seção não aparece.
export async function carregarAdicionaisDaLoja(idLojista: string): Promise<ServicoAdicional[] | null> {
  const { data, error } = await supabase
    .from('servico_adicional')
    .select(COLUNAS_ADICIONAL)
    .eq('id_lojista', idLojista)
    .is('excluido_em', null)
    .order('created_at', { ascending: false })
  return error ? null : lerAdicionais(data)
}

// O que a loja liberou para o agendamento do cliente.
export async function carregarAdicionaisOnline(idLojista: string): Promise<ServicoAdicional[]> {
  const { data, error } = await supabase
    .from('servico_adicional')
    .select(COLUNAS_ADICIONAL)
    .eq('id_lojista', idLojista)
    .eq('status', 'Ativo')
    .eq('disponivel_online', true)
    .is('excluido_em', null)
    .order('nome')
  return error ? [] : lerAdicionais(data)
}

export interface AdicionaisDoAtendimento {
  itens: AdicionalDoAgendamento[]
  // O que ainda dá para incluir neste atendimento.
  disponiveis: ServicoAdicional[]
  valor: number
  totalAdicionais: number
  pago: boolean
}

// Bloco do detalhe do agendamento (loja) — a mesma conta de
// adicionaisDoAgendamentoAction do site. `null` sem a migration.
export async function carregarAdicionaisDoAtendimento(idAgendamento: string, idLojista: string, podeAlterar: boolean): Promise<AdicionaisDoAtendimento | null> {
  const [ag, itensR, catalogoR] = await Promise.all([
    supabase.from('agendamento').select('id_servico, valor, status_pagamento').eq('id_agendamento', idAgendamento).eq('id_lojista', idLojista).maybeSingle(),
    supabase.from('agendamento_adicional').select(COLUNAS_ADICIONAL_DO_AGENDAMENTO).eq('id_agendamento', idAgendamento).eq('id_lojista', idLojista).order('created_at'),
    supabase.from('servico_adicional').select(COLUNAS_ADICIONAL).eq('id_lojista', idLojista).eq('status', 'Ativo').eq('disponivel_atendimento', true).is('excluido_em', null).order('nome'),
  ])
  if (!ag.data || itensR.error || catalogoR.error) return null
  const itens = ((itensR.data ?? []) as AdicionalDoAgendamento[]).map(i => ({ ...i, preco_unitario: Number(i.preco_unitario), valor_total: Number(i.valor_total) }))
  const ativos = itens.filter(i => i.status === 'ativo')
  const jaNoAgendamento = new Set(ativos.map(i => i.id_adicional))
  const idServico = (ag.data as { id_servico: string }).id_servico
  return {
    itens,
    disponiveis: podeAlterar
      ? lerAdicionais(catalogoR.data).filter(a => adicionalValePara(a, idServico) && !jaNoAgendamento.has(a.id_adicional))
      : [],
    valor: Number((ag.data as { valor: number }).valor),
    totalAdicionais: ativos.reduce((soma, i) => soma + i.valor_total, 0),
    pago: (ag.data as { status_pagamento: string | null }).status_pagamento === 'pago',
  }
}

// Abre a conversa com o cliente no WhatsApp com o texto pronto — quem envia
// é a pessoa, lá. Sem telefone válido, não há link.
export function linkWhatsappCliente(telefone: string | null | undefined, texto: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return null
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(texto)}`
}
