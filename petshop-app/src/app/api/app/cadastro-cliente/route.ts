import { NextResponse } from 'next/server'
import { criarContaCliente } from '@/lib/cadastro-cliente'

// Cadastro de cliente feito pelo APP MOBILE — o mesmo da página /cadastro
// (lib/cadastro-cliente): valida, limita tentativas por IP e cria login +
// cadastro. O app faz o login em seguida, no próprio aparelho.
//
// É uma rota pública (quem se cadastra ainda não tem conta), então o CORS
// NÃO é aberto como nas rotas que exigem token: só o app rodando no
// navegador deste computador (desenvolvimento) pode chamar de outro
// endereço. O app instalado não usa CORS.
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

  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const conta = await criarContaCliente({
    nome: texto(corpo.nome).trim(),
    cpf: texto(corpo.cpf).replace(/\D/g, ''),
    email: texto(corpo.email).trim().toLowerCase(),
    telefone: texto(corpo.telefone).replace(/\D/g, ''),
    senha: texto(corpo.senha),
    confirmaSenha: texto(corpo.confirmaSenha),
    aceita_termos: corpo.aceita_termos === true ? true : undefined,
  })
  if ('error' in conta) return NextResponse.json({ error: conta.error }, { headers })
  return NextResponse.json({ success: true }, { headers })
}
