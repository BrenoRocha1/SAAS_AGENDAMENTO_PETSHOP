'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { hojeBrasilISO } from '@/lib/agenda'
import { iniciais } from '@/lib/format'
import {
  COLUNAS_MARKETPLACE, COLUNAS_MARKETPLACE_MINIMAS, escaparIlike, nomeCategoria, normalizarBusca,
  palavrasBusca, precoDoProduto, relevancia, type LojaMarketplace, type ProdutoMarketplace,
} from '@/lib/marketplace'
import { IconArrowRight, IconCalendar, IconChevronLeft, IconPackage, IconSearch } from '@/components/icons'
import CartaoProdutoMarketplace from './CartaoProdutoMarketplace'
import ProdutoMarketplaceModal from './ProdutoMarketplaceModal'
import '@/components/lojista/produtos-grade.css'
import './busca-produtos.css'

type Ordem = 'relevancia' | 'menor_preco' | 'maior_preco' | 'desconto'
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'relevancia', rotulo: 'Mais relevantes' },
  { valor: 'menor_preco', rotulo: 'Menor preço' },
  { valor: 'maior_preco', rotulo: 'Maior preço' },
  { valor: 'desconto', rotulo: 'Maior desconto' },
]

// Sem busca: a vitrine (promoções + uma fileira por petshop).
const LIMITE_VITRINE = 240
const LIMITE_BUSCA = 120
// Na fileira do petshop no celular (que rola para o lado).
const MAX_FILEIRA = 8

