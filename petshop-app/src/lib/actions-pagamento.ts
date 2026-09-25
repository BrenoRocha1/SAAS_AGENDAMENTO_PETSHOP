'use server'

// Server Actions das formas de pagamento (migration 057). Quem pode e as
// regras (Pix com chave e nome, ao menos uma forma ligada, forma aceita
// pela loja) estão nas funções do banco.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ehFormaPagamento, ehStatusPagamento, type FormaPagamento, type StatusPagamento } from '@/lib/pagamento'

type Resultado = { error?: string; success?: boolean }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mensagem(error: { message?: string; code?: string }, fallback: string): string {
  const msg = error.message ?? ''
  if (error.code === 'PGRST202' || msg.includes('Could not find the function') || msg.includes('does not exist')) {
    return 'Execute a migration 057_formas_pagamento.sql para usar as formas de pagamento.'
  }
  // As mensagens das funções já vêm prontas pra mostrar.
  return msg.startsWith('Pagamento: ') ? msg.slice('Pagamento: '.length) : (msg || fallback)
}

export interface DadosFormasPagamento {
  pix: boolean
  pix_chave: string
  pix_nome: string
  dinheiro: boolean
  cartao_credito: boolean
  cartao_debito: boolean
}

export async function salvarFormasPagamentoAction(dados: DadosFormasPagamento): Promise<Resultado> {
  const chave = (dados.pix_chave ?? '').trim()
  const nome = (dados.pix_nome ?? '').trim()
  if (chave.length > 140 || nome.length > 100) return { error: 'Chave ou nome do Pix muito longos.' }
  if (dados.pix && (!chave || !nome)) return { error: 'Para ativar o Pix, preencha a chave e o nome de identificação.' }
  if (!dados.pix && !dados.dinheiro && !dados.cartao_credito && !dados.cartao_debito) {
    return { error: 'Deixe pelo menos uma forma de pagamento ativada.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_salvar_formas_pagamento', {
    p_pix_ativo: !!dados.pix,
    p_pix_chave: chave || null,
    p_pix_nome: nome || null,
    p_dinheiro: !!dados.dinheiro,
    p_credito: !!dados.cartao_credito,
    p_debito: !!dados.cartao_debito,
  })
  if (error) return { error: mensagem(error, 'Não foi possível salvar as formas de pagamento.') }

  revalidatePath('/lojista/configuracoes/pagamentos')
  return { success: true }
}

// Forma e/ou status de um pedido (vale pros serviços criados juntos).
export async function atualizarPagamentoAction(
  idAgendamento: string,
  forma: FormaPagamento | null,
  status: StatusPagamento | null
): Promise<Resultado> {
  if (!UUID_RE.test(idAgendamento)) return { error: 'Agendamento inválido.' }
  if (forma !== null && !ehFormaPagamento(forma)) return { error: 'Forma de pagamento inválida.' }
  if (status !== null && !ehStatusPagamento(status)) return { error: 'Status inválido.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_atualizar_pagamento', {
    p_id_agendamento: idAgendamento,
    p_forma: forma,
    p_status: status,
  })
  if (error) return { error: mensagem(error, 'Não foi possível atualizar o pagamento.') }

  revalidatePath('/lojista/kanban')
  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/relatorios')
  return { success: true }
}
