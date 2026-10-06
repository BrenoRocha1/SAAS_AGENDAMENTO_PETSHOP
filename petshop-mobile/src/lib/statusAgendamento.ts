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

// Passou do horário e o atendimento nem começou (pendente ou aceito). Só
// vale para o dia de hoje; `agora` e `hora` em 'HH:MM' no fuso da loja.
export function ehAtrasado(status: string, hora: string, agora: string): boolean {
  return (status === 'Pendente' || status === 'Confirmado') && hora.slice(0, 5) < agora
}

// A etapa seguinte de cada uma, e o verbo do botão que leva até ela.
// `null` = fim da linha (Finalizado e Cancelado não avançam).
export const PROXIMA_ETAPA: Record<StatusAgendamento, { status: StatusAgendamento; acao: string } | null> = {
  Pendente: { status: 'Confirmado', acao: 'Aceitar' },
  Confirmado: { status: 'Em andamento', acao: 'Iniciar atendimento' },
  'Em andamento': { status: 'Concluído', acao: 'Finalizar' },
  'Concluído': null,
  Cancelado: null,
}

// Iniciar e finalizar só a partir do dia do agendamento — um atendimento
// de data futura ainda não aconteceu (aceitar vale a qualquer momento).
export function etapaExigeDia(status: string): boolean {
  return status === 'Em andamento' || status === 'Concluído'
}

export function podeAvancarEtapa(statusAtual: string, dtAgendamento: string, hojeISO: string): boolean {
  const proxima = PROXIMA_ETAPA[statusAtual as StatusAgendamento]
  return !!proxima && (!etapaExigeDia(proxima.status) || dtAgendamento <= hojeISO)
}

// Posição de cada etapa na linha do tempo — impede voltar uma etapa.
export const ORDEM_ETAPA: Record<'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído', number> = {
  Pendente: 1,
  Confirmado: 2,
  'Em andamento': 3,
  'Concluído': 4,
}

// Finalizado ou cancelado: o status não muda mais.
export function etapaEncerrada(status: string): boolean {
  return status === 'Concluído' || status === 'Cancelado'
}
