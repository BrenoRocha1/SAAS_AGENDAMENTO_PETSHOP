// Espelha petshop-app/src/lib/relatorios.ts — cálculo de período em
// código puro. Datas sempre 'yyyy-MM-dd'. O período personalizado e o
// detalhamento linha a linha ficam no painel web.
import { format, startOfMonth, endOfMonth, subMonths, subDays, differenceInCalendarDays } from 'date-fns'
import { agoraBrasil } from '@/lib/agenda'

export type PeriodoPreset = 'hoje' | '7dias' | '30dias' | 'este-mes' | 'mes-anterior'

export const PRESETS: { valor: PeriodoPreset; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7dias', rotulo: '7 dias' },
  { valor: '30dias', rotulo: '30 dias' },
  { valor: 'este-mes', rotulo: 'Este mês' },
  { valor: 'mes-anterior', rotulo: 'Mês anterior' },
]

function iso(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export interface Periodo {
  ini: string
  fim: string
}

/** Calcula [início, fim] (inclusive) a partir de um preset. */
export function calcularPeriodo(preset: PeriodoPreset, hoje: Date = agoraBrasil()): Periodo {
  const hojeISO = iso(hoje)
  switch (preset) {
    case 'hoje':
      return { ini: hojeISO, fim: hojeISO }
    case '7dias':
      return { ini: iso(subDays(hoje, 6)), fim: hojeISO }
    case '30dias':
      return { ini: iso(subDays(hoje, 29)), fim: hojeISO }
    case 'este-mes':
      return { ini: iso(startOfMonth(hoje)), fim: hojeISO }
    case 'mes-anterior': {
      const mesPassado = subMonths(hoje, 1)
      return { ini: iso(startOfMonth(mesPassado)), fim: iso(endOfMonth(mesPassado)) }
    }
  }
}

/** Período anterior de mesma duração, imediatamente antes de `periodo`. */
export function calcularPeriodoAnterior(periodo: Periodo): Periodo {
  const ini = new Date(`${periodo.ini}T00:00:00`)
  const fim = new Date(`${periodo.fim}T00:00:00`)
  const duracaoDias = differenceInCalendarDays(fim, ini) + 1
  return { ini: iso(subDays(ini, duracaoDias)), fim: iso(subDays(ini, 1)) }
}

/** Variação percentual de `atual` sobre `anterior`; `null` sem base de comparação. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((atual - anterior) / anterior) * 100
}
