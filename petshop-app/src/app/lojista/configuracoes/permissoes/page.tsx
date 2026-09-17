import type { Metadata } from 'next'
import Link from 'next/link'
import { IconCalendar, IconChevronLeft, IconDog, IconScissors, IconShield, IconStore, IconUserBadge } from '@/components/icons'

export const metadata: Metadata = { title: 'Usuários e Permissões — Lojista' }

export default function ConfiguracoesPermissoesPage() {
  return (
    <>
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">Usuários e Permissões</h1>
        <p className="page-subtitle">Quem acessa o quê no seu PetSaaS.</p>
      </div>

      <div className="card" style={{ maxWidth: 700, marginBottom: 'var(--space-6)' }}>
        <h3 className="relatorio-secao-titulo">
          <IconStore style={{ width: 15, height: 15 }} /> Responsável pela conta (você)
        </h3>
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Acesso completo a todas as telas administrativas: Dashboard, Agendamentos, Kanban, Relatórios,
          Serviços, Horários, Clientes, Pets, Equipe, Perfil da Loja e estas Configurações. Só quem cadastrou
          a loja tem esse papel, e só ele pode conceder &quot;Acesso total&quot; (administrador) pra outra
          pessoa em <strong>Equipe</strong> — ninguém mais, nem outro administrador, pode fazer isso.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 700, marginBottom: 'var(--space-6)' }}>
        <h3 className="relatorio-secao-titulo">
          <IconUserBadge style={{ width: 15, height: 15 }} /> Membros da equipe
        </h3>
        <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
          Cada membro cadastrado em <strong>Equipe</strong> tem permissões próprias, configuráveis
          individualmente na hora do cadastro ou da edição:
        </p>
        <div className="dash-detail-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <IconCalendar style={{ width: 14, height: 14 }} /> Gerenciar Agenda
          </span>
          <span style={{ fontWeight: 400, color: 'var(--gray-400)', textAlign: 'left' }}>
            Visualizar e alterar status de agendamentos
          </span>
        </div>
        <div className="dash-detail-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <IconScissors style={{ width: 14, height: 14 }} /> Gerenciar Serviços
          </span>
          <span style={{ fontWeight: 400, color: 'var(--gray-400)', textAlign: 'left' }}>
            Cadastrar e editar serviços do petshop
          </span>
        </div>
        <div className="dash-detail-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <IconDog style={{ width: 14, height: 14 }} /> Gerenciar Pets e Clientes
          </span>
          <span style={{ fontWeight: 400, color: 'var(--gray-400)', textAlign: 'left' }}>
            Visualizar os pets e clientes cadastrados no sistema (sem editar)
          </span>
        </div>
        <div className="dash-detail-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <IconShield style={{ width: 14, height: 14 }} /> Acesso Total (Administrador)
          </span>
          <span style={{ fontWeight: 400, color: 'var(--gray-400)', textAlign: 'left' }}>
            Mesmo acesso do responsável pela conta em tudo, menos conceder acesso total pra outra pessoa
          </span>
        </div>
        <p className="text-sm text-muted" style={{ marginTop: 'var(--space-4)' }}>
          Um membro sem &quot;Acesso total&quot; nunca acessa as telas exclusivas (Relatórios de Vendas,
          Configurações, Perfil da Loja, Equipe) — essa restrição já é validada no backend, não é só uma tela
          escondida.
        </p>
        <Link href="/lojista/equipe" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-4)' }}>
          <IconUserBadge style={{ width: 14, height: 14 }} /> Ver equipe
        </Link>
      </div>
    </>
  )
}
