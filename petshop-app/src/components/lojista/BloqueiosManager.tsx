'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfWeek } from 'date-fns'
import { salvarBloqueioAction, excluirBloqueioAction, type DadosBloqueio } from '@/lib/actions-bloqueios'
import { dataBR, descreverBloqueio, proximosFeriados, type BloqueioLoja } from '@/lib/bloqueios'
import { rotuloStatus } from '@/lib/status-agendamento'
import { IconAlert, IconCalendar, IconCheck, IconClose, IconLock, IconPlus, IconTrash } from '@/components/icons'

export interface BloqueioComAgendamentos extends BloqueioLoja {
  agendamentos: {
    id_agendamento: string
    dt: string
    hr: string
    status: 'Pendente' | 'Confirmado'
    pet: string | null
    cliente: string | null
    servico: string
  }[]
}

const FORM_VAZIO: DadosBloqueio = { dt_inicio: '', dt_fim: '', hr_inicio: '', hr_fim: '', motivo: '' }

function semanaDe(iso: string) {
  return format(startOfWeek(parseISO(`${iso}T12:00:00`), { weekStartsOn: 0 }), 'yyyy-MM-dd')
}

// Feriados, folgas e horários em que a loja não atende (migration 066).
export default function BloqueiosManager({ bloqueios, hojeISO, semMigration }: {
  bloqueios: BloqueioComAgendamentos[]
  hojeISO: string
  semMigration: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [form, setForm] = useState<DadosBloqueio>(FORM_VAZIO)
  const [diaInteiro, setDiaInteiro] = useState(true)
  const [formErro, setFormErro] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [verFeriados, setVerFeriados] = useState(false)

  // Feriado já fechado = existe bloqueio de dia inteiro cobrindo a data.
  const feriados = useMemo(() => proximosFeriados(hojeISO).filter(f =>
    !bloqueios.some(b => !b.hr_inicio && b.dt_inicio <= f.data && f.data <= b.dt_fim)
  ), [bloqueios, hojeISO])

  function avisar(texto: string) {
    setSucesso(texto)
    setTimeout(() => setSucesso(null), 3000)
  }

  function abrirForm() {
    setForm({ ...FORM_VAZIO, dt_inicio: hojeISO })
    setDiaInteiro(true)
    setFormErro(null)
    setFormAberto(true)
  }

  function salvar() {
    setFormErro(null)
    const dados: DadosBloqueio = diaInteiro ? { ...form, hr_inicio: '', hr_fim: '' } : form
    startTransition(async () => {
      const r = await salvarBloqueioAction(dados)
      if (r.error) { setFormErro(r.error); return }
      setFormAberto(false)
      avisar('Período fechado. Os clientes já não conseguem marcar nesses horários.')
      router.refresh()
    })
  }

  function fecharFeriado(data: string, nome: string) {
    setErro(null)
    startTransition(async () => {
      const r = await salvarBloqueioAction({ dt_inicio: data, dt_fim: data, hr_inicio: '', hr_fim: '', motivo: nome })
      if (r.error) { setErro(r.error); return }
      avisar(`${nome} (${dataBR(data)}) fechado.`)
      router.refresh()
    })
  }

  function reabrir(id: string) {
    setErro(null)
    setConfirmandoId(null)
    startTransition(async () => {
      const r = await excluirBloqueioAction(id)
      if (r.error) { setErro(r.error); return }
      avisar('Período reaberto para agendamentos.')
      router.refresh()
    })
  }

  return (
    <section style={{ maxWidth: 600, marginTop: 'var(--space-8)' }}>
      <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Dias fechados</h2>
          <p className="text-sm text-muted" style={{ margin: '4px 0 0' }}>
            Feriados, folgas ou horários em que a loja não atende. Ninguém consegue marcar nesses horários.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={abrirForm} disabled={semMigration}>
          <IconPlus style={{ width: 14, height: 14 }} /> Fechar um período
        </button>
      </div>

      {semMigration && (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Para fechar dias, execute a migration 066_bloqueio_datas.sql.</span>
        </div>
      )}
      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}
      {sucesso && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{sucesso}</span>
        </div>
      )}

      {!semMigration && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {bloqueios.length === 0 ? (
            <div className="card text-sm text-muted">Nenhum dia fechado daqui para frente.</div>
          ) : bloqueios.map(b => (
            <div key={b.id_bloqueio} className="card">
              <div className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
                <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--warning-400)',
                    }}
                  >
                    <IconLock style={{ width: 18, height: 18 }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{b.motivo}</div>
                    <div className="text-sm text-muted">{descreverBloqueio(b)}</div>
                  </div>
                </div>
                {confirmandoId === b.id_bloqueio ? (
                  <div className="flex gap-2" style={{ flexShrink: 0 }}>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => reabrir(b.id_bloqueio)} disabled={isPending}>
                      Reabrir
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmandoId(null)} disabled={isPending}>
                      Voltar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => setConfirmandoId(b.id_bloqueio)}
                    disabled={isPending}
                    title="Reabrir para agendamentos"
                  >
                    <IconTrash style={{ width: 14, height: 14 }} /> Reabrir
                  </button>
                )}
              </div>

              {b.agendamentos.length > 0 && (
                <div className="alert alert-warning" style={{ marginTop: 'var(--space-3)', marginBottom: 0, flexDirection: 'column', alignItems: 'stretch' }}>
                  <span>
                    {b.agendamentos.length === 1
                      ? 'Ainda tem 1 agendamento marcado nesse período. Remarque ou cancele:'
                      : `Ainda tem ${b.agendamentos.length} agendamentos marcados nesse período. Remarque ou cancele:`}
                  </span>
                  <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
                    {b.agendamentos.map(a => (
                      <li key={a.id_agendamento}>
                        <Link href={`/lojista/agendamentos?semana=${semanaDe(a.dt)}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                          {dataBR(a.dt).slice(0, 5)} às {a.hr}
                        </Link>
                        {' · '}{a.pet ?? 'Pet'}{a.cliente ? ` (${a.cliente})` : ''} · {a.servico} · {rotuloStatus(a.status)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {feriados.length > 0 && (
            <div className="card">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: 0 }}
                onClick={() => setVerFeriados(v => !v)}
                aria-expanded={verFeriados}
              >
                <IconCalendar style={{ width: 14, height: 14 }} />
                {verFeriados ? 'Esconder feriados nacionais' : `Ver feriados nacionais (${feriados.length} nos próximos 12 meses)`}
              </button>
              {verFeriados && (
                <ul style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {feriados.map(f => (
                    <li key={f.data} className="flex items-center justify-between" style={{ gap: 'var(--space-3)' }}>
                      <span className="text-sm">
                        <strong>{dataBR(f.data).slice(0, 5)}</strong> · {f.nome}
                        {f.facultativo && <span className="text-muted"> · ponto facultativo</span>}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ flexShrink: 0 }}
                        onClick={() => fecharFeriado(f.data, f.nome)}
                        disabled={isPending}
                      >
                        Fechar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {formAberto && (
        <div className="modal-overlay" onClick={() => !isPending && setFormAberto(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Fechar um período</h3>
              <button className="modal-close" onClick={() => setFormAberto(false)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              {formErro && (
                <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{formErro}</span>
                </div>
              )}
              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="bloqueio-inicio" className="form-label form-label-required">De</label>
                  <input
                    id="bloqueio-inicio"
                    type="date"
                    className="form-input"
                    min={hojeISO}
                    value={form.dt_inicio}
                    onChange={e => setForm(f => ({ ...f, dt_inicio: e.target.value, dt_fim: f.dt_fim && f.dt_fim < e.target.value ? '' : f.dt_fim }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="bloqueio-fim" className="form-label">Até (opcional)</label>
                  <input
                    id="bloqueio-fim"
                    type="date"
                    className="form-input"
                    min={form.dt_inicio || hojeISO}
                    value={form.dt_fim}
                    onChange={e => setForm(f => ({ ...f, dt_fim: e.target.value }))}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer', marginBottom: 'var(--space-3)' }}>
                <input
                  type="checkbox"
                  checked={diaInteiro}
                  onChange={e => setDiaInteiro(e.target.checked)}
                  style={{ accentColor: 'var(--primary-500)', width: 16, height: 16 }}
                />
                Fechado o dia inteiro
              </label>

              {!diaInteiro && (
                <>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label htmlFor="bloqueio-hr-inicio" className="form-label form-label-required">Das</label>
                      <input id="bloqueio-hr-inicio" type="time" className="form-input" value={form.hr_inicio} onChange={e => setForm(f => ({ ...f, hr_inicio: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="bloqueio-hr-fim" className="form-label form-label-required">Às</label>
                      <input id="bloqueio-hr-fim" type="time" className="form-input" value={form.hr_fim} onChange={e => setForm(f => ({ ...f, hr_fim: e.target.value }))} />
                    </div>
                  </div>
                  <p className="text-xs text-muted" style={{ marginTop: 0 }}>Com mais de um dia, o horário vale para cada dia do período.</p>
                </>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="bloqueio-motivo" className="form-label form-label-required">Motivo</label>
                <input
                  id="bloqueio-motivo"
                  className="form-input"
                  maxLength={80}
                  value={form.motivo}
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ex.: Feriado de Natal"
                />
                <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>Aparece para o cliente no calendário de agendamento.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setFormAberto(false)} disabled={isPending}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={salvar} disabled={isPending}>
                {isPending ? 'Salvando...' : 'Fechar período'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
