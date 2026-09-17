import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Ver src/lib/supabase/client.ts — mesmo motivo, mesmo valor. O middleware
// é quem mais frequentemente reemite o cookie (roda em toda requisição),
// então é o lugar mais importante dos três pra ter isso certo.
const COOKIE_OPTIONS = { maxAge: 60 * 60 * 24 * 100 }

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'strict',
              secure: process.env.NODE_ENV === 'production',
            })
          )
        },
      },
    }
  )

  // CRÍTICO: getUser() valida o JWT no servidor (não apenas local)
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // /agendamento/[id] é público de propósito — qualquer pessoa com o link
  // pode ver a loja e os serviços sem login; só o passo de agendar em si
  // exige conta de cliente (checado na própria página/wizard).
  const isRotaProtegida =
    pathname.startsWith('/cliente') ||
    pathname.startsWith('/lojista') ||
    pathname.startsWith('/admin')

  // Única regra: sem sessão + rota protegida → login
  // Sem nenhuma lógica de role aqui para evitar loops
  if (!user && isRotaProtegida) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
