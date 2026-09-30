'use client'

import { useState } from 'react'
import {
  format, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isBefore, isAfter, isSameMonth, addMonths, subMonths, getDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { IconChevronLeft, IconChevronRight } from '@/components/icons'
import { dataBR, descreverBloqueio, fechadoODiaTodo, type BloqueioLoja } from '@/lib/bloqueios'

const NOMES_DIA_POR_INDICE = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

// Calendário de verdade (mês em grade) em vez de tira horizontal com
// scroll — usado tanto no Agendamento Online (público) quanto no Novo
// Agendamento do painel do cliente. Dias fechados e fora da janela de
// antecedência (min/máx configurada pela loja) já vêm desabilitados, e
// também os dias que a loja fechou (feriado, folga — migration 066); os
// fechamentos do mês aparecem embaixo, com o motivo.
export default function SeletorDeData({
  diasAbertos, minInstante, maxInstante, dataSelecionada, onSelecionar, bloqueios = [],
}: {
  diasAbertos: Set<string>
  minInstante: Date
  maxInstante: Date
  dataSelecionada: string
  onSelecionar: (iso: string) => void
  bloqueios?: BloqueioLoja[]
}) {
  const [mesAtual, setMesAtual] = useState(() => startOfMonth(dataSelecionada ? new Date(`${dataSelecionada}T12:00:00`) : new Date()))

  const minDia = startOfDay(minInstante)
  const maxDia = startOfDay(maxInstante)
  const inicioGrade = startOfWeek(startOfMonth(mesAtual))
  const fimGrade = endOfWeek(endOfMonth(mesAtual))
  const dias = eachDayOfInterval({ start: inicioGrade, end: fimGrade })

  const podeVoltar = !isBefore(endOfMonth(subMonths(mesAtual, 1)), minDia)
  const podeAvancar = !isAfter(startOfMonth(addMonths(mesAtual, 1)), maxDia)

  // Fechamentos que tocam o mês mostrado e ainda estão na janela.
  const inicioMesISO = format(startOfMonth(mesAtual), 'yyyy-MM-dd')
  const fimMesISO = format(endOfMonth(mesAtual), 'yyyy-MM-dd')
  const minISO = format(minDia, 'yyyy-MM-dd')
  const fechamentosDoMes = bloqueios.filter(b =>
    b.dt_fim >= inicioMesISO && b.dt_inicio <= fimMesISO && b.dt_fim >= minISO
  )

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-3)' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMesAtual(m => subMonths(m, 1))} disabled={!podeVoltar}>
          <IconChevronLeft style={{ width: 14, height: 14 }} />
        </button>
        <span className="font-semibold" style={{ color: 'var(--gray-100)', textTransform: 'capitalize' }}>
          {format(mesAtual, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMesAtual(m => addMonths(m, 1))} disabled={!podeAvancar}>
          <IconChevronRight style={{ width: 14, height: 14 }} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-xs text-muted" style={{ textAlign: 'center' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {dias.map(d => {
          const iso = format(d, 'yyyy-MM-dd')
          const foraDoMes = !isSameMonth(d, mesAtual)
          const bloqueio = fechadoODiaTodo(bloqueios, iso)
          const fechado = !diasAbertos.has(NOMES_DIA_POR_INDICE[getDay(d)]) || !!bloqueio
          const foraDaJanela = isBefore(startOfDay(d), minDia) || isAfter(startOfDay(d), maxDia)
          const desabilitado = fechado || foraDaJanela || foraDoMes

          if (foraDoMes) return <div key={iso} />

          return (
            <button
              key={iso}
              type="button"
              disabled={desabilitado}
              onClick={() => onSelecionar(iso)}
              className={`agenonline-day ${iso === dataSelecionada ? 'selected' : ''}`}
              style={{
                opacity: desabilitado ? 0.35 : 1,
                cursor: desabilitado ? 'not-allowed' : 'pointer',
                textDecoration: bloqueio && !foraDaJanela ? 'line-through' : undefined,
              }}
              title={bloqueio ? `Fechado: ${bloqueio.motivo}` : fechado ? 'Fechado' : undefined}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>

      {fechamentosDoMes.length > 0 && (
        <ul className="text-xs text-muted" style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {fechamentosDoMes.map(b => (
            <li key={b.id_bloqueio}>
              <strong>Fechado</strong> {b.hr_inicio ? descreverBloqueio(b) : b.dt_inicio === b.dt_fim ? dataBR(b.dt_inicio) : `de ${dataBR(b.dt_inicio)} a ${dataBR(b.dt_fim)}`} · {b.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
