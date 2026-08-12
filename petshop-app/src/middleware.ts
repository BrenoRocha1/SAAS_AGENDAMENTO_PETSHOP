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

  // CRÍTICO: usar getUser() não getSession() — previne replay attacks
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rotas que precisam de autenticação
  const rotasProtegidas = ['/dashboard', '/cliente', '/lojista']
  const rotasPublicas = ['/login', '/cadastro', '/cadastro/lojista', '/']
  const isRotaProtegida = rotasProtegidas.some(r => pathname.startsWith(r))

  // Sem usuário tentando acessar rota protegida → redireciona para login
  if (!user && isRotaProtegida) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // Usuário autenticado tentando acessar rotas de auth → redireciona para dashboard
  if (user && rotasPublicas.includes(pathname) && pathname !== '/') {
    const role = user.user_metadata?.role
    const url = request.nextUrl.clone()
    url.pathname = role === 'lojista' ? '/lojista/dashboard' : '/cliente/dashboard'
    return NextResponse.redirect(url)
  }

  // Verificar acesso a rotas de lojista por cliente e vice-versa
  if (user) {
    const role = user.user_metadata?.role
    if (pathname.startsWith('/lojista') && role !== 'lojista') {
      const url = request.nextUrl.clone()
      url.pathname = '/cliente/dashboard'
      return NextResponse.redirect(url)
    }
    if (pathname.startsWith('/cliente') && role !== 'cliente') {
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
