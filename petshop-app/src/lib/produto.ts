// ============================================================
// Produtos vendidos pela loja — rótulos e regras de exibição
// ============================================================
// Categoria agora é criada pela própria loja (tabela categoria_produto,
// migration 038) — não é mais uma lista fixa aqui. Unidade de venda
// continua fechada (mesmo CHECK do banco); mantenha esta lista
// sincronizada se ela mudar.

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

// Sub-unidade menor pra digitar quantidades pequenas sem casa decimal
// (ex.: "500" em vez de "0,5") — só existe pra kg/litro, porque só eles
// têm uma fração de uso comum (grama, mililitro). O estoque continua
// guardado só na unidade base (kg/litro) — a conversão acontece no
// formulário, antes de enviar pro servidor.
export const SUBUNIDADE: Partial<Record<UnidadeVenda, { label: string; fator: number }>> = {
  kg: { label: 'g', fator: 0.001 },
  litro: { label: 'ml', fator: 0.001 },
}

// Só kg e litro têm fração; unidade, caixa e pacote se contam inteiros
// (não existe "2,5 caixas" no estoque).
export function unidadeFracionavel(unidade: string): boolean {
  return unidade === 'kg' || unidade === 'litro'
}

// Mensagem de erro se alguma quantidade tiver fração numa unidade que se
// conta inteira; null se estiver tudo certo.
export function erroQuantidadeInteira(unidade: string, ...quantidades: number[]): string | null {
  if (unidadeFracionavel(unidade)) return null
  return quantidades.some(q => !Number.isInteger(q))
    ? `Produto vendido por ${rotuloUnidade(unidade).toLowerCase()}: use números inteiros no estoque.`
    : null
}

// Sem casas decimais desnecessárias: 15 -> "15", 12.5 -> "12.5" (mesma
// convenção sem localização que o resto do app usa pra número — ver
// "R$ {valor.toFixed(2)}" espalhado pelas telas de agendamento).
export function formatarQuantidade(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

// "1 unidade" / "15 unidades" / "12.5 kg" — usa o plural cadastrado (kg não muda).
export function rotuloEstoque(quantidade: number, unidade: string): string {
  const u = UNIDADES_VENDA.find(x => x.value === unidade)
  const nome = quantidade === 1 ? u?.label.toLowerCase() : u?.plural
  return `${formatarQuantidade(quantidade)} ${nome ?? unidade}`
}

export type StatusEstoque = 'zerado' | 'baixo' | 'em_estoque'

// estoque_minimo = 0 é "sem limite definido" — nunca cai em "baixo",
// só em "zerado" quando realmente chegar a 0.
export function statusEstoque(estoqueAtual: number, estoqueMinimo: number): StatusEstoque {
  if (estoqueAtual <= 0) return 'zerado'
  if (estoqueMinimo > 0 && estoqueAtual <= estoqueMinimo) return 'baixo'
  return 'em_estoque'
}

export const ROTULO_STATUS_ESTOQUE: Record<StatusEstoque, string> = {
  zerado: 'Zerado',
  baixo: 'Baixo',
  em_estoque: 'Em Estoque',
}

export const BADGE_STATUS_ESTOQUE: Record<StatusEstoque, string> = {
  zerado: 'badge-zerado',
  baixo: 'badge-estoque-baixo',
  em_estoque: 'badge-ativo',
}
