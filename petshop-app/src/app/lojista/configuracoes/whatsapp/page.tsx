import { headers } from 'next/headers'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterUsuario } from '@/lib/supabase/usuario'
import { obterContextoLojista } from '@/lib/lojista-context'
import ConexaoWhatsAppForm, { type IntegracaoCompleta } from '@/components/lojista/whatsapp/ConexaoWhatsAppForm'
import { IconAlert, IconChevronLeft } from '@/components/icons'
import type { Metadata } from 'next'
import '@/components/lojista/whatsapp/whatsapp.css'

export const metadata: Metadata = { title: 'WhatsApp — Configurações' }

// Endereço público do site: é ele que a Meta chama. Em produção vem de
// NEXT_PUBLIC_SITE_URL; sem ela, do endereço em que a página foi aberta.
async function enderecoDoSite(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocolo}://${host}`
}

// Configurações → WhatsApp: conectar o número da loja à WhatsApp Business
// Platform (Cloud API oficial da Meta). Só o dono e o administrador chegam
// aqui (o middleware barra o resto de /lojista/configuracoes).
export default async function ConfiguracoesWhatsAppPage() {
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto || !(contexto.role === 'lojista' || contexto.acessoTotal)) return null

  const { data: integracao, error } = await supabase
    .from('whatsapp_integracao')
    .select('phone_number_id, waba_id, numero_exibicao, nome_verificado, status, ultimo_erro, webhook_em, conectado_em')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()

  // O código de verificação do webhook fica na tabela que só o servidor lê.
  // Ele precisa aparecer aqui para a loja colar na Meta; o token de acesso
  // e o segredo do app nunca voltam para a tela.
  let codigoDeVerificacao: string | null = null
  if (integracao && integracao.status !== 'desconectado') {
    const admin = createAdminClient()
    const { data: credencial } = admin
      ? await admin.from('whatsapp_credencial').select('verify_token').eq('id_lojista', contexto.idLojista).maybeSingle()
      : { data: null }
    codigoDeVerificacao = credencial?.verify_token ?? null
  }

  return (
    <>
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm so-desktop" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">WhatsApp</h1>
        <p className="page-subtitle">Conecte o número da loja para atender os clientes pelo SAIP.</p>
      </div>

      {error ? (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Execute a migration 088_whatsapp.sql para usar o WhatsApp.
            {process.env.NODE_ENV !== 'production' && ` [DEV: ${error.message}]`}
          </span>
        </div>
      ) : (
        <ConexaoWhatsAppForm
          integracao={(integracao as IntegracaoCompleta | null) ?? null}
          enderecoWebhook={`${await enderecoDoSite()}/api/whatsapp/webhook`}
          codigoDeVerificacao={codigoDeVerificacao}
        />
      )}
    </>
  )
}
