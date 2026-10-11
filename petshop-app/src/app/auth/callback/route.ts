import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { COOKIE_VOLTA, voltaValida } from '@/lib/volta-agendamento'
import { COOKIE_LOGIN_INTERNO } from '@/lib/impersonar'
import { ROTA_INTERNA } from '@/lib/rota-interna'

// Ponto único de retorno pros e-mails do Supabase Auth que usam o fluxo
// PKCE (login com Google, convite de cliente/funcionário, "esqueci minha
// senha"): todos chegam aqui com ?code=..., que precisa ser trocado por
// uma sessão (grava os cookies) antes de seguir pra tela final — sem essa
// troca, a pessoa chega em /redefinir-senha sem sessão nenhuma.
//
// GOOGLE OAUTH: quando o usuário vem de /cadastro ou /cadastro/lojista
// clicando em "Continuar com Google", o redirectTo inclui ?role=cliente
// ou ?role=lojista. Após trocar o code por sessão, verificamos se o
// usuário já tem registro nas tabelas do banco:
// - Já tem → redireciona pro dashboard correto
// - Não tem → redireciona pra /completar-cadastro/{role}

// ── Helper: origin correto pra Vercel (respeita x-forwarded-host) ─────────
// Sempre o endereço desta requisição, nunca o NEXT_PUBLIC_SITE_URL: os
// cookies da sessão são gravados aqui, então redirecionar pra outro
// endereço (ex.: produção, rodando em localhost) perde a sessão.
function resolveOrigin(request: Request, fallbackOrigin: string): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    return `${proto}://${forwardedHost}`
  }
  return fallbackOrigin
}

export async function GET(request: Request) {
  const { searchParams, origin: rawOrigin } = new URL(request.url)
  const origin = resolveOrigin(request, rawOrigin)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const role = searchParams.get('role') // 'cliente' | 'lojista' | null

  if (!code) {
    const url = new URL(`${origin}/login`)
    url.searchParams.set('error', 'no_code')
    return NextResponse.redirect(url.toString())
  }

  // ── Criar supabase client DIRETAMENTE aqui (não usar o shared) ──────────
  // O Route Handler precisa que os cookies sejam gravados diretamente no
  // cookieStore para que NextResponse.redirect() os carregue na resposta.
  // O shared createClient() do server.ts faz um try/catch que engole
  // erros de escrita — aqui queremos garantia total de que gravou.
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              // sameSite: 'lax' é CRÍTICO — o browser chega aqui via redirect
              // do Google (cross-site navigation). 'strict' faria o browser
              // não enviar esses cookies na próxima requisição imediata.
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            })
          )
        },
      },
    }
  )

  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

  if (sessionError) {
    console.error('[auth/callback] exchangeCodeForSession error:', sessionError.message)
    const url = new URL(`${origin}/login`)
    url.searchParams.set('error', 'session_exchange')
    url.searchParams.set('error_detail', encodeURIComponent(sessionError.message))
    return NextResponse.redirect(url.toString())
  }

  // Se tem 'next' explícito (ex.: redefinição de senha), só redireciona
  if (next) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Fluxo Google OAuth: detectar se o usuário já tem perfil no banco
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user) {
    const detail = userError?.message ?? 'Sessão criada mas usuário não encontrado.'
    console.error('[auth/callback] getUser error:', detail)
    const url = new URL(`${origin}/login`)
    url.searchParams.set('error', 'no_user')
    url.searchParams.set('error_detail', encodeURIComponent(detail))
    return NextResponse.redirect(url.toString())
  }

  // Veio do login do painel interno: só segue pra lá quem está em
  // admin_usuario (RLS deixa cada um ler a própria linha). Qualquer outra
  // conta é desconectada e vê o mesmo 404 de uma página que não existe.
  if (cookieStore.get(COOKIE_LOGIN_INTERNO)) {
    cookieStore.delete(COOKIE_LOGIN_INTERNO)
    const { data: admin } = await supabase
      .from('admin_usuario')
      .select('id')
      .eq('id', user.id)
      .eq('ativo', true)
      .maybeSingle()
    if (!admin) await supabase.auth.signOut({ scope: 'local' })
    return NextResponse.redirect(`${origin}${ROTA_INTERNA}`)
  }

  // As consultas abaixo usam a sessão recém-criada do próprio usuário:
  // o RLS já deixa cada um ler o próprio perfil ("select proprio" em
  // lojista, funcionario e cliente), então o login não depende da
  // service role key. Se a consulta falhar, não dá pra concluir que o
  // usuário é novo — mandar pro "completar cadastro" faria um lojista já
  // cadastrado se cadastrar de novo como cliente.
  const erroPerfil = (detalhe: string) => {
    console.error('[auth/callback] erro ao buscar perfil:', detalhe)
    const url = new URL(`${origin}/login`)
    url.searchParams.set('error', 'perfil')
    return NextResponse.redirect(url.toString())
  }

  // Verificar lojista
  const { data: lojista, error: erroLojista } = await supabase
    .from('lojista')
    .select('id_lojista')
    .eq('id_lojista', user.id)
    .maybeSingle()
  if (erroLojista) return erroPerfil(erroLojista.message)
  if (lojista) {
    return NextResponse.redirect(`${origin}/lojista/dashboard`)
  }

  // Verificar funcionário
  const { data: funcionario, error: erroFuncionario } = await supabase
    .from('funcionario')
    .select('id_funcionario')
    .eq('id_funcionario', user.id)
    .eq('ativo', true)
    .maybeSingle()
  if (erroFuncionario) return erroPerfil(erroFuncionario.message)
  if (funcionario) {
    return NextResponse.redirect(`${origin}/lojista/agendamentos`)
  }

  // Verificar cliente
  const { data: cliente, error: erroCliente } = await supabase
    .from('cliente')
    .select('id_cliente')
    .eq('id_cliente', user.id)
    .maybeSingle()
  if (erroCliente) return erroPerfil(erroCliente.message)
  if (cliente) {
    // Entrou a partir do link público de agendamento: volta para ele
    // (lib/volta-agendamento).
    const volta = voltaValida(cookieStore.get(COOKIE_VOLTA)?.value)
    if (volta) {
      cookieStore.delete(COOKIE_VOLTA)
      return NextResponse.redirect(`${origin}${volta}`)
    }
    return NextResponse.redirect(`${origin}/cliente/dashboard`)
  }

  // Usuário novo que veio do link de agendamento: volta direto para ele — a
  // própria página pede CPF e telefone ali mesmo, sem perder o que já foi
  // escolhido (antes ia para uma tela de cadastro à parte).
  if (role !== 'lojista') {
    const volta = voltaValida(cookieStore.get(COOKIE_VOLTA)?.value)
    if (volta) {
      cookieStore.delete(COOKIE_VOLTA)
      return NextResponse.redirect(`${origin}${volta}`)
    }
  }

  // Usuário novo (sem perfil em nenhuma tabela) → completar cadastro
  if (role === 'lojista') {
    return NextResponse.redirect(`${origin}/completar-cadastro/lojista`)
  }

  // Default: completar cadastro como cliente
  return NextResponse.redirect(`${origin}/completar-cadastro/cliente`)
}
