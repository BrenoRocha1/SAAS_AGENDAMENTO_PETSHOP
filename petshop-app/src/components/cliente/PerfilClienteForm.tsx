'use client'

import { useState, useTransition } from 'react'
import { atualizarPerfilClienteAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconSave } from '@/components/icons'

interface Cliente {
  nome: string
  email: string
  cpf: string
  telefone: string
}

interface Props {
  cliente: Cliente
}

function formatarCpf(cpf: string) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export default function PerfilClienteForm({ cliente }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await atualizarPerfilClienteAction(new FormData(form))
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: 580 }}>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-5)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Perfil atualizado com sucesso!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className="form-group">
          <label htmlFor="nome" className="form-label form-label-required">Nome</label>
          <input id="nome" name="nome" type="text" className="form-input" defaultValue={cliente.nome} maxLength={120} required />
        </div>

        <div className="form-group">
          <label htmlFor="telefone" className="form-label form-label-required">Telefone</label>
          <input
            id="telefone"
            name="telefone"
            type="tel"
            className="form-input"
            defaultValue={cliente.telefone}
            placeholder="(11) 99999-9999"
            required
          />
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label htmlFor="email" className="form-label">E-mail</label>
            <input id="email" type="email" className="form-input" value={cliente.email} disabled />
            <span className="form-hint">O e-mail não pode ser alterado</span>
          </div>
          <div className="form-group">
            <label htmlFor="cpf" className="form-label">CPF</label>
            <input id="cpf" type="text" className="form-input" value={formatarCpf(cliente.cpf)} disabled />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending}
          >
            {isPending ? 'Salvando...' : (<><IconSave style={{ width: 15, height: 15 }} /> Salvar alterações</>)}
          </button>
        </div>
      </form>
    </div>
  )
}
