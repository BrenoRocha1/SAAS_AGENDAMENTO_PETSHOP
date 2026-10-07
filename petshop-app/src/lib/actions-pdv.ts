'use server'

// Server Actions do PDV (migration 083). Preço, estoque, forma aceita e
// permissão são conferidos de novo no banco (fn_registrar_venda_pdv) —
// aqui só validação de formato e o tratamento das mensagens.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import { ehFormaPagamento } from '@/lib/pagamento'
import type { ClientePdv, EntradaVendaPdv, VendaRegistrada } from '@/lib/pdv'

type Resultado<T = object> = ({ error: string } | ({ error?: undefined } & T))

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mensagem(error: { message?: string; code?: string }, fallback: string): string {
  const msg = error.message ?? ''
  if (error.code === 'PGRST202' || /Could not find the function|does not exist|schema cache/i.test(msg)) {
    return 'Execute a migration 083_pdv.sql para usar o PDV.'
  }
  // As mensagens de regra ("PDV: ...") já vêm prontas pra mostrar.
  const m = msg.match(/PDV: ([^\n]+)/)
  if (m) return m[1]
  return fallback
}

async function contextoDoCaixa() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, contexto: null, erro: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { supabase, contexto: null, erro: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarProdutos) {
    return { supabase, contexto: null, erro: 'Você não tem permissão para usar o caixa.' }
  }
  return { supabase, contexto, erro: null }
}

export async function registrarVendaPdvAction(entrada: EntradaVendaPdv): Promise<Resultado<{ venda: VendaRegistrada }>> {
  if (!Array.isArray(entrada.itens) || entrada.itens.length === 0) {
    return { error: 'Adicione pelo menos um produto à venda.' }
  }
  if (entrada.itens.length > 100) return { error: 'Itens demais em uma única venda (máximo 100).' }
  for (const item of entrada.itens) {
    if (!UUID_RE.test(item.id_produto)) return { error: 'Produto inválido.' }
    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0 || item.quantidade > 100000) {
      return { error: 'Informe uma quantidade válida.' }
    }
  }
  if (!ehFormaPagamento(entrada.forma)) return { error: 'Escolha a forma de pagamento.' }
  if (!Number.isFinite(entrada.desconto) || entrada.desconto < 0) return { error: 'Desconto inválido.' }
  if (entrada.valorRecebido !== null && (!Number.isFinite(entrada.valorRecebido) || entrada.valorRecebido < 0)) {
    return { error: 'Valor recebido inválido.' }
  }
  if (entrada.idCliente !== null && !UUID_RE.test(entrada.idCliente)) return { error: 'Cliente inválido.' }

  const { supabase, contexto, erro } = await contextoDoCaixa()
  if (!contexto) return { error: erro ?? 'Acesso não autorizado' }

  const { data, error } = await supabase.rpc('fn_registrar_venda_pdv', {
    p_itens: entrada.itens,
    p_desconto: entrada.desconto,
    p_forma: entrada.forma,
    p_valor_recebido: entrada.forma === 'dinheiro' ? entrada.valorRecebido : null,
    p_id_cliente: entrada.idCliente,
  })
  if (error) return { error: mensagem(error, 'Não foi possível registrar a venda. Tente novamente.') }

  const r = data as { id_venda: string; numero: number; total: number; troco: number }
  revalidatePath('/lojista/pdv')
  revalidatePath('/lojista/pdv/vendas')
  revalidatePath('/lojista/produtos')
  return {
    venda: {
      id_venda: r.id_venda,
      numero: Number(r.numero),
      total: Number(r.total),
      troco: Number(r.troco ?? 0),
    },
  }
}

export async function cancelarVendaPdvAction(idVenda: string, motivo: string): Promise<Resultado> {
  if (!UUID_RE.test(idVenda)) return { error: 'Venda inválida.' }
  const texto = (motivo ?? '').trim()
  if (texto.length > 200) return { error: 'O motivo pode ter no máximo 200 caracteres.' }

  const { supabase, contexto, erro } = await contextoDoCaixa()
  if (!contexto) return { error: erro ?? 'Acesso não autorizado' }

  const { error } = await supabase.rpc('fn_cancelar_venda_pdv', {
    p_id_venda: idVenda,
    p_motivo: texto || null,
  })
  if (error) return { error: mensagem(error, 'Não foi possível cancelar a venda.') }

  revalidatePath('/lojista/pdv')
  revalidatePath('/lojista/pdv/vendas')
  revalidatePath('/lojista/produtos')
  return {}
}

export async function buscarClientesPdvAction(busca: string): Promise<Resultado<{ clientes: ClientePdv[] }>> {
  const termo = (busca ?? '').trim().slice(0, 60)

  const { supabase, contexto, erro } = await contextoDoCaixa()
  if (!contexto) return { error: erro ?? 'Acesso não autorizado' }

  const { data, error } = await supabase.rpc('fn_pdv_buscar_clientes', { p_busca: termo || null })
  if (error) return { error: mensagem(error, 'Não foi possível buscar os clientes.') }

  return { clientes: (data ?? []) as ClientePdv[] }
}
