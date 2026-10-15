'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { iniciais } from '@/lib/format'
import { formatarReais } from '@/lib/taxidog'
import { rotuloUnidade } from '@/lib/produto'
import { hojeBrasilISO } from '@/lib/agenda'
import { precoComDesconto, promoVigente, type Promocao } from '@/lib/promocao'
import { IconCalendar, IconPackage, IconSearch, IconWhatsapp } from '@/components/icons'
import './busca-produtos.css'

export interface LojaBusca {
  id: string
  nome: string
  logoUrl: string | null
  linkAgendar: string
  // Só os números, com DDI (wa.me/55...).
  whatsapp: string | null
}

interface ProdutoBusca extends Partial<Promocao> {
  id_produto: string
  id_lojista: string
  nome: string
  preco_venda: number | string
  unidade_venda: string
  foto_url: string | null
  disponivel_agendamento_online: boolean
}

const COLUNAS = 'id_produto, id_lojista, nome, preco_venda, unidade_venda, foto_url, disponivel_agendamento_online'
const COLUNAS_PROMO = ', promo_percentual, promo_inicio, promo_fim'
const LIMITE = 60

// "%" e "_" são curingas no ilike: o que o cliente digita vale como texto.
function escaparBusca(termo: string) {
  return termo.replace(/[\\%_]/g, c => `\\${c}`)
}

