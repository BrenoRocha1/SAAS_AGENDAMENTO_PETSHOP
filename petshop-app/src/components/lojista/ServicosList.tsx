'use client'

import { useState, useTransition } from 'react'
import { criarServicoAction, editarServicoAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'

interface Servico {
  id_servico: string
  nome: string
  descricao?: string
  preco: number
  duracao: number
  status: string
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
          + Novo Serviço
        </button>
      </div>

      {servicos.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">✂️</div>
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
                      ✏️ Editar
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
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-error">
                    <span>⚠️</span><span>{error}</span>
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
