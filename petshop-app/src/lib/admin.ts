import { createClient } from '@/lib/supabase/server'

export interface PlatformAdmin {
  id: string
  email: string
  nome: string | null
  ativo: boolean
}

/**
 * Verifica se o usuário logado é um admin da plataforma (tabela
 * admin_usuario — migration 009). Retorna null se não estiver logado
 * ou não for admin. Usar em Server Components/Actions do painel /admin.
 *
 * Importante: isto é ortogonal ao role_usuario (cliente/lojista) — um
 * admin da plataforma pode até ter uma conta de cliente/lojista normal
 * também; a permissão de admin não depende do enum role_usuario.
 */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('admin_usuario')
    .select('id, email, nome, ativo')
    .eq('id', user.id)
    .eq('ativo', true)
    .maybeSingle()

  return (data as PlatformAdmin | null) ?? null
}
