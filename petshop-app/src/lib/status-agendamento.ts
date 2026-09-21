// ============================================================
// Status do agendamento — etapas do atendimento
// ============================================================
// As etapas que o lojista vê são Pendente → Aceito → Em andamento →
// Finalizado (mais Cancelado, que sai do fluxo).
//
// Dois valores do banco têm nome diferente do rótulo na tela, porque já
// existiam antes destas etapas e renomear um valor de enum quebraria as
// dezenas de funções SQL que comparam com eles:
//   'Confirmado' é a etapa "Aceito"
//   'Concluído'  é a etapa "Finalizado"
// Por isso nada deve mostrar `status` cru na interface — use ROTULO_STATUS.

export type StatusAgendamento =
  | 'Pendente'
  | 'Confirmado'
  | 'Em andamento'
  | 'Concluído'
  | 'Cancelado'

export const ROTULO_STATUS: Record<StatusAgendamento, string> = {
  Pendente: 'Pendente',
  Confirmado: 'Aceito',
  'Em andamento': 'Em andamento',
  'Concluído': 'Finalizado',
  Cancelado: 'Cancelado',
}

export const CLASSE_BADGE_STATUS: Record<StatusAgendamento, string> = {
  Pendente: 'badge-pendente',
  Confirmado: 'badge-aceito',
  'Em andamento': 'badge-em-andamento',
  'Concluído': 'badge-concluido',
  Cancelado: 'badge-cancelado',
}

// A etapa seguinte de cada uma, e o verbo do botão que leva até ela.
// `null` = fim da linha (Finalizado e Cancelado não avançam).
// "as const satisfies" (em vez de só o Record) preserva o literal de
// cada `status` (ex.: PROXIMA_ETAPA.Pendente.status é o tipo 'Confirmado',
// não o StatusAgendamento genérico) — sem isso, todo lugar que usa
// PROXIMA_ETAPA[x]!.status pra chamar uma função com union mais estreita
// (ex.: KanbanItem['status'], que não inclui 'Cancelado') precisaria de
// um cast manual.
export const PROXIMA_ETAPA = {
  Pendente: { status: 'Confirmado', acao: 'Aceitar' },
  Confirmado: { status: 'Em andamento', acao: 'Iniciar atendimento' },
  'Em andamento': { status: 'Concluído', acao: 'Finalizar' },
  'Concluído': null,
  Cancelado: null,
} as const satisfies Record<StatusAgendamento, { status: StatusAgendamento; acao: string } | null>

export function rotuloStatus(status: string): string {
  return ROTULO_STATUS[status as StatusAgendamento] ?? status
}

export function classeBadgeStatus(status: string): string {
  return CLASSE_BADGE_STATUS[status as StatusAgendamento] ?? 'badge-pendente'
}

// Cor sólida de cada etapa (var(--status-*-solid) do globals.css), pra
// usar como inline style (ex.: borda lateral de um item de lista) —
// nunca monte esse tom concatenando o texto do status num nome de
// classe: "Em andamento" tem espaço, e um espaço dentro de className
// vira DOIS seletores, não um só.
export const COR_SOLIDA_STATUS: Record<StatusAgendamento, string> = {
  Pendente: 'var(--status-aguardando-solid)',
  Confirmado: 'var(--status-aceito-solid)',
  'Em andamento': 'var(--status-andamento-solid)',
  'Concluído': 'var(--status-concluido-solid)',
  Cancelado: 'var(--status-cancelado-solid)',
}

export function corSolidaStatus(status: string): string {
  return COR_SOLIDA_STATUS[status as StatusAgendamento] ?? COR_SOLIDA_STATUS.Pendente
}

// Posição de cada etapa na linha do tempo do atendimento — usada pra
// impedir voltar uma etapa já passada (ex.: arrastar um card de
// "Finalizado" de volta pra "Em andamento" no Kanban, ou qualquer outro
// retrocesso). 'Cancelado' fica fora: é um desvio da linha do tempo, não
// uma etapa anterior às outras.
export const ORDEM_ETAPA: Record<'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído', number> = {
  Pendente: 1,
  Confirmado: 2,
  'Em andamento': 3,
  'Concluído': 4,
}

// Uma vez finalizado ou cancelado, o status não muda mais por nenhum
// caminho (drag-and-drop, botão ou chamada direta da Server Action).
export function etapaEncerrada(status: string): boolean {
  return status === 'Concluído' || status === 'Cancelado'
}

// Ainda não terminou nem foi cancelado — cobre as 3 etapas antes de
// "Finalizado". Usado pra somar "a receber", achar o próximo
// agendamento de um cliente/pet etc. Continua valendo pros dados
// antigos: quem estava em 'Confirmado' antes desta etapa existir também
// é "ainda ativo".
export function ehEtapaAtiva(status: string): boolean {
  return status === 'Pendente' || status === 'Confirmado' || status === 'Em andamento'
}
