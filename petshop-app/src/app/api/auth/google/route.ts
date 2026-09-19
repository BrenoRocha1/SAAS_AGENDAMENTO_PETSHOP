import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// GET /api/auth/google
// Inicia o fluxo OAuth com Google de forma server-side.
//
// Por que não usar Server Action nem createBrowserClient para isso?
// - Server Action com redirect() não propaga Set-Cookie corretamente
//   para URLs externas (o cookie do PKCE verifier some antes do Google
//   redirecionar de volta).
// - createBrowserClient armazena o PKCE verifier em document.cookie do
//   browser, mas o /auth/callback (Route Handler) lê via cookieStore —
//   contextos diferentes que não se comunicam de forma confiável.
//
// Aqui: o servidor gera o PKCE verifier, monta o Set-Cookie na resposta
// HTTP 302 real (não client-side navigation), e redireciona para o Google.
// Quando o Google manda o usuário de volta para /auth/callback, o browser
// já tem o cookie com o verifier e o exchangeCodeForSession funciona.
export async function GET(request: Request) {
  const cookieStore = await cookies()
  const { origin } = new URL(request.url)
  const role = new URL(request.url).searchParams.get('role') // 'lojista' | null

  // Resposta que vai acumular os Set-Cookie do PKCE verifier
  const tempResponse = new NextResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Grava no tempResponse para incluir nos headers da resposta final
            tempResponse.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: true,
            })
          })
        },
      },
    }
  )

  const callbackUrl = role
    ? `${origin}/auth/callback?role=${role}`
    : `${origin}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    const loginUrl = new URL(`${origin}/login`)
    loginUrl.searchParams.set('error', 'oauth')
    loginUrl.searchParams.set(
      'error_detail',
      encodeURIComponent(`Falha ao iniciar OAuth: ${error?.message ?? 'URL não retornada'}`)
    )
    return NextResponse.redirect(loginUrl.toString())
  }

  // Redirect real HTTP 302 com os Set-Cookie do PKCE verifier nos headers
  const redirectResponse = NextResponse.redirect(data.url)
  tempResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite as 'lax' | 'strict' | 'none' | undefined,
      secure: cookie.secure,
      maxAge: cookie.maxAge,
      path: cookie.path,
    })
  })

  return redirectResponse
}
