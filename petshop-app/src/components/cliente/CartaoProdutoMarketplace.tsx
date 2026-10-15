'use client'

import { formatarReais } from '@/lib/taxidog'
import { precoDoProduto, unidadeCurta, type ProdutoMarketplace } from '@/lib/marketplace'
import { IconCalendar, IconPackage, IconStore } from '@/components/icons'

// Card de produto do marketplace — o mesmo `.prod-card` da grade de
// produtos do lojista (produtos-grade.css): foto em cima, selo da promoção,
// nome, a linha de baixo (categoria ou petshop) e o preço. Abre a janela
// do produto.
export default function CartaoProdutoMarketplace({ produto, sub, hoje, onAbrir }: {
  produto: ProdutoMarketplace
  // Categoria (dentro do bloco do petshop) ou o nome do petshop (lista misturada).
  sub: string | null
  hoje: string
  onAbrir: () => void
}) {
  const { cheio, desconto, final } = precoDoProduto(produto, hoje)
  return (
    <button type="button" className="prod-card mkt-card" onClick={onAbrir} aria-label={`${produto.nome}, ${formatarReais(final)}. Ver detalhes`}>
      <span className="prod-card-foto">
        {produto.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
          <img src={produto.foto_url} alt="" loading="lazy" />
        ) : <IconPackage />}
        {desconto > 0 && (
          <span className="prod-card-selos"><span className="prod-card-selo is-promo">-{desconto}%</span></span>
        )}
      </span>
      <span className="prod-card-info">
        <span className="prod-card-nome">{produto.nome}</span>
        {sub && <span className="prod-card-sub">{sub}</span>}
        <span className="prod-card-preco">
          {desconto > 0 && <s>{formatarReais(cheio)}</s>} {formatarReais(final)} <small>/ {unidadeCurta(produto.unidade_venda)}</small>
        </span>
        <span className="prod-card-pe mkt-card-pe">
          {produto.disponivel_agendamento_online
            ? <span><IconCalendar /> Leve no agendamento</span>
            : <span><IconStore /> Compra na loja</span>}
        </span>
      </span>
    </button>
  )
}
