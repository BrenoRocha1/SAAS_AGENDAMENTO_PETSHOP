'use server'

// Promoção de um serviço ou produto (migration 096). Grava só as colunas da
// promoção — o resto do cadastro não muda. Quem pode: quem gerencia serviços
// (serviço) ou produtos (produto).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterContextoLojista } from '@/lib/lojista-context'
import { colunasPromocaoServico, lerDadosPromocaoServico, validarPromocaoServico } from '@/lib/promocao'
import { mensagemErroPromocaoServico } from '@/lib/promocao-servidor'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEM_CHAVE = 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.'

// Quem grava: o lojista, com o client normal (RLS). Funcionário, com o client
// de serviço — a policy de escrita de servico (migration 006) só aceita quem
// tem a caixinha "serviços" marcada, e o administrador (acesso total) sem ela
// via "Promoção salva" sem nada gravado. A permissão é conferida aqui no
// código antes, e todo UPDATE filtra pela loja.
function clienteDeEscrita(role: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  return role === 'lojista' ? supabase : createAdminClient()
}
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export async function salvarPromocaoAction(
  tipo: 'servico' | 'produto',
  id: string,
  dados: { percentual: number | null; inicio: string | null; fim: string | null },
): Promise<{ error?: string; success?: boolean }> {
  if ((tipo !== 'servico' && tipo !== 'produto') || !UUID_RE.test(id)) return { error: 'Item inválido.' }
  const { percentual, inicio, fim } = dados
  if (percentual !== null && (!Number.isInteger(percentual) || percentual < 1 || percentual > 90)) {
    return { error: 'O desconto vai de 1% a 90%.' }
  }
  if ((inicio && !DATA_RE.test(inicio)) || (fim && !DATA_RE.test(fim))) return { error: 'Data inválida.' }
  if (inicio && fim && fim < inicio) return { error: 'A data de fim precisa ser depois do início.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (tipo === 'servico' && !contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }
  if (tipo === 'produto' && !contexto.podeGerenciarProdutos) return { error: 'Você não tem permissão para gerenciar produtos.' }

  const valores = percentual === null
    ? { promo_percentual: null, promo_inicio: null, promo_fim: null }
    : { promo_percentual: percentual, promo_inicio: inicio, promo_fim: fim }

  const db = clienteDeEscrita(contexto.role, supabase)
  if (!db) return { error: SEM_CHAVE }
  const tabela = tipo === 'servico' ? 'servico' : 'produto'
  const coluna = tipo === 'servico' ? 'id_servico' : 'id_produto'
  const { data: alterado, error } = await db.from(tabela).update(valores).eq(coluna, id).eq('id_lojista', contexto.idLojista).select(coluna)
  if (error) {
    if (/promo_percentual|column/i.test(error.message)) return { error: 'Execute a migration 096_promocoes.sql para usar promoções.' }
    return { error: 'Não foi possível salvar a promoção.' }
  }
  if (!alterado || alterado.length === 0) return { error: 'Item não encontrado nesta loja. Recarregue a página.' }

  revalidatePath(tipo === 'servico' ? '/lojista/servicos' : '/lojista/produtos')
  revalidatePath('/lojista/pdv')
  return { success: true }
}

// Promoção do SERVIÇO, completa (migration 096): preço promocional, período
// com hora, liga/desliga e "oferecer no agendamento online". `dados` nulo
// tira a promoção. O preço do serviço é lido do banco — a tela não manda —
// e o banco confere tudo de novo (trigger da 096).
export async function salvarPromocaoServicoAction(
  id: string,
  dados: unknown,
): Promise<{ error?: string; success?: boolean }> {
  if (typeof id !== 'string' || !UUID_RE.test(id)) return { error: 'Serviço inválido.' }
  const lido = lerDadosPromocaoServico(dados)
  if (lido === undefined) return { error: 'Dados da promoção inválidos.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }

  const db = clienteDeEscrita(contexto.role, supabase)
  if (!db) return { error: SEM_CHAVE }

  const { data: servico } = await db
    .from('servico')
    .select('id_servico, preco')
    .eq('id_servico', id)
    .eq('id_lojista', contexto.idLojista)
    .is('excluido_em', null)
    .maybeSingle()
  if (!servico) return { error: 'Serviço não encontrado.' }

  if (lido) {
    const problema = validarPromocaoServico(lido, Number(servico.preco))
    if (problema) return { error: problema }
  }

  const { data: alterado, error } = await db
    .from('servico')
    .update(colunasPromocaoServico(lido))
    .eq('id_servico', id)
    .eq('id_lojista', contexto.idLojista)
    .select('id_servico')
  if (error) return { error: mensagemErroPromocaoServico(error.message) ?? 'Não foi possível salvar a promoção.' }
  if (!alterado || alterado.length === 0) return { error: 'Serviço não encontrado nesta loja. Recarregue a página.' }

  revalidatePath('/lojista/servicos')
  return { success: true }
}
