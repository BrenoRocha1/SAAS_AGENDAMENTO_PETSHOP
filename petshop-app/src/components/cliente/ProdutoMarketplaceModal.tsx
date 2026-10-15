'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { formatarReais } from '@/lib/taxidog'
import { iniciais } from '@/lib/format'
import {
  linkComprarAoAgendar, linkWhatsAppProduto, nomeCategoria, precoDoProduto, unidadeCurta,
  type LojaMarketplace, type ProdutoMarketplace,
} from '@/lib/marketplace'
import { IconArrowRight, IconCalendar, IconClose, IconPackage, IconWhatsapp } from '@/components/icons'

// Janela do produto (no celular vira o painel de baixo, como as outras
// janelas): foto, preço, de qual petshop é e como comprar — no agendamento
// (abre o agendamento da loja com o produto já no pedido) ou pelo WhatsApp.
export default function ProdutoMarketplaceModal({ produto, loja, hoje, onFechar }: {
  produto: ProdutoMarketplace
  loja: LojaMarketplace
  hoje: string
  onFechar: () => void
}) {
  const { cheio, desconto, final } = precoDoProduto(produto, hoje)
  const categoria = nomeCategoria(produto)
  const whatsapp = linkWhatsAppProduto(loja, produto)
  const unidade = unidadeCurta(produto.unidade_venda)

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal mkt-modal" role="dialog" aria-modal="true" aria-labelledby="mkt-modal-titulo" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" id="mkt-modal-titulo">Detalhes do produto</h3>
          <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar"><IconClose style={{ width: 16, height: 16 }} /></button>
        </div>

        <div className="modal-body">
          <div className="mkt-modal-topo">
            <div className="prod-card-foto mkt-modal-foto">
              {produto.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                <img src={produto.foto_url} alt={produto.nome} />
              ) : <IconPackage />}
              {desconto > 0 && <span className="prod-card-selos"><span className="prod-card-selo is-promo">-{desconto}%</span></span>}
            </div>

            <div className="mkt-modal-info">
              <h4 className="mkt-modal-nome">{produto.nome}</h4>
              <span className="text-sm text-muted">{[categoria, `Vendido por ${unidade}`].filter(Boolean).join(' · ')}</span>
              <div className="mkt-modal-preco">
                {desconto > 0 && <s>{formatarReais(cheio)}</s>}
                <strong>{formatarReais(final)}</strong>
                <small>/ {unidade}</small>
              </div>
              {desconto > 0 && <span className="mkt-modal-economia">Você economiza {formatarReais(cheio - final)}</span>}
            </div>
          </div>

          <div className="mkt-modal-loja">
            <span className="tela-app-avatar" style={loja.logoUrl ? { backgroundImage: `url(${loja.logoUrl})` } : undefined}>
              {!loja.logoUrl && iniciais(loja.nome)}
            </span>
            <div className="mkt-modal-loja-texto">
              <strong>{loja.nome}</strong>
              <span>
                <span className={`mkt-ponto is-${loja.status.tom}`} aria-hidden="true" />
                {[loja.status.rotulo, loja.local].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>

          <p className="mkt-modal-como">
            {produto.disponivel_agendamento_online
              ? 'Você escolhe o serviço e o horário no agendamento da loja, e o produto já vai junto no mesmo pedido.'
              : 'Este produto é vendido direto na loja. Fale com o petshop para reservar ou combinar a retirada.'}
          </p>
        </div>

        <div className="modal-footer">
          <Link href={loja.linkVitrine} className="btn btn-ghost">
            Ver petshop <IconArrowRight style={{ width: 14, height: 14 }} />
          </Link>
          {produto.disponivel_agendamento_online ? (
            <>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                  <IconWhatsapp style={{ width: 15, height: 15 }} /> WhatsApp
                </a>
              )}
              <Link href={linkComprarAoAgendar(loja, produto)} className="btn btn-primary">
                <IconCalendar style={{ width: 15, height: 15 }} /> Comprar ao agendar
              </Link>
            </>
          ) : whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              <IconWhatsapp style={{ width: 15, height: 15 }} /> Reservar pelo WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
