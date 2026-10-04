// Espelha petshop-app/src/lib/pagamento.ts (migration 057). Todo
// agendamento novo tem forma de pagamento e status do pagamento. Escolher
// a forma não é pagar: nasce "pendente" e a loja marca "pago" ao receber.

export type FormaPagamento = 'pix' | 'cartao_credito' | 'cartao_debito' | 'dinheiro'
export type StatusPagamento = 'pendente' | 'pago' | 'cancelado'

export const FORMAS_PAGAMENTO: FormaPagamento[] = ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro']

export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  dinheiro: 'Dinheiro',
}

export const ROTULO_STATUS_PAGAMENTO: Record<StatusPagamento, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  cancelado: 'Cancelado',
}

export const ehFormaPagamento = (v: unknown): v is FormaPagamento =>
  typeof v === 'string' && (FORMAS_PAGAMENTO as string[]).includes(v)

export const ehStatusPagamento = (v: unknown): v is StatusPagamento =>
  v === 'pendente' || v === 'pago' || v === 'cancelado'

// Pedido inteiro coberto pelo plano do pet (migration 082): não há o que
// pagar e a forma gravada é 'plano'. Ninguém escolhe essa forma — o banco a
// grava quando o benefício zera o pedido e a tira se voltar a haver cobrança
// —, por isso ela fica fora de FORMAS_PAGAMENTO e de FormaPagamento.
export const FORMA_PLANO = 'plano'
export const ROTULO_FORMA_PLANO = 'Plano de assinatura'
export const ehFormaPlano = (v: unknown): boolean => v === FORMA_PLANO

export function rotuloForma(forma: string | null | undefined): string {
  if (ehFormaPlano(forma)) return ROTULO_FORMA_PLANO
  return ehFormaPagamento(forma) ? ROTULO_FORMA_PAGAMENTO[forma] : 'Não informada'
}

// Configuração da loja (fn_formas_pagamento_loja). Sem configuração:
// Dinheiro e cartões ligados, Pix desligado.
export interface FormasLoja {
  pix: boolean
  pix_chave: string | null
  pix_nome: string | null
  dinheiro: boolean
  cartao_credito: boolean
  cartao_debito: boolean
  configurado: boolean
}

export const FORMAS_LOJA_PADRAO: FormasLoja = {
  pix: false,
  pix_chave: null,
  pix_nome: null,
  dinheiro: true,
  cartao_credito: true,
  cartao_debito: true,
  configurado: false,
}

export function normalizarFormasLoja(raw: unknown): FormasLoja {
  if (!raw || typeof raw !== 'object') return FORMAS_LOJA_PADRAO
  const r = raw as Partial<FormasLoja>
  return {
    pix: !!r.pix,
    pix_chave: r.pix_chave ?? null,
    pix_nome: r.pix_nome ?? null,
    dinheiro: !!r.dinheiro,
    cartao_credito: !!r.cartao_credito,
    cartao_debito: !!r.cartao_debito,
    configurado: !!r.configurado,
  }
}

export function formasAtivas(f: FormasLoja): FormaPagamento[] {
  return FORMAS_PAGAMENTO.filter(forma => f[forma])
}
