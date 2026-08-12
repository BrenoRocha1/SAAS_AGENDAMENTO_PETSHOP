import { createClient } from '@supabase/supabase-js'

/**
 * Client com service_role key — bypassa o RLS.
 * USE APENAS em Server Actions/Route Handlers confiáveis,
 * NUNCA exponha ao browser.
 *
 * Retorna null se a variável SUPABASE_SERVICE_ROLE_KEY não estiver configurada.
 * Nesse caso, a action deve retornar um erro amigável em vez de travar o servidor.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    // Não lanca excecao: retorna null para que a action trate o erro graciosamente
    console.error(
      '[createAdminClient] SUPABASE_SERVICE_ROLE_KEY não configurada. ' +
      'Adicione-a nas variáveis de ambiente da Vercel (Project Settings > Environment Variables).'
    )
    return null
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
