'use client'

import { useState, useTransition } from 'react'
import { atualizarPerfilLojistaAction } from '@/lib/actions'

interface Lojista {
  id_lojista: string
  nome_loja: string
  email: string
  telefone: string
  descricao?: string | null
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
}

interface Props {
  lojista: Lojista | null
}

export default function PerfilLojistaForm({ lojista }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await atualizarPerfilLojistaAction(new FormData(form))
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    })
  }

  if (!lojista) {
    return (
      <div className="empty-state card">
        <div className="empty-state-icon">⚠️</div>
        <div className="empty-state-title">Perfil não encontrado</div>
        <p>Erro ao carregar dados da loja.</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 700 }}>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-5)' }}>
          <span>✅</span>
          <span>Perfil atualizado com sucesso!</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Identificação */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h4 style={{ marginBottom: 'var(--space-4)', color: 'var(--gray-300)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Identificação
          </h4>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="nome_loja" className="form-label form-label-required">Nome da Loja</label>
              <input
                id="nome_loja"
                name="nome_loja"
                type="text"
                className="form-input"
                defaultValue={lojista.nome_loja}
                maxLength={150}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="telefone" className="form-label form-label-required">Telefone</label>
              <input
                id="telefone"
                name="telefone"
                type="tel"
                className="form-input"
                defaultValue={lojista.telefone}
                placeholder="(11) 99999-9999"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="descricao" className="form-label">Descrição</label>
            <textarea
              id="descricao"
              name="descricao"
              className="form-input"
              style={{ minHeight: 90, resize: 'vertical' }}
              defaultValue={lojista.descricao ?? ''}
              maxLength={500}
              placeholder="Fale sobre seu petshop, especialidades, diferenciais..."
            />
            <span className="form-hint">Máximo 500 caracteres</span>
          </div>
        </div>

        {/* Endereço */}
        <div style={{ borderTop: '1px solid var(--gray-800)', paddingTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
          <h4 style={{ marginBottom: 'var(--space-4)', color: 'var(--gray-300)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Endereço
          </h4>
          <div className="form-group">
            <label htmlFor="endereco" className="form-label">Endereço</label>
            <input
              id="endereco"
              name="endereco"
              type="text"
              className="form-input"
              defaultValue={lojista.endereco ?? ''}
              placeholder="Rua, número, bairro"
              maxLength={200}
            />
          </div>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="cidade" className="form-label">Cidade</label>
              <input
                id="cidade"
                name="cidade"
                type="text"
                className="form-input"
                defaultValue={lojista.cidade ?? ''}
                maxLength={100}
              />
            </div>
            <div className="form-group">
              <label htmlFor="estado" className="form-label">Estado (UF)</label>
              <input
                id="estado"
                name="estado"
                type="text"
                className="form-input"
                defaultValue={lojista.estado ?? ''}
                maxLength={2}
                placeholder="SP"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: 200 }}>
            <label htmlFor="cep" className="form-label">CEP</label>
            <input
              id="cep"
              name="cep"
              type="text"
              className="form-input"
              defaultValue={lojista.cep ?? ''}
              placeholder="00000-000"
              maxLength={9}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            id="btn-salvar-perfil"
            className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending}
          >
            {isPending ? 'Salvando...' : '💾 Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
