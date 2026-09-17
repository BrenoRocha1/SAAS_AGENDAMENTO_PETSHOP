'use client'

import { useState, useTransition } from 'react'
import { cadastrarClienteLojistaAction, editarClienteLojistaAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconClose, IconUsers } from '@/components/icons'

export interface ClienteParaEditar {
  id_cliente: string
  nome: string
  telefone: string
}

interface Props {
  cliente: ClienteParaEditar | null // null = cadastro novo; preenchido = edição
  onClose: () => void
  onSaved: () => void
}

export default function ClienteFormModal({ cliente, onClose, onSaved }: Props) {
  const isEdicao = !!cliente
  const [error, setError] = useState<string | null>(null)
  const [convidado, setConvidado] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = isEdicao
        ? await editarClienteLojistaAction(cliente!.id_cliente, formData)
        : await cadastrarClienteLojistaAction(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      if (isEdicao) {
        onSaved()
      } else {
        setConvidado(true)
      }
    })
  }

  if (convidado) {
    return (
      <div className="modal-overlay" onClick={onSaved}>
        <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">Convite enviado</h3>
            <button className="modal-close" onClick={onSaved} aria-label="Fechar">
              <IconClose style={{ width: 15, height: 15 }} />
            </button>
          </div>
          <div className="modal-body">
            <div className="alert alert-success">
              <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>
                O cliente já aparece na sua lista e recebeu um e-mail para definir a própria senha
                e acessar o sistema.
              </span>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-primary" onClick={onSaved}>Fechar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <IconUsers style={{ width: 17, height: 17, marginRight: 'var(--space-2)', verticalAlign: -3 }} />
            {isEdicao ? `Editar ${cliente!.nome}` : 'Novo Cliente'}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="cli-nome" className="form-label form-label-required">Nome completo</label>
              <input
                id="cli-nome"
                name="nome"
                type="text"
                className="form-input"
                placeholder="Maria Silva"
                defaultValue={cliente?.nome ?? ''}
                required
                disabled={isPending}
              />
            </div>

            {isEdicao ? (
              <div className="form-group">
                <label htmlFor="cli-telefone" className="form-label form-label-required">Telefone</label>
                <input
                  id="cli-telefone"
                  name="telefone"
                  type="tel"
                  className="form-input"
                  placeholder="(11) 99999-9999"
                  defaultValue={cliente?.telefone ?? ''}
                  required
                  disabled={isPending}
                />
                <span className="form-hint">E-mail e CPF não são editáveis por aqui — e-mail é o login do cliente.</span>
              </div>
            ) : (
              <>
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
                      disabled={isPending}
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
                      disabled={isPending}
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
                    disabled={isPending}
                  />
                  <span className="form-hint">
                    O cliente vai receber um e-mail nesse endereço para definir a própria senha
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>
              Cancelar
            </button>
            <button
              type="submit"
              className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
              disabled={isPending}
              id="btn-salvar-cliente"
            >
              {isPending ? 'Salvando...' : isEdicao ? 'Salvar Alterações' : 'Convidar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
