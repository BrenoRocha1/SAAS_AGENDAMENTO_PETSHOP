import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { obterContextoLojista } from '@/lib/lojista-context'
import { IconChevronLeft } from '@/components/icons'
import NotificacaoSomForm from '@/components/lojista/NotificacaoSomForm'

export const metadata: Metadata = { title: 'Notificações — Lojista' }

export default async function ConfiguracoesNotificacoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  // Mesmo cuidado do layout com kanban_ativo: se a migration 036 ainda
  // não rodou, a coluna não existe e este select falha — cai num padrão
  // razoável (ativado, sino) em vez de derrubar a página.
  const { data: lojista, error } = await supabase
    .from('lojista')
    .select('som_novo_agendamento_ativo, som_novo_agendamento_tipo')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()

  const migrationPendente = !!error
  const somAtivo = lojista?.som_novo_agendamento_ativo ?? true
  const somTipo = lojista?.som_novo_agendamento_tipo ?? 'sino'

  return (
    <>
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">Notificações</h1>
        <p className="page-subtitle">Avisos automáticos do sistema.</p>
      </div>

      <NotificacaoSomForm
        somAtivoInicial={somAtivo}
        somTipoInicial={somTipo}
        podeEditar={contexto.acessoTotal}
        migrationPendente={migrationPendente}
      />
    </>
  )
}
