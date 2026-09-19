'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  criarProdutoAction,
  editarProdutoAction,
  excluirProdutoAction,
  alternarStatusProdutoAction,
  criarCategoriaProdutoAction,
  editarCategoriaProdutoAction,
  excluirCategoriaProdutoAction,
  atualizarFotoProdutoAction,
  removerFotoProdutoAction,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { otimizarImagemParaUpload } from '@/lib/imagem'
import { UNIDADES_VENDA, rotuloUnidade, rotuloEstoque, statusEstoque, ROTULO_STATUS_ESTOQUE, BADGE_STATUS_ESTOQUE } from '@/lib/produto'
import CampoQuantidade from './CampoQuantidade'
import AjustarEstoqueModal from './AjustarEstoqueModal'
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconImage,
  IconPackage,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSliders,
  IconTrash,
} from '@/components/icons'

interface Categoria {
  id_categoria: string
  nome: string
}

interface Produto {
  id_produto: string
  nome: string
  id_categoria: string | null
  unidade_venda: string
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  status: string
  foto_url: string | null
}

interface Props {
  produtos: Produto[]
  categorias: Categoria[]
}

type FotoPendente = { blob: Blob; extensao: string; preview: string }

const TIPOS_IMAGEM_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']
const IMAGEM_TAMANHO_MAXIMO = 5 * 1024 * 1024 // 5 MB — mesmo limite do servidor

