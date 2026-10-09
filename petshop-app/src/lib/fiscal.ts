// Informações fiscais do produto (migration 094) — base para a futura
// integração fiscal (NFC-e / NF-e). Não é um arquivo 'use server'.

export interface ProdutoFiscal {
  codigo_barras: string | null
  ncm: string | null
  cest: string | null
  cfop: string | null
  origem: number | null
  cst_csosn: string | null
}

// Tabela "Origem da mercadoria" do ICMS.
export const ORIGENS_MERCADORIA: { valor: number; rotulo: string }[] = [
  { valor: 0, rotulo: '0 — Nacional' },
  { valor: 1, rotulo: '1 — Estrangeira, importação direta' },
  { valor: 2, rotulo: '2 — Estrangeira, adquirida no mercado interno' },
  { valor: 3, rotulo: '3 — Nacional, conteúdo de importação acima de 40%' },
  { valor: 4, rotulo: '4 — Nacional, processos produtivos básicos' },
  { valor: 5, rotulo: '5 — Nacional, conteúdo de importação até 40%' },
  { valor: 6, rotulo: '6 — Estrangeira, importação direta, sem similar nacional' },
  { valor: 7, rotulo: '7 — Estrangeira, mercado interno, sem similar nacional' },
  { valor: 8, rotulo: '8 — Nacional, conteúdo de importação acima de 70%' },
]

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

// GTIN/EAN (8, 12, 13 ou 14 dígitos) com o dígito verificador certo.
export function gtinValido(codigo: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(codigo)) return false
  const digitos = codigo.split('').map(Number)
  const verificador = digitos.pop()!
  const soma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === verificador
}

export function formatarNcm(ncm: string | null | undefined): string {
  const d = soDigitos(ncm)
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : d
}

// Lê os campos "fiscal_*" do formulário do produto. null = o formulário não
// tem a seção (nada a gravar); { erro } = algum campo inválido.
export function lerFiscalDoForm(formData: FormData): { dados: ProdutoFiscal } | { erro: string } | null {
  if (formData.get('fiscal_presente') !== '1') return null
  const codigo_barras = soDigitos(formData.get('fiscal_codigo_barras')) || null
  const ncm = soDigitos(formData.get('fiscal_ncm')) || null
  const cest = soDigitos(formData.get('fiscal_cest')) || null
  const cfop = soDigitos(formData.get('fiscal_cfop')) || null
  const cst_csosn = soDigitos(formData.get('fiscal_cst_csosn')) || null
  const origemTexto = String(formData.get('fiscal_origem') ?? '').trim()
  const origem = origemTexto === '' ? null : Number(origemTexto)

  if (codigo_barras && !gtinValido(codigo_barras)) return { erro: 'Código de barras inválido: confira os números (GTIN/EAN de 8, 12, 13 ou 14 dígitos).' }
  if (ncm && ncm.length !== 8) return { erro: 'O NCM tem 8 dígitos.' }
  if (cest && cest.length !== 7) return { erro: 'O CEST tem 7 dígitos.' }
  if (cfop && cfop.length !== 4) return { erro: 'O CFOP tem 4 dígitos.' }
  if (cst_csosn && (cst_csosn.length < 2 || cst_csosn.length > 3)) return { erro: 'O CST/CSOSN tem 2 ou 3 dígitos.' }
  if (origem !== null && !(Number.isInteger(origem) && origem >= 0 && origem <= 8)) return { erro: 'Origem da mercadoria inválida.' }

  return { dados: { codigo_barras, ncm, cest, cfop, origem, cst_csosn } }
}
