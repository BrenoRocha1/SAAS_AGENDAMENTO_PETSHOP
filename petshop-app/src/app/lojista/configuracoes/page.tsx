import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  IconBell,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconShield,
  IconStar,
  IconStore,
} from '@/components/icons'

export const metadata: Metadata = { title: 'Configurações — Lojista' }

interface ItemConfig {
  href: string
  icon: React.ReactNode
  titulo: string
  descricao: string
  // Array porque "Configurações de Agendamentos" mostra dois status
  // (Kanban e Agendamento Online) num item só, já que os dois campos
  // vivem na mesma página de destino.
  status?: { texto: string; ativo: boolean }[]
}

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  // Só pra mostrar o status (Ativado/Desativado) ao lado dos itens que
  // são toggles — a página em si (Configurações → Agendamentos) é quem
  // efetivamente lê e grava essas colunas.
  const { data: lojista } = await supabase
    .from('lojista')
    .select('kanban_ativo, aceita_agendamento_online')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()

  const kanbanAtivo = lojista?.kanban_ativo ?? true
  const agendamentoOnlineAtivo = lojista?.aceita_agendamento_online ?? true

  // Tolerante: sem a migration 042, a tabela não existe e o selo some.
  const { data: taxidog, error: taxidogError } = await supabase
    .from('taxidog_config')
    .select('ativo')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()
  const taxidogAtivo = !!taxidog?.ativo

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
        {
          href: '/lojista/configuracoes/avaliacoes',
          icon: <IconStar style={{ width: 18, height: 18 }} />,
          titulo: 'Avaliações',
          descricao: 'Veja o que seus clientes estão dizendo sobre sua loja.',
        },
      ],
    },
    {
      titulo: 'Agendamentos',
      itens: [
        {
          href: '/lojista/configuracoes/agendamentos',
          icon: <IconCalendar style={{ width: 18, height: 18 }} />,
          titulo: 'Configurações de Agendamentos',
          descricao: 'Kanban de atendimento, agendamento feito pelos próprios clientes e TaxiDog (busca e entrega dos pets)',
          status: [
            { texto: `Kanban ${kanbanAtivo ? 'Ativado' : 'Desativado'}`, ativo: kanbanAtivo },
            { texto: `Online ${agendamentoOnlineAtivo ? 'Ativado' : 'Desativado'}`, ativo: agendamentoOnlineAtivo },
            ...(taxidogError ? [] : [{ texto: `TaxiDog ${taxidogAtivo ? 'Ativado' : 'Desativado'}`, ativo: taxidogAtivo }]),
          ],
        },
      ],
    },
    {
      titulo: 'Operação',
      itens: [
        {
          href: '/lojista/equipe',
          icon: <IconShield style={{ width: 18, height: 18 }} />,
          titulo: 'Usuários e Permissões',
          descricao: 'Cadastre membros da equipe e administradores, e gerencie as permissões de cada um',
        },
      ],
    },
    {
      titulo: 'Sistema',
      itens: [
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
                    <div className="flex gap-2" style={{ flexShrink: 0 }}>
                      {item.status.map(s => (
                        <span key={s.texto} className={`badge ${s.ativo ? 'badge-ativo' : 'badge-inativo'}`}>
                          {s.texto}
                        </span>
                      ))}
                    </div>
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
