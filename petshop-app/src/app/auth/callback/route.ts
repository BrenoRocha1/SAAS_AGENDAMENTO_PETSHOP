import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Ponto único de retorno pros e-mails do Supabase Auth que usam o fluxo
// PKCE (login com Google, convite de cliente/funcionário, "esqueci minha
// senha"): todos chegam aqui com ?code=..., que precisa ser trocado por
// uma sessão (grava os cookies) antes de seguir pra tela final — sem essa
// troca, a pessoa chega em /redefinir-senha sem sessão nenhuma.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/login'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=callback`)
}
