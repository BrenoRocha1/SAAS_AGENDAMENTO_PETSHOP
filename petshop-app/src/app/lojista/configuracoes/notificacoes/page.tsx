import type { Metadata } from 'next'
import Link from 'next/link'
import { IconAlert, IconBell, IconChevronLeft } from '@/components/icons'

export const metadata: Metadata = { title: 'Notificações — Lojista' }

export default function ConfiguracoesNotificacoesPage() {
  return (
    <>
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">Notificações</h1>
        <p className="page-subtitle">Avisos automáticos do sistema.</p>
      </div>

      <div className="card" style={{ maxWidth: 700 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
          <span className="dash-icon-btn" style={{ cursor: 'default' }}>
            <IconBell style={{ width: 17, height: 17 }} />
          </span>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>
            Ainda não existe um sistema de notificações
          </div>
        </div>

        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            O SAIP hoje não envia e-mail, SMS, push ou qualquer outro aviso automático — nem para o
            lojista, nem para o cliente — quando um agendamento é criado, alterado, cancelado ou concluído.
            Por isso esta tela não tem nenhum interruptor: eles não controlariam nada de verdade, e criar
            toggles que não ligam a nada real seria simular uma funcionalidade que não existe.
          </span>
        </div>

        <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
          O que já existe, e faz parte do fluxo normal do sistema (sem ser uma &quot;notificação&quot; separada):
        </p>
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--gray-400)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <li>A <strong>Dashboard</strong> e o <strong>Kanban</strong> mostram os agendamentos pendentes/em andamento em tempo real, sempre que a página é aberta ou atualizada.</li>
          <li>A tela de <strong>Agendamentos do cliente</strong> mostra o status atualizado assim que ele entra.</li>
        </ul>

        <p className="text-sm text-muted" style={{ marginTop: 'var(--space-4)' }}>
          Se isso for importante no futuro, o caminho natural seria integrar um serviço de e-mail/SMS (ex.:
          Resend, Twilio) disparado a partir das mesmas Server Actions que já existem para criar/atualizar
          agendamento — e só então esta tela ganharia toggles reais, ligados a essa infraestrutura.
        </p>
      </div>
    </>
  )
}
