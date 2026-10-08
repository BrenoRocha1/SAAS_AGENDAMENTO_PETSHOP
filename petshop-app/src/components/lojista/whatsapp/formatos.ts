// Datas e horas da central de WhatsApp, sempre no horário de Brasília —
// igual no servidor e no navegador, pra tela não mudar depois de carregar.
const FUSO = 'America/Sao_Paulo'

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const fmtChave = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' })
const fmtDiaMesAno = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: '2-digit' })
const fmtLongo = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: 'long' })
const fmtLongoAno = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: 'long', year: 'numeric' })

const UM_DIA = 24 * 60 * 60 * 1000

// "2026-10-08": o dia, para comparar e agrupar.
export function chaveDoDia(data: string | Date): string {
  return fmtChave.format(typeof data === 'string' ? new Date(data) : data)
}

export function horaDe(iso: string): string {
  return fmtHora.format(new Date(iso))
}

// Na lista de conversas: a hora se foi hoje, "Ontem", ou a data.
export function quandoNaLista(iso: string | null, agora: Date = new Date()): string {
  if (!iso) return ''
  const data = new Date(iso)
  const dia = chaveDoDia(data)
  if (dia === chaveDoDia(agora)) return fmtHora.format(data)
  if (dia === chaveDoDia(new Date(agora.getTime() - UM_DIA))) return 'Ontem'
  return dia.slice(0, 4) === chaveDoDia(agora).slice(0, 4) ? fmtDiaMes.format(data) : fmtDiaMesAno.format(data)
}

// Separador de dia dentro da conversa: "Hoje", "Ontem", "07 de outubro".
export function rotuloDoDia(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso)
  const dia = chaveDoDia(data)
  if (dia === chaveDoDia(agora)) return 'Hoje'
  if (dia === chaveDoDia(new Date(agora.getTime() - UM_DIA))) return 'Ontem'
  return dia.slice(0, 4) === chaveDoDia(agora).slice(0, 4) ? fmtLongo.format(data) : fmtLongoAno.format(data)
}

// "2026-10-10" → "10/10" (datas de agendamento, que já vêm sem hora).
export function dataCurta(dataISO: string): string {
  const [, mes, dia] = dataISO.slice(0, 10).split('-')
  return `${dia}/${mes}`
}
