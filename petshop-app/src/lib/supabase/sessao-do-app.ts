import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient as createSupabaseClient, type UserResponse } from '@supabase/supabase-js'

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
interface SessaoDoApp {
  token: string
  // Resposta do Supabase Auth já conferida pela rota — ver conferirSessaoDoApp.
  conferida?: UserResponse
}

const contexto = new AsyncLocalStorage<SessaoDoApp>()

export function comSessaoDoApp<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return contexto.run({ token }, fn)
}

export function tokenDoApp(): string | null {
  return contexto.getStore()?.token ?? null
}

function clienteComToken(token: string) {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Confere o token no Supabase Auth ANTES de rodar a action. Um token ainda
// dentro da validade pode ser de uma sessão que já foi encerrada (a pessoa
// saiu de todos os aparelhos, a conta foi excluída): o banco ainda aceita,
// o Auth não. Sem esta checagem cada action responderia do seu jeito
// ("Acesso não autorizado", "Não autenticado") e o app não saberia que é
// caso de entrar de novo.
//
// A resposta fica guardada para o primeiro auth.getUser() da action, que
// vem logo em seguida — assim a checagem não custa uma ida a mais ao Auth.
export async function conferirSessaoDoApp(): Promise<'ok' | 'invalida' | 'indisponivel'> {
  const sessao = contexto.getStore()
  if (!sessao) return 'invalida'
  const resposta = await clienteComToken(sessao.token).auth.getUser(sessao.token)
  if (resposta.data.user) {
    sessao.conferida = resposta
    return 'ok'
  }
  // Sem status = o Auth nem respondeu (rede): não é sessão inválida.
  const status = resposta.error?.status
  return status && status >= 400 && status < 500 ? 'invalida' : 'indisponivel'
}

// Client do usuário do app: a chave pública de sempre + o token dele em
// toda chamada (banco, funções e Storage). Nunca é a service_role.
export function clienteDoApp(token: string) {
  const supabase = clienteComToken(token)
  // As actions chamam auth.getUser() sem argumento (no painel, a sessão
  // vem do cookie). Aqui não há sessão guardada — quem é o usuário sai do
  // próprio token, conferido pelo Supabase Auth.
  const getUser = supabase.auth.getUser.bind(supabase.auth)
  supabase.auth.getUser = async (jwt?: string) => {
    const sessao = contexto.getStore()
    if (sessao?.conferida && sessao.token === token && (!jwt || jwt === token)) {
      const conferida = sessao.conferida
      sessao.conferida = undefined
      return conferida
    }
    return getUser(jwt ?? token)
  }
  return supabase
}
