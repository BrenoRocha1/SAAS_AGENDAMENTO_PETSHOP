import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { obterContextoLojista } from '@/lib/lojista-context'
import CentralWhatsApp from '@/components/lojista/whatsapp/CentralWhatsApp'
import { IconAlert, IconChat, IconChevronRight } from '@/components/icons'
import { mensagemDoWhatsApp, type Conversa, type ResumoWhatsApp } from '@/lib/whatsapp/tipos'
import type { Metadata } from 'next'
import '@/components/lojista/whatsapp/whatsapp.css'

export const metadata: Metadata = { title: 'WhatsApp' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Comunicação → WhatsApp: a central de atendimento da loja (migration 088).
// As conversas e os contadores vêm das funções do banco, que só devolvem o
// que é da loja de quem está logado e conferem a permissão de atender.
export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  // No celular o nome da tela já está na barra de cima.
  const cabecalho = (
    <div className="wa-pagina-topo so-desktop">
      <div className="wa-trilha">
        <IconChat /> Comunicação <IconChevronRight /> WhatsApp
      </div>
      <h1 className="page-title">WhatsApp</h1>
    </div>
  )

  if (!contexto.podeAtenderWhatsapp) {
    return (
      <>
        {cabecalho}
        <div className="empty-state card">
          <IconAlert style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para atender o WhatsApp</div>
          <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
        </div>
      </>
    )
  }

  const { c: idAberta } = await searchParams
  const [resumoRes, conversasRes, abertaRes] = await Promise.all([
    supabase.rpc('fn_whatsapp_resumo'),
    supabase.rpc('fn_whatsapp_conversas', { p_filtro: 'abertas', p_limite: 30 }),
    idAberta && UUID_RE.test(idAberta)
      ? supabase.rpc('fn_whatsapp_conversas', { p_id: idAberta, p_limite: 1 })
      : Promise.resolve({ data: null }),
  ])

  const erro = resumoRes.error ?? conversasRes.error
  if (erro || !resumoRes.data) {
    return (
      <>
        {cabecalho}
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            {mensagemDoWhatsApp(erro, 'Não foi possível abrir o WhatsApp agora. Tente novamente.')}
            {process.env.NODE_ENV !== 'production' && erro && ` [DEV: ${erro.message}]`}
          </span>
        </div>
      </>
    )
  }

  return (
    <>
      {cabecalho}
      <CentralWhatsApp
        lojistaId={contexto.idLojista}
        idUsuario={user!.id}
        gestor={contexto.role === 'lojista' || contexto.acessoTotal}
        podeAgendar={contexto.podeGerenciarAgenda}
        podeVerClientes={contexto.podeGerenciarClientesPets}
        resumoInicial={resumoRes.data as ResumoWhatsApp}
        conversasIniciais={(conversasRes.data ?? []) as Conversa[]}
        conversaInicial={((abertaRes.data ?? []) as Conversa[])[0] ?? null}
      />
    </>
  )
}
