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

// Endereço da loja numa linha: "Rua X, 308 · Sala 2 · Bairro · Cidade - UF".
// `endereco` é a rua (migration 045 separou número, complemento e
// bairro); loja antiga sem `numero` mostra o texto livre como estava.
export function formatarEnderecoLoja(l: {
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
}): string {
  const rua = [l.endereco?.trim(), l.numero?.trim()].filter(Boolean).join(', ')
  const cidade = [l.cidade?.trim(), l.estado?.trim()].filter(Boolean).join(' - ')
  return [rua, l.complemento?.trim(), l.bairro?.trim(), cidade].filter(Boolean).join(' · ')
}
