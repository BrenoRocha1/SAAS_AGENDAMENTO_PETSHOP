import { createAdminClient } from '@/lib/supabase/admin'
import { codigoDeVerificacaoValido, processarWebhook } from '@/lib/whatsapp/servico'

// Webhook da WhatsApp Business Platform (Cloud API da Meta). É este o
// endereço que a loja cadastra no app dela na Meta:
//
//   WhatsApp → Meta → POST aqui → conversa e mensagem no banco → a tela
//   recebe pelo tempo real.
//
// Não há login: quem chama é a Meta. O que garante a origem é a assinatura
// do pacote (X-Hub-Signature-256), conferida com o segredo do app da loja.

// GET: a Meta confere o endereço ao cadastrar o webhook, devolvendo o
// código de verificação que a loja colou lá.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const desafio = params.get('hub.challenge')
  if (params.get('hub.mode') !== 'subscribe' || !desafio) {
    return new Response('Pedido inválido', { status: 400 })
  }
  const admin = createAdminClient()
  if (!admin) return new Response('Serviço indisponível', { status: 503 })
  if (!(await codigoDeVerificacaoValido(admin, params.get('hub.verify_token')))) {
    return new Response('Código de verificação inválido', { status: 403 })
  }
  return new Response(desafio, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

// POST: mensagens recebidas e status das enviadas.
export async function POST(request: Request) {
  const admin = createAdminClient()
  if (!admin) return new Response('Serviço indisponível', { status: 503 })
  // O corpo cru, sem reformatar: a assinatura é calculada sobre ele.
  const corpoCru = await request.text()
  const status = await processarWebhook(admin, corpoCru, request.headers.get('x-hub-signature-256'))
  return new Response(status === 200 ? 'ok' : 'erro', { status })
}
