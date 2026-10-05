import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Seção de relatório: cartão com título, uma linha dizendo o que os números
// são e, à direita, uma ação (ex.: exportar). O que vai dentro fica
// empilhado com o mesmo espaço entre um bloco e outro — quem usa não passa
// classe de margem (fora desta pasta o Tailwind não as gera).
export function Secao({ titulo, descricao, icone, acao, className, children }: {
  titulo: string
  descricao?: ReactNode
  icone?: ReactNode
  acao?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('min-w-0 rounded-xl', className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold leading-snug tracking-normal text-foreground [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-primary">
            {icone}
            {titulo}
          </CardTitle>
          {descricao && <CardDescription className="text-[0.8125rem] leading-snug">{descricao}</CardDescription>}
        </div>
        {acao}
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5 pt-0 sm:p-6 sm:pt-0">{children}</CardContent>
    </Card>
  )
}

// As seções de um relatório, uma embaixo da outra.
export function Pilha({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6">{children}</div>
}

// Dois blocos lado a lado no computador, um embaixo do outro no celular.
export function DuasColunas({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid items-start gap-6 lg:grid-cols-2', className)}>{children}</div>
}

// Parte de uma seção com um subtítulo pequeno (ex.: "Planos mais vendidos").
export function GrupoDaSecao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h4 className="font-[family-name:var(--font-body)] text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h4>
      {children}
    </div>
  )
}

// Nota de rodapé de uma seção (como os números foram contados).
export function NotaDaSecao({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
}

// Seção sem nada pra mostrar no período.
export function SecaoVazia({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
