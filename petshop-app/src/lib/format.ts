// Helpers de formatação de exibição. Os dados ficam salvos só com
// dígitos no banco (telefone, cpf) — a máscara é sempre cosmética,
// aplicada na hora de mostrar na tela.

export function formatarTelefone(telefone: string | null | undefined): string {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return telefone ?? ''
}

export function formatarCpf(cpf: string | null | undefined): string {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return cpf ?? ''
}
