'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { atualizarStatusAgendamentoAction } from '@/lib/actions'
import { IconAlert, IconCalendar, IconCheck, IconClose } from '@/components/icons'

const statusConfig: Record<string, { label: string; cls: string }> = {
  Pendente:   { label: 'Pendente',   cls: 'badge-pendente' },
  Confirmado: { label: 'Confirmado', cls: 'badge-confirmado' },
  'Concluído':  { label: 'Concluído',  cls: 'badge-concluido' },
  Cancelado:  { label: 'Cancelado',  cls: 'badge-cancelado' },
}

interface Props {
  agendamentos: any[]
}

export default function AgendamentosLojistaList({ agendamentos: inicial }: Props) {
  const [agendamentos, setAgendamentos] = useState(inicial)
  const [filtro, setFiltro] = useState('Todos')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtros = ['Todos', 'Pendente', 'Confirmado', 'Concluído', 'Cancelado']
  const filtrados = filtro === 'Todos'
    ? agendamentos
    : agendamentos.filter(a => a.status === filtro)

  function atualizarStatus(id: string, status: 'Confirmado' | 'Concluído' | 'Cancelado') {
    setError(null)
    startTransition(async () => {
      const result = await atualizarStatusAgendamentoAction(id, status)
      if (result?.error) setError(result.error)
      else {
        setAgendamentos(prev =>
          prev.map(a => a.id_agendamento === id ? { ...a, status } : a)
        )
      }
    })
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex gap-2" style={{ marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
        {filtros.map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filtro === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFiltro(f)}
          >
            {f}
            {f !== 'Todos' && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>
                ({agendamentos.filter(a => a.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="empty-state card">
          <IconCalendar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum agendamento encontrado</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Cliente</th>
                <th>Pet</th>
                <th>Serviço</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((ag: any) => (
                <tr key={ag.id_agendamento}>
                  <td>
                    <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>
                      {format(new Date(ag.dt_agendamento + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                    <div className="text-sm text-muted">{ag.hr_agendamento?.slice(0, 5)}</div>
                  </td>
                  <td>
                    <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{ag.cliente?.nome}</div>
                    <div className="text-sm text-muted">{ag.cliente?.telefone}</div>
                  </td>
                  <td>
                    <div>{ag.pet?.nome}</div>
                    <div className="text-sm text-muted">{ag.pet?.raca}</div>
                  </td>
                  <td>
                    <div>{ag.servico?.nome}</div>
                    <div className="text-sm text-muted">{ag.servico?.duracao} min</div>
                  </td>
                  <td className="text-success font-semibold">
                    R$ {Number(ag.valor).toFixed(2)}
                  </td>
                  <td>
                    <span className={`badge ${statusConfig[ag.status]?.cls}`}>
                      {statusConfig[ag.status]?.label}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {ag.status === 'Pendente' && (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => atualizarStatus(ag.id_agendamento, 'Confirmado')}
                            disabled={isPending}
                            aria-label="Confirmar"
                          >
                            <IconCheck style={{ width: 14, height: 14 }} />
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => atualizarStatus(ag.id_agendamento, 'Cancelado')}
                            disabled={isPending}
                            aria-label="Cancelar"
                          >
                            <IconClose style={{ width: 14, height: 14 }} />
                          </button>
                        </>
                      )}
                      {ag.status === 'Confirmado' && (
                        <>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => atualizarStatus(ag.id_agendamento, 'Concluído')}
                            disabled={isPending}
                          >
                            Concluir
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => atualizarStatus(ag.id_agendamento, 'Cancelado')}
                            disabled={isPending}
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
