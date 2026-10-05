import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IconTrendDown, IconTrendUp } from '@/components/icons'
import { variacaoPercentual } from '@/lib/relatorios'
import { cn } from '@/lib/utils'

// Blocos dos relatórios, montados com os componentes de src/components/ui
// (cartão, etiqueta, progresso, avatar, gráfico). É a única pasta fora de
// components/ui em que classes Tailwind funcionam — ver src/app/tailwind.css.

// Como o número se compara com o período anterior: "+18,5%" (em destaque)
// e "vs. período anterior" (ao lado, apagado).
export interface Variacao {
  sentido: 'alta' | 'baixa' | 'igual' | 'novo'
  texto: string
  complemento: string
}

// Como `atual` se compara com o número do período anterior — sempre a
// partir de dois números reais (nunca uma porcentagem inventada). Nulo
// quando não havia nada antes nem agora.
export function compararComAnterior(atual: number, anterior: number): Variacao | null {
  if (anterior === 0) {
    return atual === 0 ? null : { sentido: 'novo', texto: 'Novo', complemento: 'nada no período anterior' }
  }
  const pct = variacaoPercentual(atual, anterior)
  if (pct === null || Math.abs(pct) < 0.05) return { sentido: 'igual', texto: 'Igual', complemento: 'ao período anterior' }
  return {
    sentido: pct > 0 ? 'alta' : 'baixa',
    texto: `${pct > 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`,
    complemento: 'vs. período anterior',
  }
}

const COR_VARIACAO: Record<Variacao['sentido'], string> = {
  alta: 'text-success',
  baixa: 'text-danger',
  igual: 'text-muted-foreground',
  novo: 'text-success',
}

// Grade dos indicadores: uma coluna no celular, até `colunas` no computador.
export function GradeIndicadores({ colunas = 3, children }: { colunas?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', colunas === 4 && 'xl:grid-cols-4', colunas === 3 && 'lg:grid-cols-3')}>
      {children}
    </div>
  )
}

// Indicador: o que é (com o ícone ao lado), o número e, embaixo, a
// comparação com o período anterior e/ou uma explicação curta.
export function Indicador({ rotulo, valor, icone, variacao, detalhe }: {
  rotulo: string
  valor: ReactNode
  icone: ReactNode
  variacao?: Variacao | null
  detalhe?: ReactNode
}) {
  return (
    <Card className="rounded-xl">
      <CardHeader className="flex-row items-center justify-between gap-3 p-5 pb-2">
        <CardTitle className="font-[family-name:var(--font-body)] text-sm font-medium leading-snug tracking-normal text-muted-foreground">
          {rotulo}
        </CardTitle>
        <span aria-hidden className="shrink-0 text-primary [&>svg]:size-5">{icone}</span>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <div className="font-[family-name:var(--font-heading)] text-2xl font-semibold tabular-nums text-foreground">{valor}</div>
        {(variacao || detalhe) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-snug text-muted-foreground">
            {variacao && (
              <>
                <span className={cn('inline-flex items-center gap-1 font-semibold [&>svg]:size-3', COR_VARIACAO[variacao.sentido])}>
                  {variacao.sentido === 'alta' && <IconTrendUp aria-hidden />}
                  {variacao.sentido === 'baixa' && <IconTrendDown aria-hidden />}
                  {variacao.texto}
                </span>
                <span>{variacao.complemento}</span>
              </>
            )}
            {variacao && detalhe && <span aria-hidden>·</span>}
            {detalhe && <span>{detalhe}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
