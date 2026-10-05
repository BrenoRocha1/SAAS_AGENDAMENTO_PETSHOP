import type { ReactNode } from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface ItemDoRanking {
  chave: string
  titulo: string
  // Linha de apoio embaixo (ex.: "12 atendimentos · ticket médio R$ 80,00").
  detalhe?: ReactNode
  // Já formatado (ex.: "R$ 640,00").
  valor: ReactNode
  // Quanto este item pesa na barra, de 0 a 1 (parte do total, ou em relação
  // ao maior). Sem ele, a linha fica sem barra.
  parte?: number
  // Texto ao lado da barra (ex.: "42,5%"). Sem ele, só a barra.
  rotuloDaParte?: string
  // Uma barra própria no lugar da de progresso (ex.: BarraEmPartes).
  barra?: ReactNode
  // No avatar, no lugar das iniciais do título (ex.: "—" quando o item não
  // é uma pessoa).
  sigla?: string
  // O título vira link (ex.: pra ficha do pet).
  href?: string
  // Ao lado do título (ex.: uma etiqueta com a quantidade).
  etiqueta?: ReactNode
}

// As duas primeiras iniciais de um nome ("Pedro Henrique" → "PH").
function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? '?').slice(0, 2)
  return letras.toUpperCase()
}

// Lista ordenada (serviços, profissionais, clientes, planos…): nome e valor
// na mesma linha e, embaixo, uma barra com o peso de cada um. `comIniciais`
// põe o avatar com as iniciais — pra quando os itens são pessoas.
export function Ranking({ itens, comIniciais = false, className }: {
  itens: ItemDoRanking[]
  comIniciais?: boolean
  className?: string
}) {
  return (
    <ol className={cn('flex list-none flex-col gap-4', className)}>
      {itens.map(item => (
        <li key={item.chave} className="flex items-start gap-3">
          {comIniciais && (
            <Avatar className="size-9">
              <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{item.sigla ?? iniciais(item.titulo)}</AvatarFallback>
            </Avatar>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                {item.href ? (
                  <Link href={item.href} className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline">{item.titulo}</Link>
                ) : (
                  <span className="truncate text-sm font-medium text-foreground">{item.titulo}</span>
                )}
                {item.etiqueta}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{item.valor}</span>
            </div>
            {(item.barra || item.parte !== undefined) && (
              <div className="flex items-center gap-3">
                {item.barra ?? (
                  <Progress value={Math.max(0, Math.min(100, (item.parte ?? 0) * 100))} className="h-1.5" aria-label={`Peso de ${item.titulo}`} />
                )}
                {item.rotuloDaParte && (
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{item.rotuloDaParte}</span>
                )}
              </div>
            )}
            {item.detalhe && <p className="text-xs leading-snug text-muted-foreground">{item.detalhe}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

// Barra em partes coloridas (ex.: recebido em verde, a receber em âmbar e,
// em cinza, o que não tem situação), cada uma do tamanho da sua fatia de
// `total`.
export function BarraEmPartes({ partes, total, rotulo }: {
  partes: { valor: number; tom: 'sucesso' | 'alerta' | 'primario' | 'neutro' }[]
  total: number
  rotulo?: string
}) {
  const cor = { sucesso: 'bg-success-solid', alerta: 'bg-warning-solid', primario: 'bg-primary', neutro: 'bg-muted-foreground/35' } as const
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label={rotulo}>
      {partes.map((p, i) => (
        <span key={i} className={cn('h-full', cor[p.tom])} style={{ width: `${total > 0 ? (p.valor / total) * 100 : 0}%` }} />
      ))}
    </div>
  )
}
