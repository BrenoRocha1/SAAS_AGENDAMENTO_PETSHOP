// Promoções de serviços e produtos (migration 096): desconto em % com início
// e fim opcionais. O banco aplica o desconto na cobrança; aqui é só para
// mostrar na tela. Não é um arquivo 'use server'.

export interface Promocao {
  promo_percentual: number | null
  promo_inicio: string | null
  promo_fim: string | null
}

// Desconto que vale hoje (0 = sem promoção). `hojeISO` = data de Brasília.
export function promoVigente(p: Partial<Promocao> | null | undefined, hojeISO: string): number {
  const pct = Number(p?.promo_percentual ?? 0)
  if (!pct) return 0
  if (p?.promo_inicio && hojeISO < p.promo_inicio) return 0
  if (p?.promo_fim && hojeISO > p.promo_fim) return 0
  return pct
}

export function precoComDesconto(preco: number, percentual: number): number {
  if (!percentual) return preco
  return Math.round(preco * (100 - percentual)) / 100
}

// "Até 15/11" / "A partir de 01/11" / "Sem data para acabar".
export function periodoPromo(p: Partial<Promocao>): string {
  const br = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')
  if (p.promo_inicio && p.promo_fim) return `De ${br(p.promo_inicio)} a ${br(p.promo_fim)}`
  if (p.promo_fim) return `Até ${br(p.promo_fim)}`
  if (p.promo_inicio) return `A partir de ${br(p.promo_inicio)}`
  return 'Sem data para acabar'
}
