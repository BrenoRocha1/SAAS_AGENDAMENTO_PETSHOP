'use client'

import { useRef, useState, useTransition } from 'react'
import { cadastrarClienteLojistaAction } from '@/lib/actions'
import { formatarTelefone } from '@/lib/format'
import { IconAlert, IconCheck, IconClose, IconPlus, IconUsers } from '@/components/icons'

export interface ClienteLinha {
  id_cliente: string
  nome: string
  telefone: string
  email: string
  pets: string[]
  totalAgendamentos: number
}

interface Props {
  clientes: ClienteLinha[]
}

export default function ClientesList({ clientes }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function openNew() {
    setError(null)
    setSuccess(null)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget

    startTransition(async () => {
      const result = await cadastrarClienteLojistaAction(new FormData(form))
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess('Cliente cadastrado com sucesso! Ele já pode fazer login.')
        closeModal()
        formRef.current?.reset()
        setTimeout(() => setSuccess(null), 4000)
      }
    })
  }

  return (
    <>
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{success}</span>
        </div>
      )}

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <button onClick={openNew} className="btn btn-primary" id="btn-novo-cliente">
          <IconPlus style={{ width: 16, height: 16 }} /> Novo Cliente
        </button>
      </div>

      {clientes.length === 0 ? (
        <div className="empty-state card">
          <IconUsers style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum cliente ainda</div>
          <p style={{ marginBottom: 'var(--space-5)' }}>
            Cadastre um cliente ou espere o primeiro agendamento
          </p>
          <button onClick={openNew} className="btn btn-primary">
            Cadastrar primeiro cliente
          </button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>Pets</th>
                <th>Agendamentos</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id_cliente}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'var(--primary-600)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          color: 'white',
                          flexShrink: 0,
                        }}
                      >
                        {c.nome?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{c.nome}</span>
                    </div>
                  </td>
                  <td>
                    <div>{formatarTelefone(c.telefone)}</div>
                    <div className="text-sm text-muted">{c.email}</div>
                  </td>
                  <td>
                    {c.pets.length === 0 ? (
                      <span className="text-sm text-muted">Sem pet cadastrado</span>
                    ) : (
                      <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                        {c.pets.map(p => (
                          <span key={p} className="badge badge-ativo" style={{ fontSize: '0.7rem' }}>{p}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="font-semibold" style={{ color: 'var(--primary-400)' }}>
                      {c.totalAgendamentos}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            className="card animate-slide-up"
            style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--gray-100)',
                fontFamily: 'var(--font-heading)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}>
                <IconUsers style={{ width: 18, height: 18 }} />
                Novo Cliente
              </h2>
              <button onClick={closeModal} className="btn btn-ghost btn-sm" aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="cli-nome" className="form-label form-label-required">Nome completo</label>
                <input
                  id="cli-nome"
                  name="nome"
                  type="text"
                  className="form-input"
                  placeholder="Maria Silva"
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="cli-cpf" className="form-label form-label-required">CPF</label>
                  <input
                    id="cli-cpf"
                    name="cpf"
                    type="text"
                    className="form-input"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cli-telefone" className="form-label form-label-required">Telefone</label>
                  <input
                    id="cli-telefone"
                    name="telefone"
                    type="tel"
                    className="form-input"
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="cli-email" className="form-label form-label-required">E-mail (será usado para login)</label>
                <input
                  id="cli-email"
                  name="email"
                  type="email"
                  className="form-input"
                  placeholder="cliente@email.com"
                  required
                />
              </div>

              <div className="separator" />

              <div className="form-group">
                <label htmlFor="cli-senha" className="form-label form-label-required">Senha de acesso</label>
                <input
                  id="cli-senha"
                  name="senha"
                  type="password"
                  className="form-input"
                  placeholder="Mín. 8 chars, 1 maiúscula, 1 número, 1 especial"
                  required
                />
                <span className="form-hint">O cliente usará este e-mail e senha para acessar o sistema</span>
              </div>
              <div className="form-group">
                <label htmlFor="cli-confirmaSenha" className="form-label form-label-required">Confirmar senha</label>
                <input
                  id="cli-confirmaSenha"
                  name="confirmaSenha"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button type="button" onClick={closeModal} className="btn btn-ghost">
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
                  disabled={isPending}
                  id="btn-salvar-cliente"
                >
                  {isPending ? 'Cadastrando...' : 'Cadastrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
