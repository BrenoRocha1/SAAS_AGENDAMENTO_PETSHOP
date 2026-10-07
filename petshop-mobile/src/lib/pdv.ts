// ============================================================
// PDV (frente de caixa) — tipos e regras de cálculo (migration 083)
// ============================================================
// Cópia de petshop-app/src/lib/pdv.ts — mudou lá, muda aqui.
//
// O preço e o estoque que valem são sempre os do banco: o app só manda
// "qual produto" e "quanto". Estes helpers existem pra a tela mostrar o
// total antes de enviar (e conferem com o que o banco fecha).

import type { FormaPagamento } from '@/lib/pagamento'

export interface ProdutoPdv {
  id_produto: string
  nome: string
  id_categoria: string | null
  unidade_venda: string
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  foto_url: string | null
}

export interface ItemCarrinho {
  produto: ProdutoPdv
  quantidade: number
}

export interface ClientePdv {
  id_cliente: string
  nome: string
  telefone: string
}

export type TipoDesconto = 'valor' | 'percentual'

export interface DescontoPdv {
  tipo: TipoDesconto
  // Número digitado (R$ ou %), já convertido.
  valor: number
}

export const SEM_DESCONTO: DescontoPdv = { tipo: 'valor', valor: 0 }

// Arredonda em centavos (evita 0,1 + 0,2 = 0,30000000000000004).
export const centavos = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

export const subtotalLinha = (item: ItemCarrinho): number =>
  centavos(item.produto.preco_venda * item.quantidade)

export const subtotalCarrinho = (itens: ItemCarrinho[]): number =>
  centavos(itens.reduce((soma, i) => soma + subtotalLinha(i), 0))

// Desconto em R$, nunca maior que o subtotal (percentual limitado a 100%).
export function descontoEmReais(subtotal: number, d: DescontoPdv): number {
  if (!(d.valor > 0) || !(subtotal > 0)) return 0
  const bruto = d.tipo === 'percentual' ? subtotal * (Math.min(d.valor, 100) / 100) : d.valor
  return centavos(Math.min(bruto, subtotal))
}

export const totalVenda = (subtotal: number, descontoReais: number): number =>
  centavos(Math.max(subtotal - descontoReais, 0))

// kg e litro aceitam fração (e andam de 0,1 em 0,1 no botão +/−); o resto
// se conta inteiro.
export const passoQuantidade = (unidade: string): number =>
  unidade === 'kg' || unidade === 'litro' ? 0.1 : 1

export const arredondarQuantidade = (n: number): number => Math.round(n * 1000) / 1000

// "2" / "0,5 kg" — vírgula decimal, como o resto do app.
export function textoQuantidade(quantidade: number, unidade: string): string {
  const n = String(arredondarQuantidade(quantidade)).replace('.', ',')
  return unidade === 'unidade' ? n : `${n} ${unidade}`
}

// Sugestões de "valor recebido" pro troco: o valor exato e as notas
// redondas que cobrem o total (as 3 mais próximas).
export function sugestoesRecebido(total: number): number[] {
  const notas = [5, 10, 20, 50, 100, 200]
  const maiores = notas.filter(n => n >= total)
  const arredondadas = [Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50]
  const unicas = Array.from(new Set([...maiores, ...arredondadas].filter(v => v > total && v <= total + 200)))
    .sort((a, b) => a - b)
    .slice(0, 3)
  return [centavos(total), ...unicas]
}

// Interpreta "12,50" / "12.50" / "1.250,00" digitado no campo de dinheiro.
export function lerValorDigitado(texto: string): number {
  const limpo = texto.trim().replace(/[^\d.,]/g, '')
  if (!limpo) return 0
  const temVirgula = limpo.includes(',')
  const normal = temVirgula ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = parseFloat(normal)
  return Number.isFinite(n) ? n : 0
}

export interface VendaRegistrada {
  id_venda: string
  numero: number
  total: number
  troco: number
}

// O que vai para fn_registrar_venda_pdv.
export interface EntradaVendaPdv {
  itens: { id_produto: string; quantidade: number }[]
  desconto: number
  forma: FormaPagamento
  valorRecebido: number | null
  idCliente: string | null
}

export type StatusVenda = 'concluida' | 'cancelada'

// Linha do histórico (venda + itens).
export interface VendaHistorico {
  id_venda: string
  numero: number
  created_at: string
  cliente_nome: string | null
  subtotal: number
  desconto: number
  total: number
  forma_pagamento: FormaPagamento
  valor_recebido: number | null
  troco: number | null
  status: StatusVenda
  operador_nome: string | null
  cancelada_em: string | null
  cancelada_motivo: string | null
  itens: {
    id_item: string
    produto_nome: string
    unidade_venda: string
    quantidade: number
    preco_unitario: number
    subtotal: number
  }[]
}

// "#0042"
export const rotuloNumeroVenda = (numero: number): string => `#${String(numero).padStart(4, '0')}`

// Mensagem de erro das funções do PDV no banco: as de regra ("PDV: ...") já
// vêm prontas pra mostrar (o mesmo tratamento de actions-pdv.ts do site).
export function mensagemPdv(error: { message?: string; code?: string } | null, padrao: string): string {
  const msg = error?.message ?? ''
  if (error?.code === 'PGRST202' || /Could not find the function|does not exist|schema cache/i.test(msg)) {
    return 'O caixa ainda não foi ativado no sistema da loja. Avise o responsável.'
  }
  const m = msg.match(/PDV: ([^\n]+)/)
  return m ? m[1] : padrao
}

// Data e hora de uma venda no horário de Brasília (UTC−3, sem horário de
// verão desde 2019) — sem depender do fuso do aparelho. "07/10 14:32", ou só
// "14:32" quando a lista é de um dia só; `comAno` dá "07/10/2026 14:32".
export function dataHoraVenda(iso: string | Date, comData: boolean, comAno = false): string {
  const d = new Date((typeof iso === 'string' ? Date.parse(iso) : iso.getTime()) - 3 * 60 * 60 * 1000)
  const dois = (n: number) => String(n).padStart(2, '0')
  const hora = `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`
  if (!comData) return hora
  const dia = `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}`
  return `${dia}${comAno ? `/${d.getUTCFullYear()}` : ''} ${hora}`
}
