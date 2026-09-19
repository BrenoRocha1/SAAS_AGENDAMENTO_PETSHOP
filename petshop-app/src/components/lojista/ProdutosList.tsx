'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  criarProdutoAction,
  editarProdutoAction,
  excluirProdutoAction,
  alternarStatusProdutoAction,
  movimentarEstoqueAction,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIAS_PRODUTO, UNIDADES_VENDA, rotuloUnidade, rotuloEstoque, estoqueBaixo } from '@/lib/produto'
import {
  IconAlert,
  IconClose,
  IconMinus,
  IconPackage,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@/components/icons'

interface Produto {
  id_produto: string
  nome: string
  categoria: string
  unidade_venda: string
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  status: string
}

interface Props {
  produtos: Produto[]
}

export default function ProdutosList({ produtos: inicial }: Props) {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>(inicial)
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Produto | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [estoqueAlvo, setEstoqueAlvo] = useState<Produto | null>(null)
  const [estoqueErro, setEstoqueErro] = useState<string | null>(null)

  const [confirmarExclusao, setConfirmarExclusao] = useState<Produto | null>(null)
  const [excluirErro, setExcluirErro] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const [alternandoId, setAlternandoId] = useState<string | null>(null)
  const [alternarErro, setAlternarErro] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()

  const produtosFiltrados = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase()
    return produtos.filter(p => {
      if (categoriaFiltro && p.categoria !== categoriaFiltro) return false
      if (buscaLower && !p.nome.toLowerCase().includes(buscaLower)) return false
      return true
    })
  }, [produtos, busca, categoriaFiltro])

  async function recarregar() {
    const { data } = await supabase.from('produto').select('*').order('nome')
    setProdutos(data ?? [])
  }

  function handleAlternarStatus(p: Produto) {
    setAlternarErro(null)
    const novoStatus = p.status === 'Ativo' ? 'Inativo' : 'Ativo'
    setAlternandoId(p.id_produto)
    startTransition(async () => {
      const result = await alternarStatusProdutoAction(p.id_produto, novoStatus === 'Ativo')
      setAlternandoId(null)
      if (result?.error) {
        setAlternarErro(result.error)
        return
      }
      setProdutos(prev => prev.map(x => x.id_produto === p.id_produto ? { ...x, status: novoStatus } : x))
    })
  }

  function handleExcluir(p: Produto) {
    setExcluirErro(null)
    setConfirmarExclusao(p)
  }

  function confirmarExclusaoDoProduto() {
    if (!confirmarExclusao) return
    const p = confirmarExclusao
    setExcluindoId(p.id_produto)
    startTransition(async () => {
      const result = await excluirProdutoAction(p.id_produto)
      setExcluindoId(null)
      setConfirmarExclusao(null)
      if (result?.error) {
        setExcluirErro(result.error)
      } else {
        setProdutos(prev => prev.filter(x => x.id_produto !== p.id_produto))
      }
    })
  }

  function abrirNovo() {
    setEditando(null)
    setError(null)
    setShowModal(true)
  }

  function abrirEditar(p: Produto) {
    setEditando(p)
    setError(null)
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = editando
        ? await editarProdutoAction(editando.id_produto, formData)
        : await criarProdutoAction(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setShowModal(false)
        await recarregar()
      }
    })
  }

  function handleSubmitEstoque(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!estoqueAlvo) return
    setEstoqueErro(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await movimentarEstoqueAction(estoqueAlvo.id_produto, formData)
      if (result?.error) {
        setEstoqueErro(result.error)
        return
      }
      setEstoqueAlvo(null)
      await recarregar()
    })
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="dash-search">
            <IconSearch />
            <input
              placeholder="Buscar produto pelo nome..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <select className="form-select" value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_PRODUTO.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo} id="btn-novo-produto">
          <IconPlus style={{ width: 16, height: 16 }} /> Novo Produto
        </button>
      </div>

      {excluirErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{excluirErro}</span>
        </div>
      )}

      {alternarErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{alternarErro}</span>
        </div>
      )}

      {produtos.length === 0 ? (
        <div className="empty-state card">
          <IconPackage style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum produto cadastrado</div>
          <p style={{ marginBottom: 'var(--space-4)' }}>Cadastre os produtos que seu petshop vende, como ração, brinquedos e itens de higiene</p>
          <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar primeiro produto</button>
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="empty-state card">
          <IconSearch style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum produto encontrado</div>
          <p>Tente outro termo de busca ou outra categoria.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => {
                const baixo = estoqueBaixo(p.estoque_atual, p.estoque_minimo)
                return (
                  <tr key={p.id_produto}>
                    <td>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</div>
                    </td>
                    <td className="text-sm text-muted">{p.categoria}</td>
                    <td className="text-success font-semibold">
                      R$ {Number(p.preco_venda).toFixed(2)} <span className="text-xs text-muted">/ {rotuloUnidade(p.unidade_venda)}</span>
                    </td>
                    <td>
                      <div>{rotuloEstoque(p.estoque_atual, p.unidade_venda)}</div>
                      {baixo && (
                        <span className="badge badge-estoque-baixo" style={{ marginTop: 4 }}>
                          <IconAlert style={{ width: 11, height: 11 }} /> Estoque baixo
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`switch ${p.status === 'Ativo' ? 'switch-on' : ''}`}
                          onClick={() => handleAlternarStatus(p)}
                          disabled={alternandoId === p.id_produto}
                          role="switch"
                          aria-checked={p.status === 'Ativo'}
                          title={p.status === 'Ativo' ? 'Desativar produto' : 'Ativar produto'}
                        >
                          <span className="switch-thumb" />
                        </button>
                        {alternandoId === p.id_produto && <span className="text-xs text-muted">Salvando...</span>}
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEstoqueErro(null); setEstoqueAlvo(p) }}>
                          <IconPackage style={{ width: 14, height: 14 }} /> Estoque
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirEditar(p)}>
                          <IconPencil style={{ width: 14, height: 14 }} /> Editar
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleExcluir(p)}
                          disabled={excluindoId === p.id_produto}
                          title="Excluir produto"
                        >
                          <IconTrash style={{ width: 14, height: 14 }} />
                          {excluindoId === p.id_produto ? 'Excluindo...' : 'Excluir'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: criar/editar produto */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editando ? 'Editar Produto' : 'Novo Produto'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-error">
                    <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="nome" className="form-label form-label-required">Nome do Produto</label>
                  <input
                    id="nome"
                    name="nome"
                    type="text"
                    className="form-input"
                    defaultValue={editando?.nome}
                    placeholder="Ex: Ração Premier Adulto"
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="categoria" className="form-label form-label-required">Categoria</label>
                    <select id="categoria" name="categoria" className="form-select" defaultValue={editando?.categoria ?? CATEGORIAS_PRODUTO[0]} required>
                      {CATEGORIAS_PRODUTO.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="unidade_venda" className="form-label form-label-required">Unidade de venda</label>
                    <select id="unidade_venda" name="unidade_venda" className="form-select" defaultValue={editando?.unidade_venda ?? 'unidade'} required>
                      {UNIDADES_VENDA.map(u => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="preco_venda" className="form-label form-label-required">Preço de venda (R$)</label>
                    <input
                      id="preco_venda"
                      name="preco_venda"
                      type="number"
                      className="form-input"
                      defaultValue={editando?.preco_venda}
                      placeholder="18.90"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="estoque_minimo" className="form-label">Estoque mínimo</label>
                    <input
                      id="estoque_minimo"
                      name="estoque_minimo"
                      type="number"
                      className="form-input"
                      defaultValue={editando?.estoque_minimo ?? 0}
                      placeholder="0"
                      step="0.001"
                      min="0"
                    />
                  </div>
                </div>

                {!editando && (
                  <div className="form-group">
                    <label htmlFor="estoque_atual" className="form-label form-label-required">Estoque atual</label>
                    <input
                      id="estoque_atual"
                      name="estoque_atual"
                      type="number"
                      className="form-input"
                      placeholder="0"
                      step="0.001"
                      min="0"
                      required
                    />
                    <p className="text-xs text-muted">Quanto a loja já tem hoje. Depois de cadastrado, o estoque só muda pelo botão &quot;Estoque&quot; da listagem.</p>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-salvar-produto"
                  className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
                  disabled={isPending}
                >
                  {isPending ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: ajustar estoque */}
      {estoqueAlvo && (
        <div className="modal-overlay" onClick={() => !isPending && setEstoqueAlvo(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Ajustar estoque</h3>
              <button className="modal-close" onClick={() => setEstoqueAlvo(null)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <form onSubmit={handleSubmitEstoque}>
              <div className="modal-body">
                <p className="text-sm text-muted">
                  <strong style={{ color: 'var(--gray-200)' }}>{estoqueAlvo.nome}</strong> — estoque atual: {rotuloEstoque(estoqueAlvo.estoque_atual, estoqueAlvo.unidade_venda)}
                </p>

                {estoqueErro && (
                  <div className="alert alert-error">
                    <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{estoqueErro}</span>
                  </div>
                )}

                <TipoMovimentoPicker />

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="quantidade" className="form-label form-label-required">Quantidade ({rotuloUnidade(estoqueAlvo.unidade_venda)})</label>
                    <input
                      id="quantidade"
                      name="quantidade"
                      type="number"
                      className="form-input"
                      placeholder="0"
                      step="0.001"
                      min="0.001"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="motivo" className="form-label">Motivo (opcional)</label>
                    <input id="motivo" name="motivo" type="text" className="form-input" placeholder="Ex: Compra de fornecedor" maxLength={200} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEstoqueAlvo(null)} disabled={isPending}>
                  Cancelar
                </button>
                <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending}>
                  {isPending ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: confirmar exclusão */}
      {confirmarExclusao && (
        <div className="modal-overlay" onClick={() => !isPending && setConfirmarExclusao(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Excluir produto</h3>
              <button className="modal-close" onClick={() => setConfirmarExclusao(null)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-full)', flexShrink: 0,
                  background: 'rgba(239,68,68,0.1)', color: 'var(--danger-400)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <IconAlert style={{ width: 18, height: 18 }} />
                </span>
                <p style={{ color: 'var(--gray-200)' }}>
                  Tem certeza que deseja excluir <strong style={{ color: 'var(--gray-100)' }}>&quot;{confirmarExclusao.nome}&quot;</strong>?
                  Essa ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmarExclusao(null)} disabled={isPending}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn btn-danger ${isPending ? 'btn-loading' : ''}`}
                onClick={confirmarExclusaoDoProduto}
                disabled={isPending}
              >
                {isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Entrada (+ estoque) ou saída (- estoque) — dois botões, igual ao
// seletor "Por porte / Por raça" de Serviços, só que o valor vai num
// input escondido (o form inteiro é submetido de uma vez em
// handleSubmitEstoque, sem estado local próprio pra isso).
function TipoMovimentoPicker() {
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  return (
    <div className="form-group">
      <label className="form-label">Tipo de movimentação</label>
      <input type="hidden" name="tipo" value={tipo} />
      <div className="flex gap-2">
        <button type="button" className={`btn btn-sm ${tipo === 'entrada' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('entrada')}>
          <IconPlus style={{ width: 14, height: 14 }} /> Adicionar
        </button>
        <button type="button" className={`btn btn-sm ${tipo === 'saida' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('saida')}>
          <IconMinus style={{ width: 14, height: 14 }} /> Remover
        </button>
      </div>
    </div>
  )
}
