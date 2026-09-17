'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cancelarAgendamentoAction } from '@/lib/actions'
import { IconAlert, IconScissors, IconTrash } from '@/components/icons'

const statusConfig: Record<string, { label: string; cls: string }> = {
  Pendente:   { label: 'Pendente',   cls: 'badge-pendente' },
  Confirmado: { label: 'Confirmado', cls: 'badge-confirmado' },
  'Concluído':  { label: 'Concluído',  cls: 'badge-concluido' },
  Cancelado:  { label: 'Cancelado',  cls: 'badge-cancelado' },
}

export interface AgendamentoCliente {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Concluído' | 'Cancelado'
  valor: number
  obs: string | null
  pet: { nome: string; raca: string } | null
  servico: { nome: string; duracao: number } | null
  lojista: { nome_loja: string; telefone: string } | null
}

interface Props {
  agendamentos: AgendamentoCliente[]
}

export default function AgendamentosClienteList({ agendamentos }: Props) {
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCancel(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await cancelarAgendamentoAction(id, motivo || undefined)
      if (result?.error) setError(result.error)
      else {
        setCancelId(null)
        setMotivo('')
      }
    })
  }

  if (!agendamentos.length) {
    return (
      <div className="empty-state card">
        <IconScissors style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Nenhum agendamento encontrado</div>
        <p>Você ainda não realizou nenhum agendamento</p>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16 }} /><span>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {agendamentos.map(ag => {
          const podeCanc = ['Pendente', 'Confirmado'].includes(ag.status)
          const isCanceling = cancelId === ag.id_agendamento

          return (
            <div key={ag.id_agendamento} className="card animate-slide-up">
              <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--primary-soft-bg)',
                      border: '1px solid var(--primary-soft-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary-400)',
                      flexShrink: 0,
                    }}
                  >
                    <IconScissors style={{ width: 20, height: 20 }} />
                  </div>
                  <div>
                    <h4 style={{ marginBottom: 2 }}>{ag.servico?.nome}</h4>
                    <span className="text-sm text-muted">{ag.lojista?.nome_loja}</span>
                  </div>
                </div>
                <span className={`badge ${statusConfig[ag.status]?.cls}`}>
                  {statusConfig[ag.status]?.label}
                </span>
              </div>

              <div className="form-grid-2" style={{ marginBottom: 'var(--space-4)' }}>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Pet</div>
                  <div className="font-semibold">{ag.pet?.nome} — {ag.pet?.raca}</div>
                </div>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Data e Horário</div>
                  <div className="font-semibold">
                    {format(new Date(ag.dt_agendamento + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })} às {ag.hr_agendamento?.slice(0, 5)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Duração</div>
                  <div className="font-semibold">{ag.servico?.duracao} min</div>
                </div>
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 2 }}>Valor</div>
                  <div className="font-semibold text-success">R$ {Number(ag.valor).toFixed(2)}</div>
                </div>
              </div>

              {ag.obs && (
                <div
                  style={{
                    background: 'var(--gray-850)',
                    border: '1px solid var(--gray-800)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: '0.875rem',
                    color: 'var(--gray-400)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  {ag.obs}
                </div>
              )}

              {podeCanc && !isCanceling && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => { setCancelId(ag.id_agendamento); setMotivo('') }}
                >
                  <IconTrash style={{ width: 14, height: 14 }} /> Cancelar Agendamento
                </button>
              )}

              {isCanceling && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label">Motivo do cancelamento (opcional)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      placeholder="Ex: compromisso de última hora"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleCancel(ag.id_agendamento)}
                      disabled={isPending}
                    >
                      {isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setCancelId(null); setMotivo('') }}
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
