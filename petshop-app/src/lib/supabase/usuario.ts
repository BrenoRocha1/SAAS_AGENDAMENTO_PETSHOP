import { cache } from 'react'
import { createClient } from './server'

// Usuário da sessão para Server Components (páginas e layouts).
//
// getClaims() confere o token pela assinatura com as chaves públicas do
// projeto (ES256) — sem ir ao Supabase Auth a cada página, como o
// getUser() fazia (~45 ms por chamada, medido). O cache() do React guarda
// o resultado durante a mesma requisição: layout e página usam o mesmo.
//
// Server Actions (que gravam dados) continuam com getUser(), que também
// percebe uma sessão revogada antes de o token expirar.
export interface UsuarioSessao {
  id: string
  email: string | null
  user_metadata: { role?: string; [chave: string]: unknown }
}

export const obterUsuario = cache(async (): Promise<UsuarioSessao | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    user_metadata: (claims.user_metadata ?? {}) as UsuarioSessao['user_metadata'],
  }
})
