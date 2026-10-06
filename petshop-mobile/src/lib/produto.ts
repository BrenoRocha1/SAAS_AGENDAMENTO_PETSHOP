// Espelha petshop-app/src/lib/produto.ts — rótulos e regras de exibição
// dos produtos da loja. Unidade de venda é fechada (mesmo CHECK do banco).

export type UnidadeVenda = 'unidade' | 'kg' | 'litro' | 'caixa' | 'pacote'

export const UNIDADES_VENDA: { value: UnidadeVenda; label: string; plural: string }[] = [
  { value: 'unidade', label: 'Unidade', plural: 'unidades' },
  { value: 'kg', label: 'Kg', plural: 'kg' },
  { value: 'litro', label: 'Litro', plural: 'litros' },
  { value: 'caixa', label: 'Caixa', plural: 'caixas' },
  { value: 'pacote', label: 'Pacote', plural: 'pacotes' },
]

export function rotuloUnidade(unidade: string): string {
  return UNIDADES_VENDA.find(u => u.value === unidade)?.label ?? unidade
}

// Quem vende por kg/litro às vezes prefere digitar em g/ml. O valor fica
// guardado só na unidade base — a conversão acontece no formulário.
export const SUBUNIDADE: Partial<Record<UnidadeVenda, { label: string; fator: number }>> = {
  kg: { label: 'g', fator: 0.001 },
  litro: { label: 'ml', fator: 0.001 },
}

// Só kg e litro têm fração; unidade, caixa e pacote se contam inteiros.
export function unidadeFracionavel(unidade: string): boolean {
  return unidade === 'kg' || unidade === 'litro'
}

export function erroQuantidadeInteira(unidade: string, ...quantidades: number[]): string | null {
  if (unidadeFracionavel(unidade)) return null
  return quantidades.some(q => !Number.isInteger(q))
    ? `Produto vendido por ${rotuloUnidade(unidade).toLowerCase()}: use números inteiros no estoque.`
    : null
}

// Sem casas decimais desnecessárias: 15 -> "15", 12.5 -> "12,5".
export function formatarQuantidade(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}

// "1 unidade" / "15 unidades" / "12,5 kg".
export function rotuloEstoque(quantidade: number, unidade: string): string {
  const u = UNIDADES_VENDA.find(x => x.value === unidade)
  const nome = quantidade === 1 ? u?.label.toLowerCase() : u?.plural
  return `${formatarQuantidade(quantidade)} ${nome ?? unidade}`
}

export type StatusEstoque = 'zerado' | 'baixo' | 'em_estoque'

// estoque_minimo = 0 é "sem limite definido" — nunca cai em "baixo".
export function statusEstoque(estoqueAtual: number, estoqueMinimo: number): StatusEstoque {
  if (estoqueAtual <= 0) return 'zerado'
  if (estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo) return 'baixo'
  return 'em_estoque'
}

export const ROTULO_STATUS_ESTOQUE: Record<StatusEstoque, string> = {
  zerado: 'Zerado',
  baixo: 'Baixo',
  em_estoque: 'Em estoque',
}
