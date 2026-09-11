'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  criarServicoAction,
  editarServicoAction,
  adicionarVariacaoServicoAction,
  removerVariacaoServicoAction,
} from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { IconAlert, IconClose, IconPencil, IconPlus, IconScissors, IconSliders, IconTrash } from '@/components/icons'

interface Servico {
  id_servico: string
  nome: string
  descricao?: string
  preco: number
  duracao: number
  status: string
}

interface Variacao {
  id_variacao: string
  tipo: 'porte' | 'raca'
  especie: 'Cão' | 'Gato'
  porte: 'Pequeno' | 'Médio' | 'Grande' | null
  raca: string | null
  preco: number
}

interface Props {
  servicos: Servico[]
}

export default function ServicosList({ servicos: inicial }: Props) {
  const supabase = createClient()
  const [servicos, setServicos] = useState<Servico[]>(inicial)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Servico | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function abrirNovo() {
    setEditando(null)
    setError(null)
    setShowModal(true)
  }

  function abrirEditar(s: Servico) {
    setEditando(s)
    setError(null)
    setShowModal(true)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = editando
        ? await editarServicoAction(editando.id_servico, new FormData(form))
        : await criarServicoAction(new FormData(form))
      if (result?.error) {
        setError(result.error)
      } else {
        setShowModal(false)
        // Recarregar lista
        const { data } = await supabase.from('servico').select('*').order('created_at', { ascending: false })
        setServicos(data ?? [])
      }
    })
  }

  return (
    <>
      <div className="flex justify-end" style={{ marginBottom: 'var(--space-5)' }}>
        <button className="btn btn-primary" onClick={abrirNovo} id="btn-novo-servico">
          <IconPlus style={{ width: 16, height: 16 }} /> Novo Serviço
        </button>
      </div>

      {servicos.length === 0 ? (
        <div className="empty-state card">
          <IconScissors style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum serviço cadastrado</div>
          <p style={{ marginBottom: 'var(--space-4)' }}>Cadastre seus serviços para que os clientes possam agendar</p>
          <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar primeiro serviço</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Preço</th>
                <th>Duração</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {servicos.map(s => (
                <tr key={s.id_servico}>
                  <td>
                    <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                    {s.descricao && <div className="text-sm text-muted">{s.descricao}</div>}
                  </td>
                  <td className="text-success font-semibold">R$ {Number(s.preco).toFixed(2)}</td>
                  <td>{s.duracao} min</td>
                  <td>
                    <span className={`badge badge-${s.status === 'Ativo' ? 'ativo' : 'inativo'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => abrirEditar(s)}
                    >
                      <IconPencil style={{ width: 14, height: 14 }} /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editando ? 'Editar Serviço' : 'Novo Serviço'}</h3>
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
                  <label htmlFor="nome" className="form-label form-label-required">Nome do Serviço</label>
                  <input
                    id="nome"
                    name="nome"
                    type="text"
                    className="form-input"
                    defaultValue={editando?.nome}
                    placeholder="Ex: Banho e Tosa"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="descricao" className="form-label">Descrição</label>
                  <textarea
                    id="descricao"
                    name="descricao"
                    className="form-textarea"
                    defaultValue={editando?.descricao}
                    placeholder="Descreva o serviço..."
                    rows={2}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="preco" className="form-label form-label-required">Preço (R$)</label>
                    <input
                      id="preco"
                      name="preco"
                      type="number"
                      className="form-input"
                      defaultValue={editando?.preco}
                      placeholder="45.00"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="duracao" className="form-label form-label-required">Duração (min)</label>
                    <input
                      id="duracao"
                      name="duracao"
                      type="number"
                      className="form-input"
                      defaultValue={editando?.duracao}
                      placeholder="60"
                      min="15"
                      max="480"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="status" className="form-label">Status</label>
                  <select id="status" name="status" className="form-select" defaultValue={editando?.status ?? 'Ativo'}>
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </select>
                </div>

                {editando ? (
                  <PrecosVariacoes idServico={editando.id_servico} />
                ) : (
                  <p className="text-sm text-muted">
                    Salve o serviço primeiro para poder configurar preços diferentes por porte ou raça.
                  </p>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-salvar-servico"
                  className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
                  disabled={isPending}
                >
                  {isPending ? 'Salvando...' : 'Salvar Serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// Preços e Variações — cobrar diferente por porte ou por raça
// específica. Só existe em edição (precisa de um id_servico salvo).
// Ver migration 010 (servico_variacao) e fn_calcular_preco_servico.
// ============================================================
function PrecosVariacoes({ idServico }: { idServico: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [aberto, setAberto] = useState(false)
  const [variacoes, setVariacoes] = useState<Variacao[] | null>(null)
  const [tipo, setTipo] = useState<'porte' | 'raca'>('porte')
  const [especie, setEspecie] = useState<'Cão' | 'Gato'>('Cão')
  const [porte, setPorte] = useState('')
  const [raca, setRaca] = useState('')
  const [preco, setPreco] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function carregar() {
    const { data } = await supabase
      .from('servico_variacao')
      .select('*')
      .eq('id_servico', idServico)
      .order('created_at')
    setVariacoes((data as Variacao[]) ?? [])
  }

  useEffect(() => {
    if (!aberto || variacoes !== null) return
    let cancelado = false
    supabase
      .from('servico_variacao')
      .select('*')
      .eq('id_servico', idServico)
      .order('created_at')
      .then(({ data }) => {
        if (!cancelado) setVariacoes((data as Variacao[]) ?? [])
      })
    return () => { cancelado = true }
  }, [aberto, idServico]) // eslint-disable-line react-hooks/exhaustive-deps

  function adicionar() {
    setErro(null)
    if (tipo === 'porte' && !porte) { setErro('Selecione o porte'); return }
    if (tipo === 'raca' && !raca.trim()) { setErro('Informe a raça'); return }
    if (!preco) { setErro('Informe o preço'); return }

    const fd = new FormData()
    fd.set('tipo', tipo)
    fd.set('especie', especie)
    if (tipo === 'porte') fd.set('porte', porte)
    else fd.set('raca', raca.trim())
    fd.set('preco', preco)

    startTransition(async () => {
      const result = await adicionarVariacaoServicoAction(idServico, fd)
      if (result?.error) {
        setErro(result.error)
        return
      }
      setPorte('')
      setRaca('')
      setPreco('')
      await carregar()
    })
  }

  function remover(id_variacao: string) {
    startTransition(async () => {
      await removerVariacaoServicoAction(id_variacao)
      await carregar()
    })
  }

  return (
    <div className="form-group">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="picker-item"
        style={{ width: '100%' }}
      >
        <span className="dash-icon-btn" style={{ width: 32, height: 32, cursor: 'default' }}>
          <IconSliders style={{ width: 15, height: 15 }} />
        </span>
        <div className="picker-item-main">
          <div className="picker-item-title">Preços e Variações</div>
          <div className="picker-item-sub">Cobrar diferente por porte, espécie ou raça</div>
        </div>
      </button>

      {aberto && (
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p className="text-xs text-muted">
            Prioridade de cálculo: <strong>raça específica</strong> &gt; <strong>porte + espécie</strong> &gt; preço base.
          </p>

          {erro && (
            <div className="alert alert-error">
              <IconAlert style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
              <span>{erro}</span>
            </div>
          )}

          {variacoes === null ? (
            <p className="text-sm text-muted">Carregando...</p>
          ) : variacoes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {variacoes.map(v => (
                <div key={v.id_variacao} className="flex items-center justify-between" style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--gray-850)',
                  border: '1px solid var(--gray-800)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <span className="text-sm">
                    {v.especie} · {v.tipo === 'raca' ? v.raca : v.porte}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-success">R$ {Number(v.preco).toFixed(2)}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => remover(v.id_variacao)} disabled={isPending} aria-label="Remover">
                      <IconTrash style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className={`btn btn-sm ${tipo === 'porte' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('porte')}>
              Por porte
            </button>
            <button type="button" className={`btn btn-sm ${tipo === 'raca' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTipo('raca')}>
              Por raça
            </button>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Espécie</label>
              <select className="form-select" value={especie} onChange={e => setEspecie(e.target.value as 'Cão' | 'Gato')}>
                <option value="Cão">Cão</option>
                <option value="Gato">Gato</option>
              </select>
            </div>
            {tipo === 'porte' ? (
              <div className="form-group">
                <label className="form-label">Porte</label>
                <select className="form-select" value={porte} onChange={e => setPorte(e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Pequeno">Pequeno</option>
                  <option value="Médio">Médio</option>
                  <option value="Grande">Grande</option>
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Raça</label>
                <input className="form-input" value={raca} onChange={e => setRaca(e.target.value)} placeholder="Ex: Poodle" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Preço (R$)</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                min="0"
                value={preco}
                onChange={e => setPreco(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <button type="button" className="btn btn-secondary btn-sm" onClick={adicionar} disabled={isPending} style={{ alignSelf: 'flex-start' }}>
            <IconPlus style={{ width: 14, height: 14 }} /> {isPending ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      )}
    </div>
  )
}
