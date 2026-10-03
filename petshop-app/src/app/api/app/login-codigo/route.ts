import { NextResponse } from 'next/server'
import { trocarCodigoPorToken } from '@/lib/codigo-acesso'

// Login pelo código de acesso rápido feito pelo APP MOBILE — o mesmo de
// /login/funcionario (lib/codigo-acesso): confere o código, limita
// tentativas por IP e devolve o token de entrada. O app troca o token pela
// sessão no próprio aparelho (supabase.auth.verifyOtp).
//
// É uma rota pública (quem entra ainda não tem sessão), então o CORS NÃO é
// aberto como nas rotas que exigem token: só o app rodando no navegador
// deste computador (desenvolvimento) pode chamar de outro endereço. O app
// instalado não usa CORS.
const ORIGEM_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function cors(request: Request): Record<string, string> {
  const origem = request.headers.get('origin') ?? ''
  if (!ORIGEM_LOCAL.test(origem)) return {}
  return {
    'Access-Control-Allow-Origin': origem,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  }
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) })
}

export async function POST(request: Request) {
  const headers = cors(request)
  let corpo: Record<string, unknown>
  try {
    corpo = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers })
  }

  try {
    const troca = await trocarCodigoPorToken(typeof corpo.codigo === 'string' ? corpo.codigo : '')
    if ('error' in troca) return NextResponse.json({ error: troca.error }, { headers })
    return NextResponse.json({ token_hash: troca.tokenHash }, { headers })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { headers })
  }
}
