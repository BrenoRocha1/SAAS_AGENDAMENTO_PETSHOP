import type { createClient } from '@/lib/supabase/server'

// Resolve "em nome de qual loja este usuário está agindo" — igual pro
// lojista (é ele mesmo) e pro funcionário (é o lojista que o contratou,
// migration 006/028: mesma ideia do helper SQL auth_lojista_id(), só que
// do lado do app pra montar queries/params antes de chamar o banco).
// Usado tanto em Server Components (páginas) quanto em Server Actions —
// os dois recebem o mesmo tipo de client de @/lib/supabase/server.
export interface ContextoLojista {
  idLojista: string
  role: 'lojista' | 'funcionario'
  podeGerenciarAgenda: boolean
  podeGerenciarServicos: boolean
  // Só visualizar Clientes e Pets (sem criar/editar/excluir).
  podeGerenciarClientesPets: boolean
  // "Administrador" — mesmo acesso do lojista em tudo, exceto conceder
  // acesso_total pra outra pessoa (migration 029: só o lojista de
  // verdade pode, garantido também por trigger no banco).
  acessoTotal: boolean
}

export async function obterContextoLojista(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string | undefined
): Promise<ContextoLojista | null> {
  if (role === 'lojista') {
    return {
      idLojista: userId,
      role: 'lojista',
      podeGerenciarAgenda: true,
      podeGerenciarServicos: true,
      podeGerenciarClientesPets: true,
      acessoTotal: true,
    }
  }

  if (role === 'funcionario') {
    const { data } = await supabase
      .from('funcionario')
      .select('id_lojista, pode_gerenciar_agenda, pode_gerenciar_servicos, pode_gerenciar_clientes_pets, acesso_total')
      .eq('id_funcionario', userId)
      .eq('ativo', true)
      .maybeSingle()

    if (!data) return null

    return {
      idLojista: data.id_lojista,
      role: 'funcionario',
      podeGerenciarAgenda: data.pode_gerenciar_agenda || data.acesso_total,
      podeGerenciarServicos: data.pode_gerenciar_servicos || data.acesso_total,
      podeGerenciarClientesPets: data.pode_gerenciar_clientes_pets || data.acesso_total,
      acessoTotal: data.acesso_total,
    }
  }

  return null
}

// Um administrador (funcionário com acesso_total) tem paridade com o
// lojista em todas as telas — menos criar OUTRO administrador, que só o
// dono da conta pode. `ehResponsavelPelaConta` é essa distinção: usa
// pra decidir se a opção "Acesso total" aparece/é aceita num formulário.
export function ehResponsavelPelaConta(contexto: ContextoLojista) {
  return contexto.role === 'lojista'
}
