'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { remarcarAgendamentoAction } from '@/lib/actions'
import { hojeBrasilISO } from '@/lib/agenda'
import { fechadoODiaTodo, somarDiasISO, textoBloqueioNoDia } from '@/lib/bloqueios'
import { useBloqueiosDoDia } from './useBloqueiosDoDia'
import SeletorDataHora from '@/components/SeletorDataHora'
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
// modo 'cliente': o próprio agendamento enquanto Pendente (migration 071),
// dentro da janela do agendamento online; sem WhatsApp.
export function RemarcarModal(props: AlvoRemarcar & { onFechar: () => void; modo?: 'loja' | 'cliente' }) {
  return createPortal(<RemarcarConteudo {...props} />, document.body)
}

function RemarcarConteudo({ idAgendamento, dataAtual, horaAtual, onFechar, modo = 'loja' }: AlvoRemarcar & { onFechar: () => void; modo?: 'loja' | 'cliente' }) {
  const cliente = modo === 'cliente'
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
  // Recarrega os horários depois de uma recusa (horário ocupado ou
  // fechado enquanto o modal estava aberto).
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!data) return
    let cancelado = false
    supabase.rpc('fn_horarios_remarcar', { p_id_agendamento: idAgendamento, p_data: data }).then(({ data: rows, error }) => {
      if (cancelado) return
      const lista = (rows ?? []) as Slot[]
      setSlotsCarregados({ data, slots: lista, erro: !!error })
      setHora(h => lista.some(s => s.disponivel && s.hr_slot.slice(0, 5) === h) ? h : '')
    })
    return () => { cancelado = true }
  }, [data, idAgendamento, supabase, recarga])

  const slots = slotsCarregados?.data === data ? slotsCarregados : null

  // Loja fechada no dia escolhido (migration 066) — explica a falta de horário.
  const [idLojista, setIdLojista] = useState<string | null>(null)
  // Cliente: última data que a loja aceita no agendamento online.
  const [dataMax, setDataMax] = useState<string | undefined>(undefined)
  useEffect(() => {
    supabase.from('agendamento').select('id_lojista').eq('id_agendamento', idAgendamento).maybeSingle()
      .then(({ data: ag }) => {
        setIdLojista(ag?.id_lojista ?? null)
        if (!cliente || !ag?.id_lojista) return
        supabase.from('lojista').select('agendamento_max_valor, agendamento_max_unidade').eq('id_lojista', ag.id_lojista).maybeSingle()
          .then(({ data: lj }) => {
            if (!lj?.agendamento_max_valor) return
            const dias = lj.agendamento_max_unidade === 'dias' ? lj.agendamento_max_valor : Math.ceil(lj.agendamento_max_valor / 24)
            setDataMax(somarDiasISO(hojeBrasilISO(), dias))
          })
      })
  }, [idAgendamento, supabase, cliente])
  const bloqueiosDia = useBloqueiosDoDia(idLojista, data) ?? []
  const diaFechado = fechadoODiaTodo(bloqueiosDia, data)

  function confirmar() {
    setErro(null)
    startTransition(async () => {
      const r = await remarcarAgendamentoAction(idAgendamento, data, hora, motivo)
      if (r.error) {
        setErro(r.error)
        setRecarga(n => n + 1)
        return
      }
      setResultado({ avisos: r.avisos ?? [], whatsapp: r.whatsapp ?? null })
      router.refresh()
    })
  }

  const [ano, mes, dia] = data.split('-')

  return (
    <div className="modal-overlay" onClick={() => !isPending && onFechar()}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
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
                <span>Remarcado para {dia}/{mes}/{ano} às {hora}.{cliente && ' A loja vê a nova data no seu pedido.'}</span>
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
                Marcado para {dataAtual.split('-').reverse().join('/')} às {horaAtual.slice(0, 5)}.{' '}
                {cliente
                  ? 'Se você marcou mais de um serviço juntos, todos mudam juntos, na mesma ordem.'
                  : 'Se o cliente marcou mais de um serviço juntos, todos mudam juntos, na mesma ordem.'}
              </p>
              <div className="form-group">
                <label className="form-label form-label-required">Nova data e horário</label>
                <SeletorDataHora
                  idLojista={idLojista}
                  data={data}
                  onData={d => { setData(d); setHora('') }}
                  hora={hora}
                  onHora={setHora}
                  slots={slots ? slots.slots : null}
                  aviso={
                    slots?.erro ? 'Para remarcar, execute a migration 064_remarcar_agendamento.sql.'
                      : diaFechado ? `Loja fechada neste dia (${diaFechado.motivo}). Escolha outra data.`
                      : slots && slots.slots.length === 0
                        ? (cliente ? 'Sem horário livre nesse dia. Escolha outra data.' : 'A loja não tem horário nesse dia. Escolha outra data.')
                        : undefined
                  }
                  notas={bloqueiosDia.map(textoBloqueioNoDia)}
                  dataMin={hoje}
                  dataMax={dataMax}
                  disabled={isPending}
                  rotulo="Remarcar para"
                />
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
