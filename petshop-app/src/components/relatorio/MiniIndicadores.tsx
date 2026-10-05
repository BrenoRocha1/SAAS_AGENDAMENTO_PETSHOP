import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type Tom = 'padrao' | 'sucesso' | 'alerta' | 'perigo'

const COR_DO_TOM: Record<Tom, string> = {
  padrao: 'text-foreground',
  sucesso: 'text-success',
  alerta: 'text-warning',
  perigo: 'text-danger',
}

// Números de apoio de uma seção, lado a lado (ex.: registrado, recebido, a
// receber). No celular ficam um embaixo do outro. Com `href`, o quadro
// inteiro vira link (ex.: pra lista já filtrada).
export function MiniIndicadores({ itens, className }: {
  itens: { rotulo: ReactNode; valor: ReactNode; tom?: Tom; href?: string }[]
  className?: string
}) {
  const quadro = 'flex h-full flex-col gap-0.5 rounded-lg border border-border bg-background px-4 py-3'
  return (
    <ul className={cn('grid list-none gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]', className)}>
      {itens.map((item, i) => {
        const conteudo = (
          <>
            <span className={cn('font-[family-name:var(--font-heading)] text-lg font-semibold tabular-nums', COR_DO_TOM[item.tom ?? 'padrao'])}>
              {item.valor}
            </span>
            <span className="text-xs leading-snug text-muted-foreground">{item.rotulo}</span>
          </>
        )
        return (
          <li key={i}>
            {item.href ? (
              <Link href={item.href} className={cn(quadro, 'transition-colors hover:border-primary/40 hover:bg-accent')}>{conteudo}</Link>
            ) : (
              <div className={quadro}>{conteudo}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
