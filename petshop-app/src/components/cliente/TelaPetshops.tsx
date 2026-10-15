'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { iniciais } from '@/lib/format'
import { BADGE_STATUS_LOJA, normalizarBusca, type LojaMarketplace } from '@/lib/marketplace'
import { IconArrowRight, IconCalendar, IconMapPin, IconPaw, IconScissors, IconSearch, IconStore, IconWhatsapp } from '@/components/icons'
import Ilustracao from '@/components/Ilustracao'
import BuscaProdutos from './BuscaProdutos'
import './busca-produtos.css'

export type AbaPetshops = 'petshops' | 'produtos'

// Tela Petshops da conta do cliente: a lista de petshops e a busca de
// produtos do marketplace, em abas. Uma tela só para computador e celular
// (a busca e a aba escolhida valem para os dois); o que muda é o desenho
// da lista de petshops — cards em grade no computador, a lista do app no
// celular.
export default function TelaPetshops({ lojas, abaInicial }: { lojas: LojaMarketplace[]; abaInicial: AbaPetshops }) {
  const [aba, setAba] = useState<AbaPetshops>(abaInicial)
  const [busca, setBusca] = useState('')

  function trocarAba(nova: AbaPetshops) {
    setAba(nova)
    // Guarda a aba no endereço: voltar de um produto cai na mesma aba.
    window.history.replaceState(null, '', nova === 'produtos' ? '?aba=produtos' : window.location.pathname)
  }

  const visiveis = useMemo(() => {
    const termo = normalizarBusca(busca)
    if (!termo) return lojas
    return lojas.filter(l => normalizarBusca(`${l.nome} ${l.local}`).includes(termo))
  }, [lojas, busca])

  return (
    <>
      <div className="page-header so-desktop">
        <div className="flex items-center gap-3">
          <div className="stat-card-icon tone-primary" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)' }}>
            <IconStore style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Petshops</h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>Encontre petshops e produtos para o seu pet</p>
          </div>
        </div>
      </div>
      <div className="so-celular">
        <h1 className="tela-app-h1">Petshops</h1>
        <p className="dash-app-sub">Encontre petshops e produtos para o seu pet</p>
      </div>

      <div className="segmentos-app tela-petshops-abas" role="tablist" aria-label="O que procurar">
        <button type="button" role="tab" aria-selected={aba === 'petshops'} className={`segmento-app ${aba === 'petshops' ? 'is-ativo' : ''}`} onClick={() => trocarAba('petshops')}>
          Petshops <span className="segmento-qtd">{lojas.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={aba === 'produtos'} className={`segmento-app ${aba === 'produtos' ? 'is-ativo' : ''}`} onClick={() => trocarAba('produtos')}>
          Produtos
        </button>
      </div>

      {aba === 'produtos' ? (
        <BuscaProdutos lojas={lojas} />
      ) : (
        <>
          {lojas.length > 0 && (
            <div className="petshops-busca">
              <label className="tela-app-busca">
                <IconSearch />
                <input
                  type="search"
                  enterKeyHint="search"
                  placeholder="Buscar petshop por nome ou cidade…"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  aria-label="Buscar petshop"
                  autoComplete="off"
                />
              </label>
            </div>
          )}

          {visiveis.length === 0 ? (
            <div className="dash-app-vazio">
              {lojas.length === 0
                ? <Ilustracao nome="loja" altura={110} style={{ marginBottom: 0 }} />
                : <span className="dash-app-vazio-icone"><IconStore style={{ width: 26, height: 26 }} /></span>}
              <strong>{lojas.length === 0 ? 'Nenhum petshop disponível' : 'Nenhum petshop encontrado'}</strong>
              <span>{lojas.length === 0 ? 'Em breve novos petshops estarão disponíveis na plataforma.' : 'Tente outro nome ou cidade.'}</span>
              {lojas.length > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBusca('')}>Limpar busca</button>}
            </div>
          ) : (
            <>
              <div className="so-desktop">
                <div className="marketplace-grid">
                  {visiveis.map(l => <CardPetshop key={l.id} loja={l} />)}
                </div>
              </div>
              <div className="so-celular">
                <div className="dash-app-lista">
                  {visiveis.map(l => <LinhaPetshop key={l.id} loja={l} />)}
                </div>
              </div>
            </>
          )}

          <div className="card so-desktop" style={{ marginTop: 'var(--space-6)', background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)', textAlign: 'center', padding: 'var(--space-6)' }}>
            <IconScissors style={{ width: 24, height: 24, color: 'var(--primary-400)', margin: '0 auto var(--space-3)' }} />
            <div className="font-semibold" style={{ marginBottom: 'var(--space-1)', color: 'var(--gray-100)' }}>
              Tem o link de um petshop?
            </div>
            <p className="text-sm text-muted">
              Se o seu petshop te enviou um link direto (ex: <code>saip.com/petshop-do-pedro</code>), acesse diretamente pelo link para agendar.
            </p>
          </div>
        </>
      )}
    </>
  )
}

