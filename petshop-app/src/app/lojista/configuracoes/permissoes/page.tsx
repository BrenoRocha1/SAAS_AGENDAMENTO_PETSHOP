import type { Metadata } from 'next'
import Link from 'next/link'
import { IconCalendar, IconChevronLeft, IconScissors, IconShield, IconStore, IconUserBadge } from '@/components/icons'

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
          <IconStore style={{ width: 15, height: 15 }} /> Lojista (você)
        </h3>
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Acesso completo a todas as telas administrativas: Dashboard, Agendamentos, Kanban, Relatórios,
          Serviços, Horários, Clientes, Pets, Funcionários, Perfil da Loja e estas Configurações. Não existe
          hoje uma segunda conta de &quot;administrador&quot; separada — quem cadastra a loja é quem tem esse
          acesso total.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 700, marginBottom: 'var(--space-6)' }}>
        <h3 className="relatorio-secao-titulo">
          <IconUserBadge style={{ width: 15, height: 15 }} /> Funcionário
        </h3>
        <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
          Cada funcionário cadastrado em <strong>Equipe</strong> tem duas permissões próprias, configuráveis
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
        <p className="text-sm text-muted" style={{ marginTop: 'var(--space-4)' }}>
          Um funcionário nunca acessa as telas exclusivas do lojista (Relatórios de Vendas, Configurações,
          Perfil da Loja) — essa restrição já é validada no backend, não é só uma tela escondida.
        </p>
        <Link href="/lojista/funcionarios" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-4)' }}>
          <IconUserBadge style={{ width: 14, height: 14 }} /> Ver equipe
        </Link>
      </div>

      <div className="card" style={{ maxWidth: 700, borderStyle: 'dashed' }}>
        <h3 className="relatorio-secao-titulo">
          <IconShield style={{ width: 15, height: 15 }} /> Sobre roles como &quot;Admin&quot;, &quot;Atendente/Caixa&quot;
        </h3>
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          O sistema hoje tem só os dois papéis acima (Lojista e Funcionário), mais o Cliente (que só acessa a
          área dele). Não existe um papel &quot;Atendente/Caixa&quot; separado, nem um sistema de permissões
          granulares por tela — as duas permissões de funcionário listadas em cima são tudo que já existe
          hoje. Se no futuro fizer sentido ter papéis mais específicos, o caminho natural é ampliar essas
          mesmas duas flags de <code>funcionario</code> em vez de criar um sistema de permissões paralelo.
        </p>
      </div>
    </>
  )
}
