// Espelha petshop-app/src/lib/format.ts — mesma máscara de exibição, o
// dado no banco continua só com dígitos.
export function formatarTelefone(telefone: string | null | undefined): string {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone ?? ''
}

export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()
}
