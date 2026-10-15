// Marketplace de produtos (migration 098): o que a tela Petshops do
// cliente usa para buscar e mostrar os produtos que as lojas liberaram.
// Não é 'use server' — roda no navegador.

import { precoComDesconto, promoVigente, type Promocao } from '@/lib/promocao'
import { rotuloUnidade } from '@/lib/produto'

export interface LojaMarketplace {
  id: string
  nome: string
  logoUrl: string | null
  descricao: string | null
  // "Mauá, SP"
  local: string
  // Aberto / Abre às 09:00 / Fechado hoje…
  status: { rotulo: string; tom: 'success' | 'warning' | 'danger' }
  // O cliente já agendou nesta loja.
  minha: boolean
  linkVitrine: string
  linkAgendar: string
  // Só números, com o 55 (wa.me/55...).
  whatsapp: string | null
}

export interface ProdutoMarketplace extends Partial<Promocao> {
  id_produto: string
  id_lojista: string
  nome: string
  preco_venda: number | string
  unidade_venda: string
  foto_url: string | null
  // Também à venda no agendamento online: dá para levar junto do serviço.
  disponivel_agendamento_online: boolean
  categoria_produto?: { nome: string } | null
}

// Colunas lidas; sem as migrations de promoção (096) ou a 098 completa,
// a busca cai para as mínimas.
export const COLUNAS_MARKETPLACE =
  'id_produto, id_lojista, nome, preco_venda, unidade_venda, foto_url, disponivel_agendamento_online, promo_percentual, promo_inicio, promo_fim, categoria_produto(nome)'
export const COLUNAS_MARKETPLACE_MINIMAS =
  'id_produto, id_lojista, nome, preco_venda, unidade_venda, foto_url, disponivel_agendamento_online'

// Minúsculas e sem acento — o mesmo que a coluna nome_busca guarda.
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Palavras da busca ("racao golden" → ['racao', 'golden']); cada uma vira um filtro.
export function palavrasBusca(texto: string): string[] {
  return normalizarBusca(texto).split(/\s+/).filter(Boolean).slice(0, 6)
}

// "%" e "_" são curingas no ilike: o que o cliente digita vale como texto.
export function escaparIlike(texto: string): string {
  return texto.replace(/[\\%_]/g, c => `\\${c}`)
}

export function precoDoProduto(p: ProdutoMarketplace, hojeISO: string) {
  const cheio = Number(p.preco_venda)
  const desconto = promoVigente(p, hojeISO)
  return { cheio, desconto, final: precoComDesconto(cheio, desconto) }
}

// "kg", "unidade", "litro"…
export function unidadeCurta(unidade: string): string {
  return rotuloUnidade(unidade).toLowerCase()
}

export function nomeCategoria(p: ProdutoMarketplace): string | null {
  return p.categoria_produto?.nome?.trim() || null
}

// Abre o agendamento da loja com o produto já no pedido.
export function linkComprarAoAgendar(loja: LojaMarketplace, p: ProdutoMarketplace): string {
  return `${loja.linkAgendar}?produto=${encodeURIComponent(p.id_produto)}`
}

export function linkWhatsAppProduto(loja: LojaMarketplace, p: ProdutoMarketplace): string | null {
  if (!loja.whatsapp) return null
  const texto = `Olá! Vi o produto "${p.nome}" da ${loja.nome} no SAIP. Ainda tem disponível?`
  return `https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(texto)}`
}

// Ordem da busca: o nome que começa com o que foi digitado vem antes.
export function relevancia(p: ProdutoMarketplace, palavras: string[]): number {
  if (palavras.length === 0) return 0
  const nome = normalizarBusca(p.nome)
  if (nome.startsWith(palavras.join(' '))) return 0
  if (nome.startsWith(palavras[0])) return 1
  if (nome.split(/\s+/).some(w => w.startsWith(palavras[0]))) return 2
  return 3
}

// Selo do aberto/fechado com as cores de status do projeto.
export const BADGE_STATUS_LOJA: Record<LojaMarketplace['status']['tom'], string> = {
  success: 'badge-ativo',
  warning: 'badge-pendente',
  danger: 'badge-cancelado',
}
