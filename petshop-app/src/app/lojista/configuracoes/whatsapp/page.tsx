import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterUsuario } from '@/lib/supabase/usuario'
import { obterContextoLojista } from '@/lib/lojista-context'
import ConexaoWhatsAppForm, { type IntegracaoCompleta } from '@/components/lojista/whatsapp/ConexaoWhatsAppForm'
import { IconAlert, IconChevronLeft } from '@/components/icons'
import { enderecoDoSite } from '@/lib/whatsapp/endereco'
import { configEvolution } from '@/lib/whatsapp/evolution'
import type { Metadata } from 'next'
import '@/components/lojista/whatsapp/whatsapp.css'

export const metadata: Metadata = { title: 'WhatsApp — Configurações' }

// Configurações → WhatsApp: conectar o número da loja, por QR code (como o
// WhatsApp Web) ou pela API oficial da Meta. Só o dono e o administrador
// chegam aqui (o middleware barra o resto de /lojista/configuracoes).
export default async function ConfiguracoesWhatsAppPage() {
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto || !(contexto.role === 'lojista' || contexto.acessoTotal)) return null

  // select('*'): `provedor` só existe depois da migration 089 — sem ela, a
  // tela segue com a API oficial.
  const { data: integracao, error } = await supabase
    .from('whatsapp_integracao')
    .select('*')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()

  // O código de verificação do webhook fica na tabela que só o servidor lê.
  // Ele precisa aparecer aqui para a loja colar na Meta; o token de acesso
  // e o segredo do app nunca voltam para a tela.
  let codigoDeVerificacao: string | null = null
  if (integracao && integracao.status !== 'desconectado' && integracao.provedor !== 'evolution') {
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
          servidorQr={!!configEvolution()}
          enderecoWebhook={`${await enderecoDoSite()}/api/whatsapp/webhook`}
          codigoDeVerificacao={codigoDeVerificacao}
        />
      )}
    </>
  )
}
