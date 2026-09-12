'use client'

import { useState, useTransition } from 'react'
import { atualizarPerfilLojistaAction, alternarKanbanAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconKanban, IconSave } from '@/components/icons'

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
  kanban_ativo?: boolean | null
}

interface Props {
  lojista: Lojista | null
}

export default function PerfilLojistaForm({ lojista }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [kanbanAtivo, setKanbanAtivo] = useState(lojista?.kanban_ativo ?? true)
  const [kanbanErro, setKanbanErro] = useState<string | null>(null)
  const [kanbanPending, startKanbanTransition] = useTransition()

  function handleAlternarKanban() {
    setKanbanErro(null)
    const novoValor = !kanbanAtivo
    startKanbanTransition(async () => {
      const result = await alternarKanbanAction(novoValor)
      if (result?.error) {
        setKanbanErro(result.error)
        return
      }
      setKanbanAtivo(novoValor)
    })
  }

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
        <IconAlert style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Perfil não encontrado</div>
        <p>Erro ao carregar dados da loja.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
    <div className="card">
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
            {isPending ? 'Salvando...' : (<><IconSave style={{ width: 15, height: 15 }} /> Salvar alterações</>)}
          </button>
        </div>
      </form>
    </div>

    <div className="card">
      <h4 style={{ marginBottom: 'var(--space-4)', color: 'var(--gray-300)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Gestor de Agendamentos
      </h4>

      {kanbanErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{kanbanErro}</span>
        </div>
      )}

      <div className="flex items-center justify-between" style={{ gap: 'var(--space-4)' }}>
        <div className="flex items-center gap-3">
          <span className="dash-icon-btn" style={{ cursor: 'default' }}>
            <IconKanban style={{ width: 17, height: 17 }} />
          </span>
          <div>
            <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Kanban de Agendamentos</div>
            <div className="text-sm text-muted">
              Ative pra acompanhar os atendimentos em tempo real, separados por Pendente, Em Andamento e Finalizado.
              {!kanbanAtivo && ' Desativado, o item some do menu lateral.'}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${kanbanAtivo ? 'btn-success' : 'btn-secondary'}`}
          onClick={handleAlternarKanban}
          disabled={kanbanPending}
          style={{ flexShrink: 0 }}
        >
          {kanbanPending ? 'Salvando...' : kanbanAtivo ? 'Ativado' : 'Desativado'}
        </button>
      </div>
    </div>
    </div>
  )
}
