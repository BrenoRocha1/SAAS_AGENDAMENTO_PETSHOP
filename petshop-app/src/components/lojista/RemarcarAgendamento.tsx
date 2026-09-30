'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { remarcarAgendamentoAction } from '@/lib/actions'
import { hojeBrasilISO } from '@/lib/agenda'
import { fechadoODiaTodo, textoBloqueioNoDia } from '@/lib/bloqueios'
import { useBloqueiosDoDia } from './useBloqueiosDoDia'
import { IconAlert, IconCalendar, IconCheck, IconClose, IconWhatsapp } from '@/components/icons'

type Slot = { hr_slot: string; disponivel: boolean }

// "Remarcar": o botão fica no detalhe do agendamento; o modal é aberto
// pela tela (Agenda, Gestor, Dashboard), fora do detalhe — ao remarcar
// pra outro dia o item sai da tela e o detalhe fecha, e o modal precisa
// continuar aberto pra mostrar os avisos e o WhatsApp do cliente.
export type AlvoRemarcar = { idAgendamento: string; dataAtual: string; horaAtual: string }

export function BotaoRemarcar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onClick}>
      <IconCalendar style={{ width: 14, height: 14 }} /> Remarcar
    </button>
  )
}

// Nova data, horários livres pro pedido inteiro (fn_horarios_remarcar,
// migration 064) e motivo. No body (portal), por cima de tudo.
export function RemarcarModal(props: AlvoRemarcar & { onFechar: () => void }) {
  return createPortal(<RemarcarConteudo {...props} />, document.body)
}

function RemarcarConteudo({ idAgendamento, dataAtual, horaAtual, onFechar }: AlvoRemarcar & { onFechar: () => void }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const hoje = hojeBrasilISO()
  const [data, setData] = useState(dataAtual >= hoje ? dataAtual : hoje)
  const [hora, setHora] = useState('')
  const [motivo, setMotivo] = useState('')
  const [slotsCarregados, setSlotsCarregados] = useState<{ data: string; slots: Slot[]; erro: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ avisos: string[]; whatsapp: string | null } | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!data) return
    let cancelado = false
    supabase.rpc('fn_horarios_remarcar', { p_id_agendamento: idAgendamento, p_data: data }).then(({ data: rows, error }) => {
      if (!cancelado) setSlotsCarregados({ data, slots: (rows ?? []) as Slot[], erro: !!error })
    })
    return () => { cancelado = true }
  }, [data, idAgendamento, supabase])

  const slots = slotsCarregados?.data === data ? slotsCarregados : null

  // Loja fechada no dia escolhido (migration 066) — explica a falta de horário.
  const [idLojista, setIdLojista] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('agendamento').select('id_lojista').eq('id_agendamento', idAgendamento).maybeSingle()
      .then(({ data: ag }) => setIdLojista(ag?.id_lojista ?? null))
  }, [idAgendamento, supabase])
  const bloqueiosDia = useBloqueiosDoDia(idLojista, data) ?? []
  const diaFechado = fechadoODiaTodo(bloqueiosDia, data)

  function confirmar() {
    setErro(null)
    startTransition(async () => {
      const r = await remarcarAgendamentoAction(idAgendamento, data, hora, motivo)
      if (r.error) {
        setErro(r.error)
        return
      }
      setResultado({ avisos: r.avisos ?? [], whatsapp: r.whatsapp ?? null })
      router.refresh()
    })
  }

  const [ano, mes, dia] = data.split('-')

  return (
    <div className="modal-overlay" onClick={() => !isPending && onFechar()}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Remarcar agendamento</h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {resultado ? (
          <>
            <div className="modal-body">
              <div className="alert alert-success">
                <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>Remarcado para {dia}/{mes}/{ano} às {hora}.</span>
              </div>
              {resultado.avisos.map((a, i) => (
                <div key={i} className="alert alert-info" style={{ marginTop: 'var(--space-2)' }}>
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{a}</span>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              {resultado.whatsapp && (
                <a href={resultado.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                  <IconWhatsapp style={{ width: 15, height: 15 }} /> Avisar o cliente no WhatsApp
                </a>
              )}
              <button type="button" className="btn btn-primary" onClick={onFechar}>Fechar</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              {erro && (
                <div className="alert alert-error">
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
                </div>
              )}
              <p className="text-sm text-muted" style={{ marginTop: 0 }}>
                Marcado para {dataAtual.split('-').reverse().join('/')} às {horaAtual.slice(0, 5)}. Se o cliente marcou mais de um serviço juntos, todos mudam juntos, na mesma ordem.
              </p>
              <div className="form-group">
                <label htmlFor="remarcar-data" className="form-label form-label-required">Nova data</label>
                <input
                  id="remarcar-data"
                  type="date"
                  className="form-input"
                  min={hoje}
                  value={data}
                  onChange={e => { setData(e.target.value); setHora('') }}
                />
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Novo horário</label>
                {!slots ? (
                  <p className="text-sm text-muted" style={{ margin: 0 }}>Carregando horários...</p>
                ) : slots.erro ? (
                  <p className="text-sm text-muted" style={{ margin: 0 }}>Para remarcar, execute a migration 064_remarcar_agendamento.sql.</p>
                ) : diaFechado ? (
                  <p className="text-sm text-warning" style={{ margin: 0 }}>Loja fechada neste dia ({diaFechado.motivo}). Escolha outra data.</p>
                ) : slots.slots.length === 0 ? (
                  <p className="text-sm text-muted" style={{ margin: 0 }}>A loja não tem horário nesse dia. Escolha outra data.</p>
                ) : (
                  <>
                  {bloqueiosDia.map(b => (
                    <p key={b.id_bloqueio} className="text-xs text-warning" style={{ margin: '0 0 var(--space-2)' }}>{textoBloqueioNoDia(b)}</p>
                  ))}
                  <div className="slots-grid">
                    {slots.slots.map(s => {
                      const h = s.hr_slot.slice(0, 5)
                      return (
                        <button
                          key={s.hr_slot}
                          type="button"
                          className={`slot ${!s.disponivel ? 'slot-unavailable' : ''} ${hora === h ? 'slot-selected' : ''}`}
                          disabled={!s.disponivel || isPending}
                          onClick={() => setHora(h)}
                        >
                          {h}
                        </button>
                      )
                    })}
                  </div>
                  </>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="remarcar-motivo" className="form-label">Motivo (opcional)</label>
                <input id="remarcar-motivo" className="form-input" maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: cliente pediu outro dia" />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={isPending}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={confirmar} disabled={isPending || !hora}>
                {isPending ? 'Remarcando...' : 'Remarcar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
