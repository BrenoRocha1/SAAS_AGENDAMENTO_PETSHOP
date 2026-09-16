'use client'

import { useState, useTransition } from 'react'
import { salvarHorarioAction, salvarHorariosEmLoteAction, toggleHorarioAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { IconAlert, IconCheck, IconCircle, IconClose, IconPencil, IconPlus } from '@/components/icons'

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

  // Configurar vários dias de uma vez (ex.: Segunda a Sexta das 09h às 22h,
  // depois Sábado e Domingo das 12h às 15h em outra passada).
  const [loteAberto, setLoteAberto] = useState(false)
  const [diasLote, setDiasLote] = useState<Set<string>>(new Set())
  const [loteInicio, setLoteInicio] = useState('09:00')
  const [loteFim, setLoteFim] = useState('18:00')
  const [loteErro, setLoteErro] = useState<string | null>(null)

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
    setError(null)
    startTransition(async () => {
      const result = await toggleHorarioAction(id_horario, ativo)
      if (result?.error) {
        setError(result.error)
        return
      }
      // Atualiza só o campo "ativo" no estado local — nunca refaz o fetch
      // aqui. hr_inicio/hr_fim já estavam certos no estado, e um refetch
      // reintroduziria a mesma falha (o horário "sumir" da tela ao
      // desativar) que já foi reportada com esse fluxo.
      setHorarios(prev => prev.map(h => h.id_horario === id_horario ? { ...h, ativo } : h))
    })
  }

  function abrirLote() {
    setLoteErro(null)
    setDiasLote(new Set())
    setLoteInicio('09:00')
    setLoteFim('18:00')
    setLoteAberto(true)
  }

  function toggleDiaLote(dia: string) {
    setDiasLote(prev => {
      const novo = new Set(prev)
      if (novo.has(dia)) novo.delete(dia)
      else novo.add(dia)
      return novo
    })
  }

  function salvarLote() {
    setLoteErro(null)
    if (diasLote.size === 0) { setLoteErro('Selecione pelo menos um dia da semana.'); return }
    if (!loteInicio || !loteFim) { setLoteErro('Informe o horário de abertura e fechamento.'); return }
    if (loteFim <= loteInicio) { setLoteErro('O horário de fechamento deve ser depois do de abertura.'); return }

    const fd = new FormData()
    diasLote.forEach(dia => fd.append('dias', dia))
    fd.set('hr_inicio', loteInicio)
    fd.set('hr_fim', loteFim)

    startTransition(async () => {
      const result = await salvarHorariosEmLoteAction(fd)
      if (result?.error) {
        setLoteErro(result.error)
        return
      }
      setLoteAberto(false)
      setSuccess('Horários salvos com sucesso!')
      await recarregar()
      setTimeout(() => setSuccess(null), 3000)
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

      <div className="flex justify-end" style={{ marginBottom: 'var(--space-4)' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={abrirLote}>
          <IconPlus style={{ width: 14, height: 14 }} /> Configurar vários dias
        </button>
      </div>

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
                      type="button"
                      className={`switch ${h.ativo ? 'switch-on' : ''}`}
                      onClick={() => handleToggle(h.id_horario, !h.ativo)}
                      disabled={isPending}
                      role="switch"
                      aria-checked={h.ativo}
                      title={h.ativo ? 'Desativar' : 'Ativar'}
                    >
                      <span className="switch-thumb" />
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

      {loteAberto && (
        <div className="modal-overlay" onClick={() => !isPending && setLoteAberto(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Configurar vários dias</h3>
              <button className="modal-close" onClick={() => setLoteAberto(false)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
                Escolha os dias que têm o mesmo horário de funcionamento e defina abertura/fechamento uma
                única vez. Repita o processo pra configurar outro grupo de dias com outro horário
                (ex.: Segunda a Sexta das 09h às 22h, depois Sábado e Domingo das 12h às 15h).
              </p>

              {loteErro && (
                <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>{loteErro}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label form-label-required">Dias da semana</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-2)' }}>
                  {DIAS.map(dia => (
                    <label
                      key={dia}
                      className="picker-item"
                      style={{ padding: 'var(--space-2) var(--space-3)', cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={diasLote.has(dia)}
                        onChange={() => toggleDiaLote(dia)}
                        style={{ accentColor: 'var(--primary-500)', width: 16, height: 16 }}
                      />
                      <span className="picker-item-title" style={{ fontSize: '0.875rem' }}>{dia}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="lote_hr_inicio" className="form-label form-label-required">Abertura</label>
                  <input
                    id="lote_hr_inicio"
                    type="time"
                    className="form-input"
                    value={loteInicio}
                    onChange={e => setLoteInicio(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="lote_hr_fim" className="form-label form-label-required">Fechamento</label>
                  <input
                    id="lote_hr_fim"
                    type="time"
                    className="form-input"
                    value={loteFim}
                    onChange={e => setLoteFim(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setLoteAberto(false)} disabled={isPending}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
                onClick={salvarLote}
                disabled={isPending}
              >
                {isPending ? 'Salvando...' : 'Salvar horários'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
