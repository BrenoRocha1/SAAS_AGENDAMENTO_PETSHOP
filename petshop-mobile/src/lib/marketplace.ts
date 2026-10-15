// Marketplace de produtos (migration 098) — o mesmo de
// petshop-app/src/lib/marketplace.ts: busca sem acento, ordem e preço.

import { precoComDesconto, promoVigente, type Promocao } from '@/lib/promocao'
import { rotuloUnidade } from '@/lib/produto'

export interface LojaMarketplace {
  id: string
  nome: string
  logoUrl: string | null
  // "Mauá, SP"
  local: string
  status: { rotulo: string; aberto: boolean }
  telefone: string | null
}

export interface ProdutoMarketplace extends Partial<Promocao> {
  id_produto: string
  id_lojista: string
  nome: string
  preco_venda: number | string
  unidade_venda: string
  foto_url: string | null
  disponivel_agendamento_online: boolean
  categoria_produto?: { nome: string } | null
}

export const COLUNAS_MARKETPLACE =
  'id_produto, id_lojista, nome, preco_venda, unidade_venda, foto_url, disponivel_agendamento_online, promo_percentual, promo_inicio, promo_fim, categoria_produto(nome)'
export const COLUNAS_MARKETPLACE_MINIMAS =
  'id_produto, id_lojista, nome, preco_venda, unidade_venda, foto_url, disponivel_agendamento_online'

export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function palavrasBusca(texto: string): string[] {
  return normalizarBusca(texto).split(/\s+/).filter(Boolean).slice(0, 6)
}

export function escaparIlike(texto: string): string {
  return texto.replace(/[\\%_]/g, c => `\\${c}`)
}

export function precoDoProduto(p: ProdutoMarketplace, hojeISO: string) {
  const cheio = Number(p.preco_venda)
  const desconto = promoVigente(p, hojeISO)
  return { cheio, desconto, final: precoComDesconto(cheio, desconto) }
}

export function unidadeCurta(unidade: string): string {
  return rotuloUnidade(unidade).toLowerCase()
}

export function nomeCategoria(p: ProdutoMarketplace): string | null {
  return p.categoria_produto?.nome?.trim() || null
}

export function relevancia(p: ProdutoMarketplace, palavras: string[]): number {
  if (palavras.length === 0) return 0
  const nome = normalizarBusca(p.nome)
  if (nome.startsWith(palavras.join(' '))) return 0
  if (nome.startsWith(palavras[0])) return 1
  if (nome.split(/\s+/).some(w => w.startsWith(palavras[0]))) return 2
  return 3
}
