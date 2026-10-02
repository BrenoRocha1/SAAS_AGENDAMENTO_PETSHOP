'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, getDay,
  isSameMonth, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { hojeBrasilISO } from '@/lib/agenda'
import { fechadoODiaTodo, normalizarBloqueios, type BloqueioLoja } from '@/lib/bloqueios'
import { IconChevronLeft, IconChevronRight } from '@/components/icons'

const NOMES_DIA_POR_INDICE = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export type SlotHorario = { hr_slot: string; disponivel: boolean }

// Dias em que a loja abre e os fechamentos (feriado, folga — migration
// 066), pra desenhar o calendário. Enquanto não carrega (ou se a consulta
// falhar), nenhum dia fica apagado por isso — o banco recusa do mesmo jeito.
function useCalendarioDaLoja(idLojista: string | null) {
  const supabase = useMemo(() => createClient(), [])
  const [carregado, setCarregado] = useState<{ idLojista: string; diasAbertos: Set<string> | null; bloqueios: BloqueioLoja[] } | null>(null)

  useEffect(() => {
    if (!idLojista) return
    let cancelado = false
    const hoje = hojeBrasilISO()
    Promise.all([
      supabase.from('horario').select('dia_semana, ativo').eq('id_lojista', idLojista),
      // Até o fim do ano que vem (o banco limita a ~400 dias).
      supabase.rpc('fn_bloqueios_loja', { p_id_lojista: idLojista, p_de: hoje, p_ate: `${Number(hoje.slice(0, 4)) + 1}-12-31` }),
    ]).then(([horarios, bloqueios]) => {
      if (cancelado) return
      const linhas = (horarios.data ?? []) as { dia_semana: string; ativo: boolean }[]
      setCarregado({
        idLojista,
        diasAbertos: horarios.error || linhas.length === 0 ? null : new Set(linhas.filter(h => h.ativo).map(h => h.dia_semana)),
        bloqueios: normalizarBloqueios(bloqueios.data),
      })
    })
    return () => { cancelado = true }
  }, [idLojista, supabase])

  return carregado?.idLojista === idLojista ? carregado : null
}

interface Props {
  // Loja do agendamento — null enquanto a tela ainda não sabe qual é.
  idLojista: string | null
  data: string
  onData: (iso: string) => void
  // "HH:MM"
  hora: string
  onHora: (hora: string) => void
  // Horários do dia escolhido (ocupados vêm com disponivel=false).
  // null = carregando.
  slots: SlotHorario[] | null
  // No lugar da lista: dia fechado, erro, dia sem horário.
  aviso?: ReactNode
  // Acima da lista: avisos do dia (ex.: loja fechada em parte do dia).
  notas?: string[]
  // Limites do calendário (AAAA-MM-DD).
  dataMin: string
  dataMax?: string
  disabled?: boolean
  // Começo da frase do rodapé: "Agendamento para…", "Remarcar para…".
  rotulo?: string
}

// Data e horário num bloco só: mês em grade à esquerda, horários do dia à
// direita e, embaixo, o que ficou escolhido. Usado nos modais "Novo
// agendamento" (loja) e "Remarcar" (loja e cliente).
export default function SeletorDataHora({
  idLojista, data, onData, hora, onHora, slots, aviso, notas = [], dataMin, dataMax, disabled, rotulo = 'Agendamento para',
}: Props) {
  const calendario = useCalendarioDaLoja(idLojista)
  const hoje = hojeBrasilISO()
  const [mesAtual, setMesAtual] = useState(() => startOfMonth(new Date(`${data || dataMin || hoje}T12:00:00`)))

  const dias = eachDayOfInterval({ start: startOfWeek(startOfMonth(mesAtual)), end: endOfWeek(endOfMonth(mesAtual)) })
  const podeVoltar = format(endOfMonth(subMonths(mesAtual, 1)), 'yyyy-MM-dd') >= dataMin
  const podeAvancar = !dataMax || format(startOfMonth(addMonths(mesAtual, 1)), 'yyyy-MM-dd') <= dataMax

  const quando = data ? format(new Date(`${data}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR }) : null

  return (
    <div className="sdh">
      <div className="sdh-corpo">
        <div className="sdh-calendario">
          <div className="sdh-cabecalho">
            <button type="button" className="sdh-nav" onClick={() => setMesAtual(m => subMonths(m, 1))} disabled={!podeVoltar || disabled} aria-label="Mês anterior">
              <IconChevronLeft style={{ width: 14, height: 14 }} />
            </button>
            <span className="sdh-mes">{format(mesAtual, "MMMM 'de' yyyy", { locale: ptBR })}</span>
            <button type="button" className="sdh-nav" onClick={() => setMesAtual(m => addMonths(m, 1))} disabled={!podeAvancar || disabled} aria-label="Próximo mês">
              <IconChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>

          <div className="sdh-semana">
            {DIAS_CURTOS.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="sdh-dias">
            {dias.map(d => {
              const iso = format(d, 'yyyy-MM-dd')
              if (!isSameMonth(d, mesAtual)) return <span key={iso} />
              const bloqueio = calendario ? fechadoODiaTodo(calendario.bloqueios, iso) : null
              const semExpediente = !!calendario?.diasAbertos && !calendario.diasAbertos.has(NOMES_DIA_POR_INDICE[getDay(d)])
              const foraDoLimite = iso < dataMin || (!!dataMax && iso > dataMax)
              return (
                <button
                  key={iso}
                  type="button"
                  className={`sdh-dia ${iso === data ? 'is-selecionado' : ''} ${iso === hoje ? 'is-hoje' : ''} ${bloqueio && !foraDoLimite ? 'is-fechado' : ''}`}
                  disabled={disabled || foraDoLimite || semExpediente || !!bloqueio}
                  onClick={() => onData(iso)}
                  title={bloqueio ? `Fechado: ${bloqueio.motivo}` : semExpediente ? 'A loja não abre neste dia' : undefined}
                  aria-pressed={iso === data}
                >
                  {format(d, 'd')}
                </button>
              )
            })}
          </div>
        </div>

        <div className="sdh-horarios">
          <div className="sdh-horarios-rolagem">
            {!data ? (
              <p className="sdh-vazio">Escolha um dia para ver os horários.</p>
            ) : slots === null ? (
              <p className="sdh-vazio">Carregando horários...</p>
            ) : aviso ? (
              <p className="sdh-vazio is-aviso">{aviso}</p>
            ) : (
              <>
                {notas.map(n => <p key={n} className="sdh-vazio is-aviso">{n}</p>)}
                {slots.map(s => {
                  const h = s.hr_slot.slice(0, 5)
                  return (
                    <button
                      key={s.hr_slot}
                      type="button"
                      className={`sdh-slot ${hora === h ? 'is-selecionado' : ''}`}
                      disabled={!s.disponivel || disabled}
                      onClick={() => onHora(h)}
                      title={s.disponivel ? undefined : 'Horário ocupado'}
                      aria-pressed={hora === h}
                    >
                      {h}
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="sdh-rodape">
        {quando && hora ? (
          <>{rotulo} <strong>{quando}</strong> às <strong>{hora}</strong>.</>
        ) : quando ? (
          <>Dia <strong>{quando}</strong> — escolha o horário.</>
        ) : (
          'Escolha o dia e o horário.'
        )}
      </div>
    </div>
  )
}
