import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

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
function redirectError(origin: string, code: string, detail?: string) {
  const url = new URL(`${origin}/login`)
  url.searchParams.set('error', code)
  if (detail) url.searchParams.set('error_detail', encodeURIComponent(detail))
  return NextResponse.redirect(url.toString())
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const role = searchParams.get('role') // 'cliente' | 'lojista' | null

  if (!code) {
    return redirectError(origin, 'no_code', 'Nenhum código de autorização recebido do Google.')
  }

  const supabase = await createClient()
  const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

  if (sessionError) {
    console.error('[auth/callback] exchangeCodeForSession error:', sessionError.message)
    return redirectError(
      origin,
      'session_exchange',
      `Falha ao trocar código por sessão: ${sessionError.message}`
    )
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
    return redirectError(origin, 'no_user', detail)
  }

  // Usar admin client para queries sem depender de RLS
  const adminClient = createAdminClient()
  if (!adminClient) {
    return redirectError(
      origin,
      'no_admin_key',
      'Variável SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.'
    )
  }

  // Verificar lojista
  const { data: lojista } = await adminClient
    .from('lojista')
    .select('id_lojista')
    .eq('id_lojista', user.id)
    .maybeSingle()
  if (lojista) {
    return NextResponse.redirect(`${origin}/lojista/dashboard`)
  }

  // Verificar funcionário
  const { data: funcionario } = await adminClient
    .from('funcionario')
    .select('id_funcionario')
    .eq('id_funcionario', user.id)
    .eq('ativo', true)
    .maybeSingle()
  if (funcionario) {
    return NextResponse.redirect(`${origin}/funcionario/dashboard`)
  }

  // Verificar cliente
  const { data: cliente } = await adminClient
    .from('cliente')
    .select('id_cliente')
    .eq('id_cliente', user.id)
    .maybeSingle()
  if (cliente) {
    return NextResponse.redirect(`${origin}/cliente/dashboard`)
  }

  // Usuário novo (sem perfil em nenhuma tabela) → completar cadastro
  if (role === 'lojista') {
    return NextResponse.redirect(`${origin}/completar-cadastro/lojista`)
  }

  // Default: completar cadastro como cliente
  return NextResponse.redirect(`${origin}/completar-cadastro/cliente`)
}

