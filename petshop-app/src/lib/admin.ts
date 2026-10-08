import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'

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
  const user = await obterUsuario()
  if (!user) return null

  const { data } = await supabase
    .from('admin_usuario')
    .select('id, email, nome, ativo')
    .eq('id', user.id)
    .eq('ativo', true)
    .maybeSingle()

  return (data as PlatformAdmin | null) ?? null
}

/**
 * Segundo fator (TOTP, app autenticador) do painel interno. O painel só
 * abre com a sessão em nível "aal2" — ou seja, depois do código de 6
 * dígitos. Escape de emergência: INTERNO_2FA=off nas variáveis de ambiente
 * (use só se o MFA do Supabase estiver desligado e você ficar trancado fora).
 */
export async function segundoFatorOk(): Promise<boolean> {
  if (process.env.INTERNO_2FA === 'off') return true
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return (data?.claims as { aal?: string } | undefined)?.aal === 'aal2'
}
