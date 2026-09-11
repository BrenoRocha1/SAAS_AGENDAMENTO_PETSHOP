'use client'

import { useState, useTransition } from 'react'
import { salvarHorarioAction, toggleHorarioAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { IconAlert, IconCheck, IconCircle, IconPencil } from '@/components/icons'

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const

interface Horario {
  id_horario: string
  dia_semana: string
  hr_inicio: string
  hr_fim: string
  ativo: boolean
}

interface Props {
  horarios: Horario[]
}

export default function HorariosManager({ horarios: inicial }: Props) {
  const supabase = createClient()
  const [horarios, setHorarios] = useState<Horario[]>(inicial)
  const [editDia, setEditDia] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function getHorario(dia: string) {
    return horarios.find(h => h.dia_semana === dia)
  }

  async function recarregar() {
    const { data } = await supabase.from('horario').select('*').order('dia_semana')
    setHorarios(data ?? [])
  }

  function handleSalvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await salvarHorarioAction(new FormData(form))
      if (result?.error) setError(result.error)
      else {
        setSuccess('Horário salvo com sucesso!')
        setEditDia(null)
        await recarregar()
        setTimeout(() => setSuccess(null), 3000)
      }
    })
  }

  function handleToggle(id_horario: string, ativo: boolean) {
    startTransition(async () => {
      await toggleHorarioAction(id_horario, ativo)
      await recarregar()
    })
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{success}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {DIAS.map(dia => {
          const h = getHorario(dia)
          const isEditing = editDia === dia

          return (
            <div key={dia} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 'var(--radius-md)',
                      background: h?.ativo ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                      border: `1px solid ${h?.ativo ? 'var(--primary-soft-border)' : 'var(--gray-700)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: h?.ativo ? 'var(--primary-400)' : 'var(--gray-500)',
                      flexShrink: 0,
                    }}
                  >
                    {h?.ativo ? <IconCheck style={{ width: 18, height: 18 }} /> : <IconCircle style={{ width: 18, height: 18 }} />}
                  </div>
                  <div>
                    <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{dia}</div>
                    {h ? (
                      <div className="text-sm text-muted">
                        {h.hr_inicio.slice(0, 5)} — {h.hr_fim.slice(0, 5)}
                        {!h.ativo && <span className="badge badge-inativo" style={{ marginLeft: 8 }}>Desativado</span>}
                      </div>
                    ) : (
                      <div className="text-sm text-muted">Não configurado</div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {h && (
                    <button
                      className={`btn btn-sm ${h.ativo ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => handleToggle(h.id_horario, !h.ativo)}
                      disabled={isPending}
                    >
                      {h.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setEditDia(isEditing ? null : dia)}
                  >
                    {isEditing ? 'Cancelar' : h ? (<><IconPencil style={{ width: 14, height: 14 }} /> Editar</>) : '+ Configurar'}
                  </button>
                </div>
              </div>

              {isEditing && (
                <form onSubmit={handleSalvar} style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--gray-800)', paddingTop: 'var(--space-4)' }}>
                  <input type="hidden" name="dia_semana" value={dia} />
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label htmlFor={`hr_inicio_${dia}`} className="form-label form-label-required">
                        Abertura
                      </label>
                      <input
                        id={`hr_inicio_${dia}`}
                        name="hr_inicio"
                        type="time"
                        className="form-input"
                        defaultValue={h?.hr_inicio.slice(0, 5)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor={`hr_fim_${dia}`} className="form-label form-label-required">
                        Fechamento
                      </label>
                      <input
                        id={`hr_fim_${dia}`}
                        name="hr_fim"
                        type="time"
                        className="form-input"
                        defaultValue={h?.hr_fim.slice(0, 5)}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end" style={{ marginTop: 'var(--space-3)' }}>
                    <button
                      type="submit"
                      className={`btn btn-primary btn-sm ${isPending ? 'btn-loading' : ''}`}
                      disabled={isPending}
                    >
                      {isPending ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