export default function ProdutosList({ produtos: inicial, categorias: categoriasIniciais }: Props) {
  const supabase = createClient()
  const [produtos, setProdutos] = useState<Produto[]>(inicial)
  const [categorias, setCategorias] = useState<Categoria[]>(categoriasIniciais)
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Produto | null>(null)
  const [unidadeSelecionada, setUnidadeSelecionada] = useState('unidade')
  const [error, setError] = useState<string | null>(null)

  const fotoInputRef = useRef<HTMLInputElement>(null)
  const [fotoPendente, setFotoPendente] = useState<FotoPendente | null>(null)
  const [removerFotoAoSalvar, setRemoverFotoAoSalvar] = useState(false)
  const [processandoFoto, setProcessandoFoto] = useState(false)

  const [estoqueAlvo, setEstoqueAlvo] = useState<Produto | null>(null)

  const [confirmarExclusao, setConfirmarExclusao] = useState<Produto | null>(null)
  const [excluirErro, setExcluirErro] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const [alternandoId, setAlternandoId] = useState<string | null>(null)
  const [alternarErro, setAlternarErro] = useState<string | null>(null)

  const [gerenciarCategorias, setGerenciarCategorias] = useState(false)
  const [categoriaErro, setCategoriaErro] = useState<string | null>(null)
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('')
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<string | null>(null)
  const [categoriaEditandoNome, setCategoriaEditandoNome] = useState('')
  const [isPendingCategoria, startTransitionCategoria] = useTransition()

  const [isPending, startTransition] = useTransition()

  const produtosFiltrados = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase()
    return produtos.filter(p => {
      if (categoriaFiltro && p.id_categoria !== categoriaFiltro) return false
      if (buscaLower && !p.nome.toLowerCase().includes(buscaLower)) return false
      return true
    })
  }, [produtos, busca, categoriaFiltro])

  // Nome da categoria resolvido aqui, a partir de `categorias` — não via
  // embed no select (produto.categoria_produto(nome)), que depende do
  // PostgREST reconhecer a FK no cache de schema. Um select plano não
  // tem essa dependência.
  const nomeCategoriaPorId = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const c of categorias) mapa.set(c.id_categoria, c.nome)
    return mapa
  }, [categorias])

  async function recarregar() {
    const { data, error: erroRecarga } = await supabase.from('produto').select('*').order('nome')
    // Nunca esvazia a lista por causa de um erro passageiro de rede — só
    // atualiza quando a consulta realmente veio (mesmo que vazia de
    // verdade, `data` chega como array, não undefined/erro).
    if (erroRecarga) return
    setProdutos((data as Produto[]) ?? [])
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

  function limparEstadoFoto() {
    if (fotoPendente) URL.revokeObjectURL(fotoPendente.preview)
    setFotoPendente(null)
    setRemoverFotoAoSalvar(false)
    setProcessandoFoto(false)
  }

  function abrirNovo() {
    setEditando(null)
    setUnidadeSelecionada('unidade')
    setError(null)
    limparEstadoFoto()
    setShowModal(true)
  }

  function abrirEditar(p: Produto) {
    setEditando(p)
    setUnidadeSelecionada(p.unidade_venda)
    setError(null)
    limparEstadoFoto()
    setShowModal(true)
  }

  async function handleSelecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return

    setError(null)
    if (!TIPOS_IMAGEM_ACEITOS.includes(arquivo.type)) {
      setError('Formato de imagem inválido. Envie um arquivo JPG, PNG ou WEBP.')
      return
    }

    setProcessandoFoto(true)
    try {
      const otimizada = await otimizarImagemParaUpload(arquivo)
      if (otimizada.blob.size > IMAGEM_TAMANHO_MAXIMO) {
        setError('Imagem muito grande mesmo após otimização. Tente uma imagem menor.')
        return
      }
      if (fotoPendente) URL.revokeObjectURL(fotoPendente.preview)
      setFotoPendente({ blob: otimizada.blob, extensao: otimizada.extensao, preview: URL.createObjectURL(otimizada.blob) })
      setRemoverFotoAoSalvar(false)
    } catch {
      setError('Não foi possível processar essa imagem. Tente outro arquivo.')
    } finally {
      setProcessandoFoto(false)
    }
  }

  function handleRemoverFotoEscolhida() {
    if (fotoPendente) {
      URL.revokeObjectURL(fotoPendente.preview)
      setFotoPendente(null)
    } else if (editando?.foto_url) {
      setRemoverFotoAoSalvar(true)
    }
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
        return
      }

      const idProduto: string | undefined = editando?.id_produto ?? (result as { id_produto?: string }).id_produto
      if (fotoPendente && idProduto) {
        const fotoFd = new FormData()
        fotoFd.set('foto', fotoPendente.blob, `foto.${fotoPendente.extensao}`)
        const fotoResult = await atualizarFotoProdutoAction(idProduto, fotoFd)
        if (fotoResult?.error) {
          setError(`Produto salvo, mas a foto não pôde ser enviada: ${fotoResult.error}`)
        }
      } else if (removerFotoAoSalvar && idProduto) {
        await removerFotoProdutoAction(idProduto)
      }

      setShowModal(false)
      limparEstadoFoto()
      await recarregar()
    })
  }

  function criarCategoria() {
    const nome = novaCategoriaNome.trim()
    if (!nome) return
    setCategoriaErro(null)
    const fd = new FormData()
    fd.set('nome', nome)
    startTransitionCategoria(async () => {
      const result = await criarCategoriaProdutoAction(fd)
      if (result?.error) {
        setCategoriaErro(result.error)
        return
      }
      if (result.categoria) setCategorias(prev => [...prev, result.categoria as Categoria].sort((a, b) => a.nome.localeCompare(b.nome)))
      setNovaCategoriaNome('')
    })
  }

  function salvarRenomeioCategoria(id_categoria: string) {
    const nome = categoriaEditandoNome.trim()
    if (!nome) return
    setCategoriaErro(null)
    const fd = new FormData()
    fd.set('nome', nome)
    startTransitionCategoria(async () => {
      const result = await editarCategoriaProdutoAction(id_categoria, fd)
      if (result?.error) {
        setCategoriaErro(result.error)
        return
      }
      setCategorias(prev => prev.map(c => c.id_categoria === id_categoria ? { ...c, nome } : c).sort((a, b) => a.nome.localeCompare(b.nome)))
      setCategoriaEditandoId(null)
      await recarregar()
    })
  }

  function excluirCategoria(id_categoria: string) {
    setCategoriaErro(null)
    startTransitionCategoria(async () => {
      const result = await excluirCategoriaProdutoAction(id_categoria)
      if (result?.error) {
        setCategoriaErro(result.error)
        return
      }
      setCategorias(prev => prev.filter(c => c.id_categoria !== id_categoria))
      if (categoriaFiltro === id_categoria) setCategoriaFiltro('')
      await recarregar()
    })
  }

  const fotoAtualParaExibir = fotoPendente?.preview ?? (!removerFotoAoSalvar ? editando?.foto_url : null) ?? null

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
            {categorias.map(c => (
              <option key={c.id_categoria} value={c.id_categoria}>{c.nome}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => { setCategoriaErro(null); setGerenciarCategorias(true) }}>
            <IconSliders style={{ width: 15, height: 15 }} /> Categorias
          </button>
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
                const st = statusEstoque(p.estoque_atual, p.estoque_minimo)
                return (
                  <tr key={p.id_produto}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div style={{
                          width: 36, height: 36, borderRadius: 'var(--radius-md)', flexShrink: 0,
                          border: '1px solid var(--gray-800)', background: 'var(--gray-850)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                        }}>
                          {p.foto_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                            <img src={p.foto_url} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <IconImage style={{ width: 15, height: 15, color: 'var(--gray-600)' }} />
                          )}
                        </div>
                        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</div>
                      </div>
                    </td>
                    <td className="text-sm text-muted">{(p.id_categoria && nomeCategoriaPorId.get(p.id_categoria)) ?? 'Sem categoria'}</td>
                    <td className="text-success font-semibold">
                      R$ {Number(p.preco_venda).toFixed(2)} <span className="text-xs text-muted">/ {rotuloUnidade(p.unidade_venda)}</span>
                    </td>
                    <td>
                      <div>{rotuloEstoque(p.estoque_atual, p.unidade_venda)}</div>
                      {st !== 'em_estoque' && (
                        <span className={`badge ${BADGE_STATUS_ESTOQUE[st]}`} style={{ marginTop: 4 }}>
                          <IconAlert style={{ width: 11, height: 11 }} /> {ROTULO_STATUS_ESTOQUE[st]}
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
                        <button className="btn btn-ghost btn-sm" onClick={() => setEstoqueAlvo(p)}>
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
                  <label className="form-label">Foto do produto</label>
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 64, height: 64, borderRadius: 'var(--radius-md)', flexShrink: 0,
                      border: '1px solid var(--gray-800)', background: 'var(--gray-850)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                      {fotoAtualParaExibir ? (
                        // eslint-disable-next-line @next/next/no-img-element -- preview local ou URL pública do Storage
                        <img src={fotoAtualParaExibir} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <IconImage style={{ width: 22, height: 22, color: 'var(--gray-600)' }} />
                      )}
                    </div>
                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                      <input
                        ref={fotoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleSelecionarFoto}
                        style={{ display: 'none' }}
                        disabled={processandoFoto}
                      />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => fotoInputRef.current?.click()} disabled={processandoFoto}>
                        <IconPlus style={{ width: 14, height: 14 }} /> {fotoAtualParaExibir ? 'Alterar foto' : 'Adicionar foto'}
                      </button>
                      {fotoAtualParaExibir && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleRemoverFotoEscolhida}>
                          <IconTrash style={{ width: 14, height: 14 }} /> Remover
                        </button>
                      )}
                    </div>
                  </div>
                  {processandoFoto && <p className="text-xs text-muted" style={{ marginTop: 4 }}>Processando imagem...</p>}
                </div>

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
                    <label htmlFor="id_categoria" className="form-label form-label-required">Categoria</label>
                    <select id="id_categoria" name="id_categoria" className="form-select" defaultValue={editando?.id_categoria ?? categorias[0]?.id_categoria ?? ''} required>
                      {categorias.map(c => (
                        <option key={c.id_categoria} value={c.id_categoria}>{c.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="unidade_venda" className="form-label form-label-required">Unidade de venda</label>
                    <select
                      id="unidade_venda"
                      name="unidade_venda"
                      className="form-select"
                      value={unidadeSelecionada}
                      onChange={e => setUnidadeSelecionada(e.target.value)}
                      required
                    >
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
                  <CampoQuantidade
                    name="estoque_minimo"
                    label="Estoque mínimo"
                    unidadeVenda={unidadeSelecionada}
                    valorInicial={editando?.estoque_minimo ?? 0}
                    hint='Abaixo disso, o produto aparece como "Baixo" na tela de Estoque. Deixe 0 pra não alertar.'
                  />
                </div>

                {!editando && (
                  <>
                    <CampoQuantidade name="estoque_atual" label="Estoque atual" required unidadeVenda={unidadeSelecionada} />
                    <p className="text-xs text-muted" style={{ marginTop: '-8px' }}>
                      Quanto a loja já tem hoje. Depois de cadastrado, o estoque só muda pelo botão &quot;Estoque&quot; da listagem.
                    </p>
                  </>
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
                  disabled={isPending || processandoFoto}
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
        <AjustarEstoqueModal
          produto={estoqueAlvo}
          onClose={() => setEstoqueAlvo(null)}
          onSucesso={novoEstoque => {
            setProdutos(prev => prev.map(x => x.id_produto === estoqueAlvo.id_produto ? { ...x, estoque_atual: novoEstoque } : x))
            setEstoqueAlvo(null)
          }}
        />
      )}

      {/* Modal: gerenciar categorias */}
      {gerenciarCategorias && (
        <div className="modal-overlay" onClick={() => setGerenciarCategorias(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Categorias de produto</h3>
              <button className="modal-close" onClick={() => setGerenciarCategorias(false)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              {categoriaErro && (
                <div className="alert alert-error">
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{categoriaErro}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {categorias.map(c => (
                  <div key={c.id_categoria} className="flex items-center gap-2" style={{
                    padding: 'var(--space-2) var(--space-3)', background: 'var(--gray-850)',
                    border: '1px solid var(--gray-800)', borderRadius: 'var(--radius-sm)',
                  }}>
                    {categoriaEditandoId === c.id_categoria ? (
                      <>
                        <input
                          className="form-input"
                          style={{ flex: 1 }}
                          value={categoriaEditandoNome}
                          onChange={e => setCategoriaEditandoNome(e.target.value)}
                          autoFocus
                        />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => salvarRenomeioCategoria(c.id_categoria)} disabled={isPendingCategoria} aria-label="Salvar">
                          <IconCheck style={{ width: 14, height: 14 }} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCategoriaEditandoId(null)} aria-label="Cancelar">
                          <IconClose style={{ width: 14, height: 14 }} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm" style={{ flex: 1 }}>{c.nome}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setCategoriaEditandoId(c.id_categoria); setCategoriaEditandoNome(c.nome) }}
                          aria-label="Renomear"
                        >
                          <IconPencil style={{ width: 14, height: 14 }} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => excluirCategoria(c.id_categoria)}
                          disabled={isPendingCategoria}
                          aria-label="Excluir"
                          title="Excluir categoria (produtos dela ficam sem categoria)"
                        >
                          <IconTrash style={{ width: 14, height: 14 }} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {categorias.length === 0 && (
                  <p className="text-sm text-muted">Nenhuma categoria cadastrada ainda.</p>
                )}
              </div>

              <div className="flex gap-2" style={{ marginTop: 'var(--space-4)' }}>
                <input
                  className="form-input"
                  placeholder="Nova categoria"
                  value={novaCategoriaNome}
                  onChange={e => setNovaCategoriaNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criarCategoria() } }}
                  maxLength={50}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={criarCategoria} disabled={isPendingCategoria || !novaCategoriaNome.trim()}>
                  <IconPlus style={{ width: 14, height: 14 }} /> Adicionar
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setGerenciarCategorias(false)}>Fechar</button>
            </div>
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
