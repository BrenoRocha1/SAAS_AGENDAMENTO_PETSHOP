import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Ver src/lib/supabase/client.ts — mesmo motivo, mesmo valor. Precisa
// estar nos dois (browser e servidor) porque cada um pode ser quem
// grava o cookie primeiro (login é sempre via Server Action, mas o
// refresh automático de token pode acontecer em qualquer um dos dois).
const COOKIE_OPTIONS = { maxAge: 60 * 60 * 24 * 100 }

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // Sem httpOnly de propósito: o client do navegador
                // (lib/supabase/client.ts) lê a sessão deste cookie — com
                // httpOnly, toda consulta/Realtime do navegador ia como
                // anônima (gráfico do Dashboard zerado, painel do TaxiDog
                // sem atualização ao vivo, som de novo agendamento mudo).
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
              })
            )
          } catch {
            // Server Component — cookies são read-only, ignorar
          }
        },
      },
    }
  )
}
