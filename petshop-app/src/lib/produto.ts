// ============================================================
// Produtos vendidos pela loja — rótulos e regras de exibição
// ============================================================
// Categoria e unidade de venda são um conjunto fechado (mesmo CHECK da
// migration 037) — mantenha esta lista sincronizada com o banco.

export type CategoriaProduto = 'Ração' | 'Brinquedos' | 'Higiene' | 'Acessórios' | 'Outros'

export const CATEGORIAS_PRODUTO: CategoriaProduto[] = ['Ração', 'Brinquedos', 'Higiene', 'Acessórios', 'Outros']

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

// Sem casas decimais desnecessárias: 15 -> "15", 12.5 -> "12.5" (mesma
// convenção sem localização que o resto do app usa pra número — ver
// "R$ {valor.toFixed(2)}" espalhado pelas telas de agendamento).
export function formatarQuantidade(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

// "15 unidades" / "12.5 kg" — usa o plural cadastrado (kg não muda).
export function rotuloEstoque(quantidade: number, unidade: string): string {
  const u = UNIDADES_VENDA.find(x => x.value === unidade)
  return `${formatarQuantidade(quantidade)} ${u?.plural ?? unidade}`
}

// estoque_minimo = 0 é "sem limite definido" — nunca dispara o aviso.
export function estoqueBaixo(estoqueAtual: number, estoqueMinimo: number): boolean {
  return estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo
}
