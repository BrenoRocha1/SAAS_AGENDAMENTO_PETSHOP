'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { IconAlert } from '@/components/icons'

interface Props {
  icone: ReactNode
  titulo: string
  descricao: string
  descricaoQuandoDesativado?: string
  ativoInicial: boolean
  // Server Action que persiste o valor — mesma assinatura de
  // alternarKanbanAction/alternarAgendamentoOnlineAction, pra este
  // componente servir pra qualquer toggle simples de configuração da
  // loja sem duplicar a UI de card+switch a cada nova configuração.
  action: (ativo: boolean) => Promise<{ error?: string; success?: boolean }>
}

export default function ConfigToggleCard({ icone, titulo, descricao, descricaoQuandoDesativado, ativoInicial, action }: Props) {
  const [ativo, setAtivo] = useState(ativoInicial)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    setErro(null)
    const novoValor = !ativo
    startTransition(async () => {
      const result = await action(novoValor)
      if (result?.error) {
        setErro(result.error)
        return
      }
      setAtivo(novoValor)
    })
  }

  return (
    <div className="card">
      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      <div className="flex items-center justify-between" style={{ gap: 'var(--space-4)' }}>
        <div className="flex items-center gap-3">
          <span className="dash-icon-btn" style={{ cursor: 'default' }}>{icone}</span>
          <div>
            <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{titulo}</div>
            <div className="text-sm text-muted">
              {descricao}
              {!ativo && descricaoQuandoDesativado && ` ${descricaoQuandoDesativado}`}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${ativo ? 'btn-success' : 'btn-secondary'}`}
          onClick={handleToggle}
          disabled={isPending}
          style={{ flexShrink: 0 }}
        >
          {isPending ? 'Salvando...' : ativo ? 'Ativado' : 'Desativado'}
        </button>
      </div>
    </div>
  )
}
