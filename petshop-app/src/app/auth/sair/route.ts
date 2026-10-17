import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Encerra a sessão e volta para o login avisando que o perfil da conta mudou.
// Usada pelos layouts de cliente e de loja quando o token ainda tem o papel
// antigo (a conta foi convertida pelo painel interno com a pessoa logada —
// o token só se atualiza sozinho em até 1 hora). Entrando de novo, o login
// leva para a área certa.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  return NextResponse.redirect(new URL('/login?conta=alterada', request.url))
}
