// ============================================================
// Relatórios de Vendas — cálculo de período, 100% em código puro
// (sem I/O), pra poder ser usado tanto no Server Component da página
// quanto testado isoladamente. Datas trafegam sempre como string
// 'yyyy-MM-dd' (o mesmo formato que o resto do app já usa em
// dt_agendamento e nos searchParams de /lojista/kanban e /agendamentos).
// ============================================================
import { format, startOfMonth, endOfMonth, subMonths, subDays, differenceInCalendarDays } from 'date-fns'
import { agoraBrasil } from '@/lib/agenda'

export type PeriodoPreset = 'hoje' | '7dias' | '30dias' | 'este-mes' | 'mes-anterior' | 'personalizado'

export const PRESETS: { value: PeriodoPreset; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7dias', label: 'Últimos 7 dias' },
  { value: '30dias', label: 'Últimos 30 dias' },
  { value: 'este-mes', label: 'Este mês' },
  { value: 'mes-anterior', label: 'Mês anterior' },
  { value: 'personalizado', label: 'Personalizado' },
]

// Nenhum relatório por dia pode gerar mais linhas que isso (generate_series
// na migration 016) — protege contra alguém forçando um range gigante pela
// URL e travando a query/gráfico. 366 cobre até "este mês" de um ano bissexto
// e qualquer preset fixo; só afeta quem tenta abusar do período personalizado.
const MAX_DIAS_PERIODO = 366

function iso(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export interface Periodo {
  ini: string
  fim: string
}

/** Calcula [início, fim] (inclusive, 'yyyy-MM-dd') a partir de um preset. */
export function calcularPeriodo(
  preset: PeriodoPreset,
  customIni: string | undefined,
  customFim: string | undefined,
  hoje: Date = agoraBrasil()
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
      if (ini > fim) [ini, fim] = [fim, ini] // troca em vez de devolver um range invertido (sem linhas)

      const dias = differenceInCalendarDays(new Date(`${fim}T00:00:00`), new Date(`${ini}T00:00:00`))
      if (dias > MAX_DIAS_PERIODO) {
        // Corta o início pra caber no limite, mantendo o fim escolhido —
        // preserva a intenção do usuário ("até tal dia") sem deixar a
        // query varrer um intervalo enorme.
        ini = iso(subDays(new Date(`${fim}T00:00:00`), MAX_DIAS_PERIODO))
      }
      return { ini, fim }
    }
  }
}

/**
 * Período anterior de mesma duração, imediatamente antes de `periodo`.
 * Usado pra comparação ("+18,5% em relação ao período anterior") — a
 * mesma fórmula serve pra qualquer preset, incluindo personalizado.
 */
export function calcularPeriodoAnterior(periodo: Periodo): Periodo {
  const ini = new Date(`${periodo.ini}T00:00:00`)
  const fim = new Date(`${periodo.fim}T00:00:00`)
  const duracaoDias = differenceInCalendarDays(fim, ini) + 1
  return {
    ini: iso(subDays(ini, duracaoDias)),
    fim: iso(subDays(ini, 1)),
  }
}

/** Variação percentual de `atual` em relação a `anterior`. `null` quando não dá pra calcular (0 → 0). */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? null : null // sem base de comparação — não inventa percentual
  return ((atual - anterior) / anterior) * 100
}
