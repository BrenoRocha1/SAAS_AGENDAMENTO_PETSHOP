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
    }
  }

  return null
}
