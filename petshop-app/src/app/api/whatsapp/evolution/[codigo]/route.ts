import { createAdminClient } from '@/lib/supabase/admin'
import { processarWebhookEvolution } from '@/lib/whatsapp/servico'

// Webhook da conexão por QR code (Evolution API). Cada loja tem o seu
// endereço, que termina num código secreto gerado pelo SAIP — é o SAIP que
// o cadastra no servidor da Evolution ao preparar a conexão; a loja nem vê.
//
//   WhatsApp do celular → servidor da Evolution → POST aqui → conversa e
//   mensagem no banco → a tela recebe pelo tempo real.
export async function POST(request: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params
  const admin = createAdminClient()
  if (!admin) return new Response('Serviço indisponível', { status: 503 })

  let corpo: unknown
  try {
    corpo = await request.json()
  } catch {
    return new Response('Pedido inválido', { status: 400 })
  }

  const status = await processarWebhookEvolution(admin, codigo, corpo)
  return new Response(status === 200 ? 'ok' : 'erro', { status })
}
