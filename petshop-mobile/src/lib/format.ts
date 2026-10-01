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

// "R$ 1.234,50" — montado à mão (sem Intl) pra sair igual em qualquer
// aparelho, mesmo padrão de formatarReais do TaxiDog.
export function formatarMoeda(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0)
  const [inteiro, centavos] = Math.abs(n).toFixed(2).split('.')
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}R$ ${comPontos},${centavos}`
}

// Só os dígitos, com o 55 na frente — formato do wa.me.
export function linkWhatsApp(telefone: string | null | undefined, texto?: string): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/55${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}