// Quantos cards cabem numa linha da grade (`.prod-grade`: mínimo 200px,
// 16px entre eles) — a fileira de cada petshop na vitrine mostra uma linha
// só no computador. No celular a fileira rola para o lado.
function useCardsPorLinha() {
  // A fileira só existe depois que os produtos chegam: mede quando ela aparece.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [n, setN] = useState(4)
  useEffect(() => {
    if (!el) return
    // O ResizeObserver já chama uma vez ao começar a observar.
    const ro = new ResizeObserver(() => {
      if (window.matchMedia('(max-width: 768px)').matches) setN(MAX_FILEIRA)
      else setN(Math.max(1, Math.floor((el.clientWidth + 16) / (200 + 16))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return { ref: setEl, n }
}

// Aba "Produtos" da tela Petshops (migration 098): os produtos que as lojas
// marcaram "Ativo para vendas no marketplace", com estoque, das lojas da
// lista. Busca sem acento por palavras, filtro por petshop e categoria,
// ordem por preço/desconto. Cada produto abre a janela com o preço, o
// petshop e como comprar.
export default function BuscaProdutos({ lojas }: { lojas: LojaMarketplace[] }) {
  const [termo, setTermo] = useState('')
  const [idLoja, setIdLoja] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('relevancia')
  const [produtos, setProdutos] = useState<ProdutoMarketplace[]>([])
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro' | 'indisponivel'>('carregando')
  const [atualizando, setAtualizando] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [aberto, setAberto] = useState<ProdutoMarketplace | null>(null)
  const [hoje] = useState(hojeBrasilISO)
  const fileira = useCardsPorLinha()
  const topoRef = useRef<HTMLDivElement>(null)

  const palavras = useMemo(() => palavrasBusca(termo), [termo])
  const chaveBusca = palavras.join(' ')
  const buscando = chaveBusca.length >= 2
  const idsLojas = useMemo(() => lojas.map(l => l.id), [lojas])
  const lojaPorId = useMemo(() => new Map(lojas.map(l => [l.id, l])), [lojas])

  // Busca no banco: muda com o texto (com uma pausa curta) e o petshop.
  // Categoria e ordem são aplicadas aqui na tela, sobre o que veio.
  useEffect(() => {
    if (idsLojas.length === 0) return
    let cancelado = false
    const ws = buscando ? chaveBusca.split(' ') : []
    const ids = idLoja ? [idLoja] : idsLojas
    const limite = ws.length > 0 || idLoja ? LIMITE_BUSCA : LIMITE_VITRINE
    const t = setTimeout(async () => {
      setAtualizando(true)
      const supabase = createClient()
      const consultar = (colunas: string, campo: 'nome_busca' | 'nome') => {
        let q = supabase
          .from('produto')
          .select(colunas)
          .eq('disponivel_marketplace', true)
          .eq('status', 'Ativo')
          .is('excluido_em', null)
          .gt('estoque_atual', 0)
          .in('id_lojista', ids)
          .order('nome')
          .limit(limite)
        for (const w of ws) q = q.ilike(campo, `%${escaparIlike(w)}%`)
        return q
      }
      let r = await consultar(COLUNAS_MARKETPLACE, 'nome_busca')
      // Banco sem as promoções ou sem a busca sem acento: o básico.
      if (r.error) r = await consultar(COLUNAS_MARKETPLACE_MINIMAS, 'nome')
      if (cancelado) return
      setAtualizando(false)
      if (r.error) {
        setProdutos([])
        setEstado(/disponivel_marketplace/i.test(r.error.message) ? 'indisponivel' : 'erro')
        return
      }
      setProdutos((r.data ?? []) as unknown as ProdutoMarketplace[])
      setEstado('pronto')
    }, ws.length > 0 ? 280 : 0)
    return () => { cancelado = true; clearTimeout(t) }
  }, [chaveBusca, buscando, idLoja, idsLojas, tentativa])

  // Categorias do que veio, as com mais produtos primeiro.
  const categorias = useMemo(() => {
    const cont = new Map<string, { rotulo: string; n: number }>()
    for (const p of produtos) {
      const nome = nomeCategoria(p)
      if (!nome) continue
      const chave = normalizarBusca(nome)
      const atual = cont.get(chave)
      if (atual) atual.n++
      else cont.set(chave, { rotulo: nome, n: 1 })
    }
    return [...cont.entries()]
      .map(([chave, v]) => ({ chave, ...v }))
      .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  }, [produtos])
  // A categoria escolhida some quando a busca muda e ela não tem mais nada.
  const categoriaAtiva = categorias.some(c => c.chave === categoria) ? categoria : ''

  const lista = useMemo(() => {
    const ws = buscando ? palavras : []
    const final = (p: ProdutoMarketplace) => precoDoProduto(p, hoje).final
    const desconto = (p: ProdutoMarketplace) => precoDoProduto(p, hoje).desconto
    return produtos
      .filter(p => !categoriaAtiva || normalizarBusca(nomeCategoria(p) ?? '') === categoriaAtiva)
      .sort((a, b) => {
        if (ordem === 'menor_preco') return final(a) - final(b)
        if (ordem === 'maior_preco') return final(b) - final(a)
        if (ordem === 'desconto') return desconto(b) - desconto(a) || final(a) - final(b)
        return relevancia(a, ws) - relevancia(b, ws) || a.nome.localeCompare(b.nome, 'pt-BR')
      })
  }, [produtos, categoriaAtiva, ordem, buscando, palavras, hoje])

  const vitrine = !buscando && !idLoja && !categoriaAtiva && ordem === 'relevancia'
  const filtrando = buscando || !!idLoja || !!categoriaAtiva || ordem !== 'relevancia'
  const lojaFiltro = idLoja ? lojaPorId.get(idLoja) ?? null : null
  const lojaAberta = aberto ? lojaPorId.get(aberto.id_lojista) ?? null : null

  const porLoja = useMemo(() => lojas
    .map(loja => ({ loja, itens: lista.filter(p => p.id_lojista === loja.id) }))
    .filter(g => g.itens.length > 0), [lojas, lista])
  const emPromocao = useMemo(() => lista
    .filter(p => precoDoProduto(p, hoje).desconto > 0)
    .sort((a, b) => precoDoProduto(b, hoje).desconto - precoDoProduto(a, hoje).desconto)
    .slice(0, MAX_FILEIRA), [lista, hoje])

  const limpar = useCallback(() => { setTermo(''); setIdLoja(''); setCategoria(''); setOrdem('relevancia') }, [])
  const verLoja = useCallback((id: string) => {
    setIdLoja(id)
    setCategoria('')
    topoRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])
  const fechar = useCallback(() => setAberto(null), [])

  const cartao = (p: ProdutoMarketplace, sub: 'loja' | 'categoria') => (
    <CartaoProdutoMarketplace
      key={p.id_produto}
      produto={p}
      sub={sub === 'loja' ? lojaPorId.get(p.id_lojista)?.nome ?? null : nomeCategoria(p)}
      hoje={hoje}
      onAbrir={() => setAberto(p)}
    />
  )

  if (lojas.length === 0) {
    return (
      <div className="dash-app-vazio">
        <span className="dash-app-vazio-icone"><IconPackage style={{ width: 26, height: 26 }} /></span>
        <strong>Nenhum petshop disponível</strong>
        <span>Quando houver petshops na plataforma, os produtos deles aparecem aqui.</span>
      </div>
    )
  }

  const total = lista.length
  const contagem = `${total} ${total === 1 ? 'produto' : 'produtos'}${buscando ? ` para “${termo.trim()}”` : ''}`

  return (
    <div className="mkt" ref={topoRef}>
      {/* Filtros */}
      <div className="mkt-filtros">
        <div className="mkt-filtros-linha">
          <label className="tela-app-busca mkt-busca">
            <IconSearch />
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Buscar ração, shampoo, coleira…"
              value={termo}
              onChange={e => setTermo(e.target.value)}
              aria-label="Buscar produto"
              autoComplete="off"
            />
          </label>
          <div className="mkt-selects">
            <select className="form-select" value={idLoja} onChange={e => { setIdLoja(e.target.value); setCategoria('') }} aria-label="Petshop">
              <option value="">Todos os petshops</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
            <select className="form-select" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
              {ORDENS.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </div>
        </div>
        {categorias.length > 1 && (
          <div className="mkt-chips" role="group" aria-label="Categorias">
            <button type="button" className={`mkt-chip ${!categoriaAtiva ? 'is-ativo' : ''}`} aria-pressed={!categoriaAtiva} onClick={() => setCategoria('')}>
              Todas
            </button>
            {categorias.map(c => (
              <button
                key={c.chave}
                type="button"
                className={`mkt-chip ${categoriaAtiva === c.chave ? 'is-ativo' : ''}`}
                aria-pressed={categoriaAtiva === c.chave}
                onClick={() => setCategoria(categoriaAtiva === c.chave ? '' : c.chave)}
              >
                {c.rotulo} <span>{c.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Petshop escolhido: o cabeçalho dele, com o caminho de volta. */}
      {lojaFiltro && (
        <div className="mkt-loja-destaque">
          <button type="button" className="mkt-voltar" onClick={() => setIdLoja('')}>
            <IconChevronLeft /> Todos os petshops
          </button>
          <CabecalhoLoja loja={lojaFiltro} detalhe={estado === 'pronto' ? `${total} ${total === 1 ? 'produto' : 'produtos'}` : null}>
            <Link href={lojaFiltro.linkAgendar} className="btn btn-primary btn-sm">
              <IconCalendar style={{ width: 14, height: 14 }} /> Agendar
            </Link>
          </CabecalhoLoja>
        </div>
      )}

      {estado === 'carregando' ? (
        <div className="prod-grade" aria-busy="true" aria-label="Carregando produtos">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="esqueleto mkt-esqueleto" />)}
        </div>
      ) : estado === 'indisponivel' || estado === 'erro' ? (
        <div className="dash-app-vazio">
          <span className="dash-app-vazio-icone"><IconPackage style={{ width: 26, height: 26 }} /></span>
          <strong>{estado === 'indisponivel' ? 'Busca de produtos em breve' : 'Não foi possível carregar os produtos'}</strong>
          <span>{estado === 'indisponivel' ? 'Os petshops ainda estão preparando a vitrine de produtos.' : 'Verifique a sua conexão e tente de novo.'}</span>
          {estado === 'erro' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTentativa(n => n + 1)}>Tentar de novo</button>}
        </div>
      ) : total === 0 ? (
        <div className="dash-app-vazio">
          <span className="dash-app-vazio-icone"><IconSearch style={{ width: 26, height: 26 }} /></span>
          <strong>{filtrando ? 'Nenhum produto encontrado' : 'Ainda não há produtos por aqui'}</strong>
          <span>
            {buscando
              ? 'Confira o que foi digitado ou procure por outro nome.'
              : idLoja
                ? 'Este petshop ainda não colocou produtos à venda aqui.'
                : 'Os petshops ainda não colocaram produtos à venda no marketplace.'}
          </span>
          {filtrando && <button type="button" className="btn btn-secondary btn-sm" onClick={limpar}>Limpar filtros</button>}
        </div>
      ) : vitrine ? (
        <div className={`mkt-secoes ${atualizando ? 'is-atualizando' : ''}`}>
          {emPromocao.length > 0 && (
            <section className="mkt-secao" aria-labelledby="mkt-promo">
              <div className="mkt-secao-topo">
                <h2 id="mkt-promo" className="mkt-secao-titulo">Em promoção</h2>
                <button type="button" className="mkt-link" onClick={() => setOrdem('desconto')}>
                  Ver todas <IconArrowRight />
                </button>
              </div>
              <div className="mkt-fileira">
                {emPromocao.slice(0, fileira.n).map(p => cartao(p, 'loja'))}
              </div>
            </section>
          )}
          {porLoja.map(({ loja, itens }, i) => (
            <section key={loja.id} className="mkt-secao" aria-label={loja.nome}>
              <CabecalhoLoja loja={loja} detalhe={`${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'}`}>
                <button type="button" className="mkt-link" onClick={() => verLoja(loja.id)}>
                  Ver todos <IconArrowRight />
                </button>
              </CabecalhoLoja>
              {/* A primeira fileira mede quantos cards cabem numa linha. */}
              <div className="mkt-fileira" ref={i === 0 ? fileira.ref : undefined}>
                {itens.slice(0, fileira.n).map(p => cartao(p, 'categoria'))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={`mkt-secoes ${atualizando ? 'is-atualizando' : ''}`}>
          <div className="mkt-resultado-topo">
            <span>{contagem}</span>
            {filtrando && <button type="button" className="mkt-link" onClick={limpar}>Limpar filtros</button>}
          </div>
          {/* Na ordem "mais relevantes" e sem petshop escolhido, separado por
              petshop; ordenado por preço ou desconto, tudo junto. */}
          {!idLoja && ordem === 'relevancia' ? (
            porLoja.map(({ loja, itens }) => (
              <section key={loja.id} className="mkt-secao" aria-label={loja.nome}>
                <CabecalhoLoja loja={loja} detalhe={`${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'}`}>
                  <button type="button" className="mkt-link" onClick={() => verLoja(loja.id)}>
                    Ver loja <IconArrowRight />
                  </button>
                </CabecalhoLoja>
                <div className="prod-grade">{itens.map(p => cartao(p, 'categoria'))}</div>
              </section>
            ))
          ) : (
            <div className="prod-grade">{lista.map(p => cartao(p, idLoja ? 'categoria' : 'loja'))}</div>
          )}
          {produtos.length >= LIMITE_BUSCA && (buscando || idLoja) && (
            <p className="text-sm text-muted" style={{ textAlign: 'center', margin: 0 }}>
              Mostrando os primeiros {LIMITE_BUSCA}. Digite mais do nome para encontrar o que procura.
            </p>
          )}
        </div>
      )}

      {aberto && lojaAberta && <ProdutoMarketplaceModal produto={aberto} loja={lojaAberta} hoje={hoje} onFechar={fechar} />}
    </div>
  )
}

function CabecalhoLoja({ loja, detalhe, children }: { loja: LojaMarketplace; detalhe: string | null; children?: React.ReactNode }) {
  return (
    <div className="mkt-loja">
      <span className="tela-app-avatar mkt-loja-avatar" style={loja.logoUrl ? { backgroundImage: `url(${loja.logoUrl})` } : undefined}>
        {!loja.logoUrl && iniciais(loja.nome)}
      </span>
      <div className="mkt-loja-texto">
        <strong>{loja.nome}</strong>
        <span>
          <span className={`mkt-ponto is-${loja.status.tom}`} aria-hidden="true" />
          {[loja.status.rotulo, loja.local, detalhe].filter(Boolean).join(' · ')}
        </span>
      </div>
      {children && <div className="mkt-loja-acao">{children}</div>}
    </div>
  )
}
