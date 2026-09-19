'use client'

import { useMemo, useState } from 'react'
import { rotuloEstoque, statusEstoque, ROTULO_STATUS_ESTOQUE, BADGE_STATUS_ESTOQUE } from '@/lib/produto'
import AjustarEstoqueModal from './AjustarEstoqueModal'
import { IconImage, IconPackage, IconSearch } from '@/components/icons'

interface Categoria {
  id_categoria: string
  nome: string
}

interface Produto {
  id_produto: string
  nome: string
  id_categoria: string | null
  unidade_venda: string
  estoque_atual: number
  estoque_minimo: number
  foto_url: string | null
}

interface Props {
  produtos: Produto[]
  categorias: Categoria[]
}

type Ordenacao = 'nome' | 'quantidade_desc' | 'quantidade_asc'

// Visão rápida e visual do estoque — separada de Produtos (que é onde se
// cadastra/edita o catálogo em si). Clicar num card abre direto o ajuste
// de +/- estoque, sem precisar ir até Produtos pra isso.
export default function EstoqueGrid({ produtos: inicial, categorias }: Props) {
  const [produtos, setProdutos] = useState(inicial)
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('nome')
  const [estoqueAlvo, setEstoqueAlvo] = useState<Produto | null>(null)

  const produtosExibidos = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase()
    const filtrados = produtos.filter(p => {
      if (categoriaFiltro && p.id_categoria !== categoriaFiltro) return false
      if (buscaLower && !p.nome.toLowerCase().includes(buscaLower)) return false
      return true
    })
    const ordenados = [...filtrados]
    if (ordenacao === 'quantidade_desc') ordenados.sort((a, b) => b.estoque_atual - a.estoque_atual)
    else if (ordenacao === 'quantidade_asc') ordenados.sort((a, b) => a.estoque_atual - b.estoque_atual)
    else ordenados.sort((a, b) => a.nome.localeCompare(b.nome))
    return ordenados
  }, [produtos, busca, categoriaFiltro, ordenacao])

  // Nome da categoria resolvido aqui (não via embed no select — ver
  // comentário em lojista/produtos/page.tsx sobre o motivo).
  const nomeCategoriaPorId = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const c of categorias) mapa.set(c.id_categoria, c.nome)
    return mapa
  }, [categorias])

  return (
    <>
      <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <div className="flex items-center justify-between gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="dash-search">
            <IconSearch />
            <input placeholder="Buscar produto pelo nome..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <select className="form-select-accent" value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categorias.map(c => (
                <option key={c.id_categoria} value={c.id_categoria}>{c.nome}</option>
              ))}
            </select>
            <select className="form-select-accent" value={ordenacao} onChange={e => setOrdenacao(e.target.value as Ordenacao)}>
              <option value="nome">Ordenar por nome</option>
              <option value="quantidade_desc">Maior quantidade primeiro</option>
              <option value="quantidade_asc">Menor quantidade primeiro</option>
            </select>
          </div>
        </div>
      </div>

      {produtos.length === 0 ? (
        <div className="empty-state card">
          <IconPackage style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum produto ativo cadastrado</div>
          <p>Cadastre produtos na tela de Produtos para eles aparecerem aqui.</p>
        </div>
      ) : produtosExibidos.length === 0 ? (
        <div className="empty-state card">
          <IconSearch style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum produto encontrado</div>
          <p>Tente outro termo de busca ou outra categoria.</p>
        </div>
      ) : (
        <div className="estoque-grid">
          {produtosExibidos.map(p => {
            const st = statusEstoque(p.estoque_atual, p.estoque_minimo)
            const nomeCategoria = p.id_categoria ? nomeCategoriaPorId.get(p.id_categoria) : null
            return (
              <button key={p.id_produto} type="button" className="estoque-card" onClick={() => setEstoqueAlvo(p)}>
                <span className={`badge ${BADGE_STATUS_ESTOQUE[st]}`}>{ROTULO_STATUS_ESTOQUE[st]}</span>
                <div className="estoque-card-foto">
                  {p.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                    <img src={p.foto_url} alt={p.nome} />
                  ) : (
                    <IconImage style={{ width: 26, height: 26, color: 'var(--gray-600)' }} />
                  )}
                </div>
                <div className="estoque-card-nome">{p.nome}</div>
                {nomeCategoria && <div className="text-xs text-muted">{nomeCategoria}</div>}
                <div className="estoque-card-qtd">{rotuloEstoque(p.estoque_atual, p.unidade_venda)}</div>
                <div className="text-xs text-muted">em estoque</div>
              </button>
            )
          })}
        </div>
      )}

      {estoqueAlvo && (
        <AjustarEstoqueModal
          produto={estoqueAlvo}
          onClose={() => setEstoqueAlvo(null)}
          onSucesso={novoEstoque => {
            setProdutos(prev => prev.map(x => x.id_produto === estoqueAlvo.id_produto ? { ...x, estoque_atual: novoEstoque } : x))
            setEstoqueAlvo(null)
          }}
        />
      )}
    </>
  )
}
