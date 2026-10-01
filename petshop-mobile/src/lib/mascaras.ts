// Máscaras e conversões dos campos de formulário. O que vai pro banco é
// sempre o valor "limpo" (só dígitos, número, data ISO) — a máscara é só
// pra quem digita.

export const soDigitos = (texto: string): string => texto.replace(/\D/g, '')

// "(11) 98765-4321" enquanto digita.
export function mascaraTelefone(texto: string): string {
  const d = soDigitos(texto).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// "123.456.789-01"
export function mascaraCpf(texto: string): string {
  const d = soDigitos(texto).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

// "01310-100"
export function mascaraCep(texto: string): string {
  const d = soDigitos(texto).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// "25/12/2026" enquanto digita.
export function mascaraData(texto: string): string {
  const d = soDigitos(texto).slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// "25/12/2026" -> "2026-12-25" (null se não for uma data de verdade).
export function dataParaISO(texto: string): string | null {
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dia, mes, ano] = m
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)))
  const confere = d.getUTCFullYear() === Number(ano) && d.getUTCMonth() === Number(mes) - 1 && d.getUTCDate() === Number(dia)
  return confere ? `${ano}-${mes}-${dia}` : null
}

// "2026-12-25" -> "25/12/2026"
export function isoParaData(iso: string | null | undefined): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// "09:30" enquanto digita.
export function mascaraHora(texto: string): string {
  const d = soDigitos(texto).slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d
}

export function horaValida(texto: string): boolean {
  const m = texto.match(/^(\d{2}):(\d{2})$/)
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60
}

// "12,5" ou "12.5" -> 12.5 (NaN se não for número).
export function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.')
  return limpo === '' ? NaN : Number(limpo)
}

// 80 -> "80,00" (para preencher campo de preço).
export function numeroParaCampo(n: number | string | null | undefined, casas = 2): string {
  if (n === null || n === undefined || n === '') return ''
  const v = Number(n)
  return Number.isFinite(v) ? v.toFixed(casas).replace('.', ',') : ''
}
