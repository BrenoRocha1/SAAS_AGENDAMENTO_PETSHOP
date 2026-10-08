'use client'

import { addDays, format, parseISO, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { IconChevronLeft, IconChevronRight } from '@/components/icons'

// Faixa do dia no celular (até 768px) — a mesma da tela Agenda: setas
// nas pontas, a data por extenso no meio e "Hoje" ou "Voltar para hoje"
// embaixo. Entra no lugar do `.dash-day-nav` (que fica só no desktop) no
// Gestor de Agendamentos, no quadro do TaxiDog e nas Rotas.
export default function FaixaDoDia({ data, hojeISO, onIr, semSetas = false }: {
  // Dia mostrado e o dia de hoje, em 'yyyy-MM-dd'.
  data: string
  hojeISO: string
  onIr: (data: string) => void
  // A conta que é só TaxiDog fica no dia de hoje: sem trocar de dia.
  semSetas?: boolean
}) {
  const dia = parseISO(`${data}T12:00:00`)
  return (
    <div className="so-celular gestor-dia-celular">
      <div className="tela-app-dia">
        {!semSetas && (
          <button type="button" onClick={() => onIr(format(subDays(dia, 1), 'yyyy-MM-dd'))} aria-label="Dia anterior">
            <IconChevronLeft style={{ width: 20, height: 20 }} />
          </button>
        )}
        <div>
          <strong>{format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })}</strong>
          {data === hojeISO
            ? <span>Hoje</span>
            : !semSetas && <button type="button" onClick={() => onIr(hojeISO)}>Voltar para hoje</button>}
        </div>
        {!semSetas && (
          <button type="button" onClick={() => onIr(format(addDays(dia, 1), 'yyyy-MM-dd'))} aria-label="Próximo dia">
            <IconChevronRight style={{ width: 20, height: 20 }} />
          </button>
        )}
      </div>
    </div>
  )
}
