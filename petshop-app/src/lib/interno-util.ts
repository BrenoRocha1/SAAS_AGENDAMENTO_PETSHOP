import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

export function dataBRFmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return format(new Date(iso), 'dd/MM/yyyy', { locale: ptBR })
}

export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

export function telefoneBR(t: string | null | undefined): string {
  const d = (t ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t ?? '—'
}
