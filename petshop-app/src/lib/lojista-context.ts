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
}

export async function obterContextoLojista(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string | undefined
): Promise<ContextoLojista | null> {
  if (role === 'lojista') {
    return { idLojista: userId, role: 'lojista', podeGerenciarAgenda: true, podeGerenciarServicos: true }
  }

  if (role === 'funcionario') {
    const { data } = await supabase
      .from('funcionario')
      .select('id_lojista, pode_gerenciar_agenda, pode_gerenciar_servicos')
      .eq('id_funcionario', userId)
      .eq('ativo', true)
      .maybeSingle()

    if (!data) return null

    return {
      idLojista: data.id_lojista,
      role: 'funcionario',
      podeGerenciarAgenda: data.pode_gerenciar_agenda,
      podeGerenciarServicos: data.pode_gerenciar_servicos,
    }
  }

  return null
}