// Busca de produtos do marketplace (migration 098): só produtos que a loja
// marcou "Ativo para vendas no marketplace", com estoque, das lojas da
// tela Petshops. Escolhendo um petshop sem digitar nada, lista os produtos
// dele. O resultado vem separado por petshop.
export default function BuscaProdutos({ lojas }: { lojas: LojaBusca[] }) {
  const [termo, setTermo] = useState('')
  const [idLoja, setIdLoja] = useState('')
  const [produtos, setProdutos] = useState<ProdutoBusca[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [buscou, setBuscou] = useState(false)

  const texto = termo.trim()
  const podeBuscar = texto.length >= 2 || idLoja !== ''

  useEffect(() => {
    if (!podeBuscar || lojas.length === 0) return
    let cancelado = false
    const t = setTimeout(async () => {
      setCarregando(true)
      setErro(null)
      const supabase = createClient()
      const consultar = (colunas: string) => {
        let q = supabase
          .from('produto')
          .select(colunas)
          .eq('disponivel_marketplace', true)
          .eq('status', 'Ativo')
          .is('excluido_em', null)
          .gt('estoque_atual', 0)
          .in('id_lojista', idLoja ? [idLoja] : lojas.map(l => l.id))
          .order('nome')
          .limit(LIMITE)
        if (texto.length >= 2) q = q.ilike('nome', `%${escaparBusca(texto)}%`)
        return q
      }
      let r = await consultar(COLUNAS + COLUNAS_PROMO)
      // Sem a migration de promoções: busca sem elas.
      if (r.error && /promo_/i.test(r.error.message)) r = await consultar(COLUNAS)
      if (cancelado) return
      setCarregando(false)
      setBuscou(true)
      if (r.error) {
        setProdutos([])
        setErro(/disponivel_marketplace/i.test(r.error.message)
          ? 'A busca de produtos ainda não está disponível.'
          : 'Não foi possível buscar agora. Tente de novo.')
        return
      }
      setProdutos((r.data ?? []) as unknown as ProdutoBusca[])
    }, 300)
    return () => { cancelado = true; clearTimeout(t) }
  }, [texto, idLoja, podeBuscar, lojas])

  // Agrupa por petshop, na mesma ordem da lista de petshops.
  const grupos = useMemo(() => {
    if (!podeBuscar) return []
    return lojas
      .map(loja => ({ loja, itens: produtos.filter(p => p.id_lojista === loja.id) }))
      .filter(g => g.itens.length > 0)
  }, [lojas, produtos, podeBuscar])

  const hoje = hojeBrasilISO()

  return (
    <div className="busca-produtos">
      <div className="busca-produtos-filtros">
        <div className="tela-app-busca">
          <IconSearch />
          <input
            type="search"
            placeholder="Buscar produto (ex.: ração, shampoo)…"
            value={termo}
            onChange={e => setTermo(e.target.value)}
            aria-label="Buscar produto"
            autoComplete="off"
          />
        </div>
        <select className="form-select busca-produtos-loja" value={idLoja} onChange={e => setIdLoja(e.target.value)} aria-label="Petshop">
          <option value="">Todos os petshops</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      </div>

      {!podeBuscar ? (
        <div className="dash-app-vazio">
          <span className="dash-app-vazio-icone"><IconPackage style={{ width: 26, height: 26 }} /></span>
          <strong>Encontre o produto que você procura</strong>
          <span>Digite o nome do produto ou escolha um petshop para ver os produtos dele.</span>
        </div>
      ) : erro ? (
        <div className="alert alert-error">{erro}</div>
      ) : carregando && !buscou ? (
        <p className="text-sm text-muted" style={{ textAlign: 'center' }}>Buscando…</p>
      ) : grupos.length === 0 ? (
        <div className="dash-app-vazio" style={{ opacity: carregando ? 0.6 : 1 }}>
          <span className="dash-app-vazio-icone"><IconSearch style={{ width: 26, height: 26 }} /></span>
          <strong>Nenhum produto encontrado</strong>
          <span>{texto ? 'Tente outro nome ou procure em todos os petshops.' : 'Este petshop ainda não tem produtos no marketplace.'}</span>
        </div>
      ) : (
        <div className="busca-produtos-grupos" style={{ opacity: carregando ? 0.6 : 1 }}>
          {grupos.map(({ loja, itens }) => (
            <section key={loja.id} className="busca-produtos-grupo">
              <div className="busca-produtos-loja-topo">
                <span className="tela-app-avatar is-32" style={loja.logoUrl ? { backgroundImage: `url(${loja.logoUrl})` } : undefined}>
                  {!loja.logoUrl && iniciais(loja.nome)}
                </span>
                <strong>{loja.nome}</strong>
                <span className="text-sm text-muted busca-produtos-qtd">{itens.length} {itens.length === 1 ? 'produto' : 'produtos'}</span>
                {!idLoja && texto && (
                  <button type="button" className="btn btn-ghost btn-sm busca-produtos-ver" onClick={() => { setIdLoja(loja.id); setTermo('') }}>
                    Ver todos
                  </button>
                )}
              </div>
              <div className="busca-produtos-lista">
                {itens.map(p => {
                  const preco = Number(p.preco_venda)
                  const pct = promoVigente(p, hoje)
                  const final = precoComDesconto(preco, pct)
                  const unidade = rotuloUnidade(p.unidade_venda).toLowerCase()
                  const mensagem = `Olá! Vi o produto "${p.nome}" na ${loja.nome} pelo SAIP. Ainda tem disponível?`
                  return (
                    <article key={p.id_produto} className="busca-produto">
                      <div className="busca-produto-foto" style={p.foto_url ? { backgroundImage: `url(${p.foto_url})` } : undefined}>
                        {!p.foto_url && <IconPackage style={{ width: 26, height: 26 }} />}
                        {pct > 0 && <span className="busca-produto-selo">-{pct}%</span>}
                      </div>
                      <div className="busca-produto-info">
                        <strong className="busca-produto-nome">{p.nome}</strong>
                        <span className="busca-produto-preco">
                          {pct > 0 && <s>{formatarReais(preco)}</s>}
                          {formatarReais(final)}
                          <small> / {unidade}</small>
                        </span>
                      </div>
                      <div className="busca-produto-acoes">
                        {p.disponivel_agendamento_online ? (
                          <Link href={loja.linkAgendar} className="btn btn-primary btn-sm">
                            <IconCalendar style={{ width: 14, height: 14 }} /> Comprar ao agendar
                          </Link>
                        ) : loja.whatsapp ? (
                          <a href={`https://wa.me/${loja.whatsapp}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                            <IconWhatsapp style={{ width: 14, height: 14 }} /> Pedir no WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-muted">Disponível na loja</span>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
          {produtos.length >= LIMITE && (
            <p className="text-sm text-muted" style={{ textAlign: 'center', margin: 0 }}>Mostrando os primeiros {LIMITE}. Digite mais do nome para refinar.</p>
          )}
        </div>
      )}
    </div>
  )
}
