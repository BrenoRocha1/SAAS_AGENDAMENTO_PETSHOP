// ============================================================
// Planos e cobranças recorrentes (migration 060) — tipos e rótulos
// ============================================================
// Os dados vêm das funções fn_* do banco já em JSON; aqui ficam só os
// formatos, os nomes que aparecem na tela e as regras de exibição.

export type Periodicidade = 'mensal' | 'quinzenal' | 'trimestral' | 'semestral' | 'anual' | 'personalizado'
export type StatusCobrancaPlano = 'pendente' | 'pago' | 'cancelado'
// "vencido" não é gravado: é a cobrança pendente com vencimento passado.
export type StatusCobrancaExibido = StatusCobrancaPlano | 'vencido'

export const PERIODICIDADES: { value: Periodicidade; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'quinzenal', label: 'A cada 15 dias' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'personalizado', label: 'Personalizado' },
]

export function rotuloPeriodicidade(p: string, intervaloDias?: number | null): string {
  if (p === 'personalizado') return intervaloDias ? `A cada ${intervaloDias} dias` : 'Personalizado'
  return PERIODICIDADES.find(x => x.value === p)?.label ?? p
}

// "/mês", "/15 dias"… pra ficar ao lado do valor.
export function sufixoPeriodo(p: string, intervaloDias?: number | null): string {
  switch (p) {
    case 'mensal': return '/mês'
    case 'quinzenal': return '/15 dias'
    case 'trimestral': return '/trimestre'
    case 'semestral': return '/semestre'
    case 'anual': return '/ano'
    default: return intervaloDias ? `/${intervaloDias} dias` : ''
  }
}

export const ROTULO_STATUS_COBRANCA: Record<StatusCobrancaExibido, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

export const CLASSE_STATUS_COBRANCA: Record<StatusCobrancaExibido, string> = {
  pendente: 'badge-pendente',
  pago: 'badge-concluido',
  vencido: 'badge-cancelado',
  cancelado: 'badge-inativo',
}

export function statusCobrancaExibido(status: string, vencimento: string, hojeISO: string): StatusCobrancaExibido {
  if (status === 'pendente' && vencimento < hojeISO) return 'vencido'
  if (status === 'pago' || status === 'cancelado') return status
  return 'pendente'
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// ── Formatos que as funções do banco devolvem ──
export interface ServicoDoPlano { id_servico: string; servico: string; quantidade: number }

export interface Plano {
  id_plano: string
  nome: string
  descricao: string | null
  valor: number
  periodicidade: Periodicidade
  intervalo_dias: number | null
  ativo: boolean
  servicos: ServicoDoPlano[]
  assinaturas_ativas: number
}

export interface BeneficioPeriodo { servico: string; quantidade: number; usados: number }

export interface CobrancaPlano {
  id_cobranca: string
  numero: number
  valor: number
  vencimento: string
  forma_pagamento: string | null
  status: StatusCobrancaPlano
  pago_em: string | null
  periodo_inicio: string
  periodo_fim: string
}

export interface UtilizacaoPlano {
  servico: string
  data: string | null
  hora: string | null
  periodo: number
  funcionario: string | null
  estornada_em: string | null
  motivo_estorno: string | null
  registrado_em: string
}

export interface HistoricoPlano { tipo: string; descricao: string; em: string }

export interface Assinatura {
  id_assinatura: string
  id_plano: string
  plano: string
  id_cliente: string | null
  cliente: string | null
  id_pet: string | null
  pet: string | null
  valor: number
  periodicidade: Periodicidade
  intervalo_dias: number | null
  data_inicio: string
  forma_pagamento: string | null
  status: 'ativa' | 'cancelada'
  cancelada_em: string | null
  motivo_cancelamento: string | null
  periodo_atual: { numero: number; inicio: string; fim: string; beneficios: BeneficioPeriodo[] } | null
  proxima_cobranca: string | null
  cobrancas_em_aberto: number
  cobrancas_vencidas: number
  // Só com detalhes (tela do cliente).
  cobrancas?: CobrancaPlano[] | null
  utilizacoes?: UtilizacaoPlano[] | null
  historico?: HistoricoPlano[] | null
}

export interface CobrancaDaLoja extends CobrancaPlano {
  id_assinatura: string
  plano: string
  id_cliente: string | null
  cliente: string | null
  pet: string | null
  assinatura_status: 'ativa' | 'cancelada'
}

// fn_beneficios_do_pet
export interface PlanoDoPet {
  id_assinatura: string
  plano: string
  id_periodo: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  proxima_cobranca: string | null
  beneficios: { id_servico: string; servico: string; quantidade: number; usados: number }[]
}

// fn_beneficio_do_agendamento
export interface BeneficioDoAgendamento {
  usado: { id_utilizacao: string; plano: string; valor_abatido: number; em: string } | null
  disponivel: { id_assinatura: string; plano: string; quantidade: number; usados: number } | null
}

// Resumo do Dashboard (fn_resumo_planos)
export interface ResumoPlanos {
  tem_planos: boolean
  ativas: number
  receita_mensal: number
  pendentes_qtd: number
  pendentes_valor: number
  vencidas_qtd: number
  vencidas_valor: number
  utilizacoes_mes: number
  proximas: { data: string; cliente: string | null; id_cliente: string | null; pet: string | null; plano: string; valor: number }[]
}

// Relatório de Vendas (fn_relatorio_planos)
export interface RelatorioPlanos {
  tem_planos: boolean
  ativas: number
  receita_mensal: number
  receita_periodo: number
  pagas_qtd: number
  pagas_valor: number
  pendentes_qtd: number
  pendentes_valor: number
  vencidas_qtd: number
  vencidas_valor: number
  planos: { plano: string; ativas: number; novas: number; receita: number }[]
  servicos: { servico: string; usos: number }[]
}

// Mensagem do banco sem o prefixo técnico.
export function mensagemErroPlano(msg: string | undefined, padrao: string): string {
  if (!msg) return padrao
  if (/fn_\w+|does not exist|schema cache/i.test(msg)) return 'Para usar planos, execute a migration 060_planos_assinaturas.sql.'
  return msg
}
