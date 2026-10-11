// Informações fiscais do produto (migration 094) — as mesmas do site
// (petshop-app/src/lib/fiscal.ts). Quem valida e grava é o site, pela action
// do produto; aqui ficam só os tipos e a tabela de origem.

export interface ProdutoFiscal {
  codigo_barras: string | null
  ncm: string | null
  cest: string | null
  cfop: string | null
  origem: number | null
  cst_csosn: string | null
}

export const ORIGENS_MERCADORIA: { valor: string; rotulo: string }[] = [
  { valor: '', rotulo: 'Não informada' },
  { valor: '0', rotulo: '0 — Nacional' },
  { valor: '1', rotulo: '1 — Estrangeira, importação direta' },
  { valor: '2', rotulo: '2 — Estrangeira, adquirida no mercado interno' },
  { valor: '3', rotulo: '3 — Nacional, conteúdo de importação acima de 40%' },
  { valor: '4', rotulo: '4 — Nacional, processos produtivos básicos' },
  { valor: '5', rotulo: '5 — Nacional, conteúdo de importação até 40%' },
  { valor: '6', rotulo: '6 — Estrangeira, importação direta, sem similar nacional' },
  { valor: '7', rotulo: '7 — Estrangeira, mercado interno, sem similar nacional' },
  { valor: '8', rotulo: '8 — Nacional, conteúdo de importação acima de 70%' },
]
