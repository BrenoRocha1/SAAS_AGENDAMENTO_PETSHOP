import type { SupabaseClient } from '@supabase/supabase-js'

// Espelha petshop-app/src/lib/lojista-context.ts (obterContextoLojista) —
// mesma regra de "em nome de qual loja este usuário está agindo", pro
// funcionário resolver o id_lojista de quem o contratou. O app mobile é
// principalmente pra equipe da loja (lojista ou funcionário), nunca pro
// cliente final.
export interface ContextoLojista {
  idLojista: string
  role: 'lojista' | 'funcionario'
  nome: string
  podeGerenciarAgenda: boolean
  podeGerenciarServicos: boolean
  podeGerenciarProdutos: boolean
  podeGerenciarClientesPets: boolean
  acessoTotal: boolean
  // Função TaxiDog (migration 042): recebe corridas no app. Não é
  // permissão — o dono da loja não é TaxiDog por ser dono.
  podeTaxidog: boolean
}

// Consulta separada e tolerante: sem a migration 042 a coluna não existe,
// e isso não pode derrubar o login de ninguém.
async function lerPodeTaxidog(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('funcionario').select('pode_taxidog').eq('id_funcionario', userId).maybeSingle()
  return !error && !!data?.pode_taxidog
}

export async function obterContextoLojista(
  supabase: SupabaseClient,
  userId: string,
  role: string | undefined
): Promise<ContextoLojista | null> {
  if (role === 'lojista') {
    const { data } = await supabase
      .from('lojista')
      .select('nome_loja')
      .eq('id_lojista', userId)
      .maybeSingle()

    return {
      idLojista: userId,
      role: 'lojista',
      nome: data?.nome_loja ?? 'Loja',
      podeGerenciarAgenda: true,
      podeGerenciarServicos: true,
      podeGerenciarProdutos: true,
      podeGerenciarClientesPets: true,
      acessoTotal: true,
      podeTaxidog: false,
    }
  }

  if (role === 'funcionario') {
    const { data } = await supabase
      .from('funcionario')
      .select(
        'id_lojista, nome, pode_gerenciar_agenda, pode_gerenciar_servicos, pode_gerenciar_produtos, pode_gerenciar_clientes_pets, acesso_total'
      )
      .eq('id_funcionario', userId)
      .eq('ativo', true)
      .maybeSingle()

    if (!data) return null

    return {
      idLojista: data.id_lojista,
      role: 'funcionario',
      nome: data.nome,
      podeGerenciarAgenda: data.pode_gerenciar_agenda || data.acesso_total,
      podeGerenciarServicos: data.pode_gerenciar_servicos || data.acesso_total,
      podeGerenciarProdutos: data.pode_gerenciar_produtos || data.acesso_total,
      podeGerenciarClientesPets: data.pode_gerenciar_clientes_pets || data.acesso_total,
      acessoTotal: data.acesso_total,
      podeTaxidog: await lerPodeTaxidog(supabase, userId),
    }
  }

  return null
}
