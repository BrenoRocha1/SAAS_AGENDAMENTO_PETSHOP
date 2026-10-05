import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Tom = 'padrao' | 'sucesso' | 'alerta' | 'perigo'

const COR_DO_TOM: Record<Tom, string> = {
  padrao: 'text-foreground',
  sucesso: 'text-success',
  alerta: 'text-warning',
  perigo: 'text-danger',
}

// Números de apoio de uma seção, lado a lado (ex.: registrado, recebido, a
// receber). No celular ficam um embaixo do outro.
export function MiniIndicadores({ itens, className }: {
  itens: { rotulo: ReactNode; valor: ReactNode; tom?: Tom }[]
  className?: string
}) {
  return (
    <dl className={cn('grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]', className)}>
      {itens.map((item, i) => (
        // col-reverse: o número aparece em cima, mas no HTML o rótulo (dt) vem antes.
        <div key={i} className="flex flex-col-reverse justify-end gap-0.5 rounded-lg border border-border bg-background px-4 py-3">
          <dt className="text-xs leading-snug text-muted-foreground">{item.rotulo}</dt>
          <dd className={cn('font-[family-name:var(--font-heading)] text-lg font-semibold tabular-nums', COR_DO_TOM[item.tom ?? 'padrao'])}>
            {item.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}
