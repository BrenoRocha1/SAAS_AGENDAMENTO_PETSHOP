// Espelha petshop-app/src/lib/status-agendamento.ts — os status usados
// no banco não mudam entre o dashboard web e o app mobile. Não crie uma
// estrutura de status nova: se um valor não existir aqui, é bug, não
// motivo pra inventar um rótulo novo.
import { statusColors } from '@/theme/colors'

export type StatusAgendamento = 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'

// 'Confirmado' é a etapa "Aceito" e 'Concluído' é "Finalizado" — os
// valores do banco são antigos, o rótulo em tela é o atual. Nunca mostre
// `status` cru na interface.
export const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  Pendente: 'Pendente',
  Confirmado: 'Aceito',
  'Em andamento': 'Em andamento',
  'Concluído': 'Finalizado',
  Cancelado: 'Cancelado',
}

export function rotuloStatus(status: string): string {
  return ROTULO_STATUS[status as StatusAgendamento] ?? status
}

export function coresStatus(status: string) {
  return statusColors[status as StatusAgendamento] ?? statusColors.Pendente
}

// Ainda não terminou nem foi cancelado — mesma regra do web
// (ehEtapaAtiva), usada pra "próximos agendamentos" e contadores do dia.
export function ehEtapaAtiva(status: string): boolean {
  return status === 'Pendente' || status === 'Confirmado' || status === 'Em andamento'
}
