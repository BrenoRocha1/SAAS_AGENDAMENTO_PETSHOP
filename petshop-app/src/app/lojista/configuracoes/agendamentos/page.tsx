import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { alternarKanbanAction, alternarAgendamentoOnlineAction } from '@/lib/actions'
import ConfigToggleCard from '@/components/lojista/ConfigToggleCard'
import { IconAlert, IconCalendar, IconChevronLeft, IconKanban } from '@/components/icons'

export const metadata: Metadata = { title: 'Configurações de Agendamentos — Lojista' }

export default async function ConfiguracoesAgendamentosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: lojista, error } = await supabase
    .from('lojista')
    .select('kanban_ativo, aceita_agendamento_online')
    .eq('id_lojista', user!.id)
    .maybeSingle()

  return (
    <>
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">Configurações de Agendamentos</h1>
        <p className="page-subtitle">Controle o Kanban e o agendamento feito pelos próprios clientes.</p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Não foi possível carregar as configurações agora. Tente novamente.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 700 }}>
        <div id="kanban">
          <ConfigToggleCard
            icone={<IconKanban style={{ width: 17, height: 17 }} />}
            titulo="Gestor de Agendamentos (Kanban)"
            descricao="Acompanhe os atendimentos em tempo real, separados por Pendente, Em Andamento e Finalizado."
            descricaoQuandoDesativado="Desativado, o item some do menu lateral — os agendamentos continuam existindo normalmente, só a tela de Kanban fica indisponível."
            ativoInicial={lojista?.kanban_ativo ?? true}
            action={alternarKanbanAction}
          />
        </div>

        <div id="online">
          <ConfigToggleCard
            icone={<IconCalendar style={{ width: 17, height: 17 }} />}
            titulo="Agendamento Online"
            descricao="Permite que clientes já cadastrados agendem sozinhos, pelo app, sem precisar ligar ou ir até a loja."
            descricaoQuandoDesativado="Desativado, sua loja some do seletor de lojas no app do cliente e novas tentativas de agendamento público são recusadas — agendamentos feitos por você (walk-in, telefone) continuam funcionando normalmente."
            ativoInicial={lojista?.aceita_agendamento_online ?? true}
            action={alternarAgendamentoOnlineAction}
          />
        </div>

        <div className="card" style={{ borderStyle: 'dashed' }}>
          <div className="font-semibold" style={{ color: 'var(--gray-100)', marginBottom: 'var(--space-2)' }}>
            Sobre exigir CPF do cliente
          </div>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            O CPF já é obrigatório no cadastro de <strong>todo</strong> cliente da plataforma, para qualquer
            loja — não é uma configuração por petshop, porque a conta do cliente é única e pode ser usada
            para agendar em mais de uma loja. Por isso não existe (e não foi criado) um interruptor de
            &quot;exigir CPF&quot; aqui.
          </p>
        </div>
      </div>
    </>
  )
}
