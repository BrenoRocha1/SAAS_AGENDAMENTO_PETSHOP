'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatarReais } from '@/lib/taxidog'

export interface PontoDaEvolucao {
  // Rótulo do eixo (ex.: "18/09").
  rotulo: string
  faturamento: number
  vendas: number
}

const CONFIG = {
  faturamento: { label: 'Faturamento', color: 'var(--primary-600)' },
} satisfies ChartConfig

// Eixo: "R$ 1,2 mil" em vez de "R$ 1.200,00", pra caber.
const reaisCurto = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil` : `R$ ${Math.round(v)}`

// Faturamento por dia em área, com o detalhe do dia (valor e nº de vendas)
// ao passar o mouse ou tocar. Carregado sob demanda por quem usa
// (next/dynamic) — a biblioteca de gráficos é pesada.
export default function GraficoEvolucao({ pontos, rotuloDasVendas = 'Vendas' }: {
  pontos: PontoDaEvolucao[]
  // Como chamar a contagem na dica (ex.: "Atendimentos").
  rotuloDasVendas?: string
}) {
  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full">
      <AreaChart data={pontos} margin={{ left: 4, right: 8, top: 8 }} accessibilityLayer>
        <defs>
          <linearGradient id="evolucaoFaturamento" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-faturamento)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-faturamento)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
        <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={reaisCurto} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(valor, _nome, item) => {
                const vendas = Number(item.payload?.vendas ?? 0)
                return (
                  <div className="flex w-full flex-col gap-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">Faturamento</span>
                      <span className="font-medium tabular-nums text-foreground">{formatarReais(Number(valor))}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">{rotuloDasVendas}</span>
                      <span className="font-medium tabular-nums text-foreground">{vendas}</span>
                    </div>
                  </div>
                )
              }}
            />
          }
        />
        <Area
          dataKey="faturamento"
          type="monotone"
          stroke="var(--color-faturamento)"
          fill="url(#evolucaoFaturamento)"
          strokeWidth={2}
          // Com um ou dois dias não há curva: marca os pontos.
          dot={pontos.length <= 2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
