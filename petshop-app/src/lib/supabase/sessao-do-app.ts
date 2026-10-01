import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Sessão de quem chama pelo APP MOBILE. O painel web se identifica pelo
// cookie; o app manda o token da própria sessão do Supabase
// (Authorization: Bearer …) para /api/app/acao, que roda a mesma Server
// Action do painel "dentro" deste contexto. Enquanto ele está ativo,
// createClient() (lib/supabase/server.ts) devolve um client com esse
// token no lugar do client de cookies — e a action nem percebe a
// diferença: mesmas consultas, mesma RLS, mesmas checagens de permissão.
//
// Só a rota de API liga este contexto. Uma requisição comum do
// navegador nunca passa por aqui, então nada muda no painel.
const contexto = new AsyncLocalStorage<string>()

export function comSessaoDoApp<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return contexto.run(token, fn)
}

export function tokenDoApp(): string | null {
  return contexto.getStore() ?? null
}

// Client do usuário do app: a chave pública de sempre + o token dele em
// toda chamada (banco, funções e Storage). Nunca é a service_role.
export function clienteDoApp(token: string) {
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  // As actions chamam auth.getUser() sem argumento (no painel, a sessão
  // vem do cookie). Aqui não há sessão guardada — quem é o usuário sai do
  // próprio token, conferido pelo Supabase Auth.
  const getUser = supabase.auth.getUser.bind(supabase.auth)
  supabase.auth.getUser = (jwt?: string) => getUser(jwt ?? token)
  return supabase
}