// Computador: o card de sempre da lista de petshops.
function CardPetshop({ loja: l }: { loja: LojaMarketplace }) {
  return (
    <article className="marketplace-card animate-slide-up">
      <Link href={l.linkVitrine} className="marketplace-card-header" tabIndex={-1}>
        <div className="marketplace-logo-wrap">
          {l.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
            <img src={l.logoUrl} alt={l.nome} className="marketplace-logo-img" />
          ) : (
            <div className="marketplace-logo-placeholder">
              <IconPaw style={{ width: 28, height: 28, color: 'var(--primary-400)' }} />
            </div>
          )}
        </div>
        <div className="marketplace-card-overlay" />
      </Link>

      <div className="marketplace-card-body">
        <div className="flex items-start justify-between gap-2" style={{ marginBottom: 'var(--space-2)' }}>
          <Link href={l.linkVitrine} className="marketplace-nome">{l.nome}</Link>
          <span className={`badge ${BADGE_STATUS_LOJA[l.status.tom]}`} style={{ flexShrink: 0, fontSize: '0.7rem' }}>{l.status.rotulo}</span>
        </div>
        {l.local && (
          <div className="marketplace-meta">
            <IconMapPin style={{ width: 13, height: 13 }} />
            <span>{l.local}</span>
          </div>
        )}
        {l.minha && <span className="marketplace-selo-minha">Você já agendou aqui</span>}
        {l.descricao && <p className="marketplace-descricao">{l.descricao}</p>}
      </div>

      <div className="marketplace-card-footer">
        <Link href={l.linkVitrine} id={`btn-ver-loja-${l.id}`} className="btn btn-ghost btn-sm">
          Ver loja <IconArrowRight style={{ width: 14, height: 14 }} />
        </Link>
        <Link href={l.linkAgendar} id={`btn-agendar-${l.id}`} className="btn btn-primary btn-sm">
          <IconCalendar style={{ width: 14, height: 14 }} /> Agendar
        </Link>
      </div>
    </article>
  )
}

// Celular: a mesma tela Petshops do app.
function LinhaPetshop({ loja: l }: { loja: LojaMarketplace }) {
  return (
    <div className="tela-app-loja">
      <div className="tela-app-loja-topo">
        <span className="tela-app-avatar is-48" style={l.logoUrl ? { backgroundImage: `url(${l.logoUrl})` } : undefined}>
          {!l.logoUrl && iniciais(l.nome)}
        </span>
        <div>
          <strong>{l.nome}</strong>
          {l.local && <span>{l.local}</span>}
        </div>
      </div>
      <div className="tela-app-selos">
        <span className={`tela-app-selo ${l.status.tom === 'success' ? 'is-aberto' : ''}`}>{l.status.rotulo}</span>
        {l.minha && <span className="tela-app-selo is-minha">Você já agendou aqui</span>}
      </div>
      {l.descricao && <p className="tela-app-loja-desc">{l.descricao}</p>}
      <div className="tela-app-acoes">
        <Link href={l.linkAgendar} className="tela-app-botao is-primario">
          <IconCalendar style={{ width: 16, height: 16 }} /> Agendar
        </Link>
        {l.whatsapp && (
          <a href={`https://wa.me/${l.whatsapp}`} target="_blank" rel="noopener noreferrer" className="tela-app-botao">
            <IconWhatsapp style={{ width: 16, height: 16 }} /> WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}
