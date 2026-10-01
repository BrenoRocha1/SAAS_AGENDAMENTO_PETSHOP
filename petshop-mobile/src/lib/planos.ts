// Espelha petshop-app/src/lib/planos.ts — planos e cobranças recorrentes
// (migration 060). Os dados vêm das funções fn_* do banco já em JSON;
// aqui ficam os formatos, os rótulos e as regras de exibição.

export type Periodicidade = 'mensal' | 'quinzenal' | 'trimestral' | 'semestral' | 'anual' | 'personalizado'
export type StatusCobrancaPlano = 'pendente' | 'pago' | 'cancelado'
// "vencido" não é gravado: é a cobrança pendente com vencimento passado.
export type StatusCobrancaExibido = StatusCobrancaPlano | 'vencido'

export const PERIODICIDADES: { valor: Periodicidade; rotulo: string }[] = [
  { valor: 'mensal', rotulo: 'Mensal' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'trimestral', rotulo: 'Trimestral' },
  { valor: 'semestral', rotulo: 'Semestral' },
  { valor: 'anual', rotulo: 'Anual' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
]

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

export function statusCobrancaExibido(status: string, vencimento: string, hojeISO: string): StatusCobrancaExibido {
  if (status === 'pendente' && vencimento < hojeISO) return 'vencido'
  if (status === 'pago' || status === 'cancelado') return status
  return 'pendente'
}

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
}

export interface CobrancaDaLoja {
  id_cobranca: string
  id_assinatura: string
  plano: string
  id_cliente: string | null
  cliente: string | null
  pet: string | null
  numero: number
  valor: number
  vencimento: string
  forma_pagamento: string | null
  status: StatusCobrancaPlano
  pago_em: string | null
  periodo_inicio: string
  periodo_fim: string
  assinatura_status: 'ativa' | 'cancelada'
}

// fn_beneficios_do_pet
export interface PlanoDoPet {
  id_assinatura: string
  plano: string
  periodo_inicio: string | null
  periodo_fim: string | null
  proxima_cobranca: string | null
  beneficios: { id_servico: string; servico: string; quantidade: number; usados: number }[]
}

// fn_cancelar_assinatura (migration 069)
export interface ResumoCancelamento {
  cobrancas_canceladas: number
  valor_cancelado: number
  agendamentos_devolvidos: number
}
