import { createBrowserClient } from '@supabase/ssr'

// cookieOptions.maxAge: por padrão o @supabase/ssr grava o cookie de sessão
// com a duração do ACCESS token (1h), não do refresh token (semanas) — o
// usuário ficava deslogado depois de ~1h parado, mesmo a sessão real ainda
// sendo válida. 100 dias aqui = "só sai quando clicar em Sair".
const COOKIE_OPTIONS = { maxAge: 60 * 60 * 24 * 100 }

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: COOKIE_OPTIONS }
  )
}
