
export const TAMANHO_PAGINA = 25

// Tira o que quebraria o filtro .or() do PostgREST (vírgula, parênteses,
// curinga) antes de usar o texto digitado numa busca.
export function termoSeguro(v: string | undefined): string {
  return (v ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 80)
}

export function numeroPagina(v: string | undefined): number {
  const n = parseInt(v ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

// Sempre no horário de Brasília: o servidor (Vercel) roda em UTC e mostraria
// o dia/hora errados perto da meia-noite.
const FUSO = 'America/Sao_Paulo'
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false })

export function dataBRFmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return fmtData.format(new Date(iso))
}

export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${fmtData.format(d)} às ${fmtHora.format(d)}`
}

export function telefoneBR(t: string | null | undefined): string {
  const d = (t ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t ?? '—'
}
