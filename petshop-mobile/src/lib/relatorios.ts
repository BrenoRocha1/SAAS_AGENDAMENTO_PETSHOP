// Espelha petshop-app/src/lib/relatorios.ts — cálculo de período em
// código puro. Datas sempre 'yyyy-MM-dd'.
import { format, startOfMonth, endOfMonth, subMonths, subDays, differenceInCalendarDays } from 'date-fns'
import { agoraBrasil } from '@/lib/agenda'

export type PeriodoPreset = 'hoje' | '7dias' | '30dias' | 'este-mes' | 'mes-anterior' | 'personalizado'

export const PRESETS: { valor: PeriodoPreset; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7dias', rotulo: 'Últimos 7 dias' },
  { valor: '30dias', rotulo: 'Últimos 30 dias' },
  { valor: 'este-mes', rotulo: 'Este mês' },
  { valor: 'mes-anterior', rotulo: 'Mês anterior' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
]

// Nenhum relatório por dia gera mais linhas que isso (generate_series na
// migration 016): 366 cobre qualquer opção fixa e segura um período
// personalizado gigante.
const MAX_DIAS_PERIODO = 366

function iso(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export interface Periodo {
  ini: string
  fim: string
}

/** Calcula [início, fim] (inclusive, 'yyyy-MM-dd') a partir de uma opção de período. */
export function calcularPeriodo(
  preset: PeriodoPreset,
  customIni?: string,
  customFim?: string,
  hoje: Date = agoraBrasil(),
): Periodo {
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
    case 'personalizado': {
      const dataRegex = /^\d{4}-\d{2}-\d{2}$/
      let ini = customIni && dataRegex.test(customIni) ? customIni : iso(subDays(hoje, 29))
      let fim = customFim && dataRegex.test(customFim) ? customFim : hojeISO
      if (ini > fim) [ini, fim] = [fim, ini] // troca em vez de devolver um período invertido (sem linhas)
      const dias = differenceInCalendarDays(new Date(`${fim}T00:00:00`), new Date(`${ini}T00:00:00`))
      // Corta o início para caber no limite, mantendo o fim escolhido.
      if (dias > MAX_DIAS_PERIODO) ini = iso(subDays(new Date(`${fim}T00:00:00`), MAX_DIAS_PERIODO))
      return { ini, fim }
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
