import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  // CRÍTICO: usar getUser() não getSession() — previne ataques de replay de token
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isRotaProtegida = pathname.startsWith('/cliente') || pathname.startsWith('/lojista')
  const isRotaAuth = pathname === '/login' || pathname.startsWith('/cadastro')

  // ── 1. Sem sessão tentando acessar rota protegida → login ──────────────────
  if (!user && isRotaProtegida) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // ── 2. Usuário logado → resolver role ──────────────────────────────────────
  if (user) {
    // Tenta user_metadata primeiro (JWT, sem custo de rede)
    let role = user.user_metadata?.role as string | undefined

    // Fallback 1: perfil_usuario
    if (role !== 'lojista' && role !== 'cliente') {
      const { data: perfil } = await supabase
        .from('perfil_usuario')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      role = perfil?.role as string | undefined
    }

    // Fallback 2: tabela lojista (detecta lojistas sem perfil_usuario)
    if (role !== 'lojista' && role !== 'cliente') {
      const { data: lojista } = await supabase
        .from('lojista')
        .select('id_lojista')
        .eq('id_lojista', user.id)
        .maybeSingle()
      role = lojista ? 'lojista' : 'cliente'
    }

    // ── 3. Logado acessando página de auth → dashboard correto ───────────────
    if (isRotaAuth) {
      const dest = role === 'lojista' ? '/lojista/dashboard' : '/cliente/dashboard'
      const url = request.nextUrl.clone()
      url.pathname = dest
      return NextResponse.redirect(url)
    }

    // ── 4. Cross-role: cliente tentando acessar área de lojista ──────────────
    //      (e vice-versa) — só redireciona para a área CORRETA do usuário
    if (pathname.startsWith('/lojista') && role !== 'lojista') {
      // Não é lojista → manda para área do cliente
      const url = request.nextUrl.clone()
      url.pathname = '/cliente/dashboard'
      return NextResponse.redirect(url)
    }

    if (pathname.startsWith('/cliente') && role !== 'cliente') {
      // Não é cliente → manda para área do lojista
      const url = request.nextUrl.clone()
      url.pathname = '/lojista/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
