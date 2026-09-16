import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  IconBell,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconKanban,
  IconShield,
  IconStore,
  IconUserBadge,
} from '@/components/icons'

export const metadata: Metadata = { title: 'Configurações — Lojista' }

interface ItemConfig {
  href: string
  icon: React.ReactNode
  titulo: string
  descricao: string
  status?: { texto: string; ativo: boolean }
}

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Só pra mostrar o status (Ativado/Desativado) ao lado dos itens que
  // são toggles — a página em si (Configurações → Agendamentos) é quem
  // efetivamente lê e grava essas colunas.
  const { data: lojista } = await supabase
    .from('lojista')
    .select('kanban_ativo, aceita_agendamento_online')
    .eq('id_lojista', user!.id)
    .maybeSingle()

  const kanbanAtivo = lojista?.kanban_ativo ?? true
  const agendamentoOnlineAtivo = lojista?.aceita_agendamento_online ?? true

  const grupos: { titulo: string; itens: ItemConfig[] }[] = [
    {
      titulo: 'Loja',
      itens: [
        {
          href: '/lojista/perfil',
          icon: <IconStore style={{ width: 18, height: 18 }} />,
          titulo: 'Dados da loja',
          descricao: 'Nome, telefone, endereço e demais informações públicas da loja',
        },
        {
          href: '/lojista/horarios',
          icon: <IconClock style={{ width: 18, height: 18 }} />,
          titulo: 'Horários de funcionamento',
          descricao: 'Configure os dias e horários de atendimento',
        },
      ],
    },
    {
      titulo: 'Agendamentos',
      itens: [
        {
          href: '/lojista/configuracoes/agendamentos#kanban',
          icon: <IconKanban style={{ width: 18, height: 18 }} />,
          titulo: 'Gestor de Agendamentos',
          descricao: 'Ativa ou desativa o Kanban (Pendentes / Em Andamento / Finalizado)',
          status: { texto: kanbanAtivo ? 'Ativado' : 'Desativado', ativo: kanbanAtivo },
        },
        {
          href: '/lojista/configuracoes/agendamentos#online',
          icon: <IconCalendar style={{ width: 18, height: 18 }} />,
          titulo: 'Agendamento Online',
          descricao: 'Controla se clientes podem agendar sozinhos pelo app',
          status: { texto: agendamentoOnlineAtivo ? 'Ativado' : 'Desativado', ativo: agendamentoOnlineAtivo },
        },
      ],
    },
    {
      titulo: 'Operação',
      itens: [
        {
          href: '/lojista/funcionarios',
          icon: <IconUserBadge style={{ width: 18, height: 18 }} />,
          titulo: 'Equipe',
          descricao: 'Cadastre e gerencie os profissionais da loja',
        },
      ],
    },
    {
      titulo: 'Sistema',
      itens: [
        {
          href: '/lojista/configuracoes/permissoes',
          icon: <IconShield style={{ width: 18, height: 18 }} />,
          titulo: 'Usuários e permissões',
          descricao: 'Entenda quem acessa o quê e o que pode ser configurado por funcionário',
        },
        {
          href: '/lojista/configuracoes/notificacoes',
          icon: <IconBell style={{ width: 18, height: 18 }} />,
          titulo: 'Notificações',
          descricao: 'Configure as notificações do sistema',
        },
      ],
    },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
        <p className="page-subtitle">Configure o funcionamento da sua loja e do sistema.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 720 }}>
        {grupos.map(grupo => (
          <div key={grupo.titulo} className="card">
            <div className="config-grupo-titulo">{grupo.titulo}</div>
            <div>
              {grupo.itens.map(item => (
                <Link key={item.href} href={item.href} className="config-item">
                  <span className="dash-icon-btn" style={{ cursor: 'default' }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="config-item-titulo">{item.titulo}</div>
                    <div className="config-item-desc">{item.descricao}</div>
                  </div>
                  {item.status && (
                    <span className={`badge ${item.status.ativo ? 'badge-ativo' : 'badge-inativo'}`} style={{ flexShrink: 0 }}>
                      {item.status.texto}
                    </span>
                  )}
                  <IconChevronRight style={{ width: 16, height: 16, color: 'var(--gray-600)', flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
