'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { logoutAction } from '@/lib/actions'
import {
  IconPaw,
  IconGrid,
  IconCalendar,
  IconKanban,
  IconChartBar,
  IconScissors,
  IconClock,
  IconUsers,
  IconUserBadge,
  IconStore,
  IconLogout,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons'

const navItemsBase = [
  { href: '/lojista/dashboard',     icon: IconGrid,      label: 'Dashboard' },
  { href: '/lojista/agendamentos',  icon: IconCalendar,  label: 'Agendamentos' },
  { href: '/lojista/kanban',        icon: IconKanban,    label: 'Kanban', condicional: true },
  { href: '/lojista/relatorios',    icon: IconChartBar,  label: 'Relatórios de Vendas' },
  { href: '/lojista/servicos',      icon: IconScissors,  label: 'Serviços' },
  { href: '/lojista/horarios',      icon: IconClock,     label: 'Horários' },
  { href: '/lojista/clientes',      icon: IconUsers,     label: 'Clientes' },
  { href: '/lojista/funcionarios',  icon: IconUserBadge, label: 'Funcionários' },
  { href: '/lojista/perfil',        icon: IconStore,     label: 'Perfil da Loja' },
]

const CHAVE_COLAPSADA = 'petagenda:lojista-sidebar-colapsada'

interface Props {
  nomeLoja: string
  userEmail: string
  kanbanAtivo: boolean
}

export default function LojistaSidebar({ nomeLoja, userEmail, kanbanAtivo }: Props) {
  const navItems = navItemsBase.filter(item => !item.condicional || kanbanAtivo)
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [colapsada, setColapsada] = useState(false)

  // Lembrar a preferência entre sessões (só neste navegador — não precisa
  // de servidor pra isso, é só conveniência visual). Só dá pra ler
  // localStorage depois de montar no cliente — ler durante a renderização
  // daria hydration mismatch (o server sempre renderiza "expandida").
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura de localStorage é só possível pós-montagem; não é "espelhar prop", é sincronizar com um sistema externo
      setColapsada(localStorage.getItem(CHAVE_COLAPSADA) === '1')
    } catch {
      // localStorage indisponível (aba privada etc.) — segue expandida
    }
  }, [])

  // A sidebar é position:fixed e .app-main tem margin-left casado com
  // --sidebar-width; ajustando essa variável no root, os dois seguem
  // juntos sem precisar levantar estado pra fora deste componente.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', colapsada ? '76px' : '260px')
    return () => { document.documentElement.style.removeProperty('--sidebar-width') }
  }, [colapsada])

  function alternarColapso() {
    setColapsada(prev => {
      const novo = !prev
      try { localStorage.setItem(CHAVE_COLAPSADA, novo ? '1' : '0') } catch { /* ignora */ }
      return novo
    })
  }

  function handleLogout() {
    startTransition(() => logoutAction())
  }

  const initial = nomeLoja[0]?.toUpperCase() ?? 'P'

  return (
    <aside className={`app-sidebar ${colapsada ? 'is-collapsed' : ''}`}>
      {/* Logo — recolhida, some e fica só o botão de expandir, pra nunca sobrepor nada */}
      <div className="sidebar-logo">
        {!colapsada && (
          <>
            <div className="sidebar-logo-icon">
              <IconPaw style={{ width: 18, height: 18 }} />
            </div>
            <span className="sidebar-logo-text">
              Pet<span>Agenda</span>
            </span>
          </>
        )}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={alternarColapso}
          aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
          title={colapsada ? 'Expandir menu' : 'Recolher menu'}
        >
          {colapsada ? <IconChevronRight style={{ width: 12, height: 12 }} /> : <IconChevronLeft style={{ width: 12, height: 12 }} />}
        </button>
      </div>

      {/* Navegação */}
      <nav className="sidebar-nav">
        {!colapsada && <span className="sidebar-section-label">Gestão</span>}
        {navItems.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname.startsWith(item.href) ? 'active' : ''}`}
              title={colapsada ? item.label : undefined}
            >
              <span className="sidebar-link-icon">
                <Icon style={{ width: 18, height: 18 }} />
              </span>
              {!colapsada && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Loja + Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user" title={userEmail}>
          <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, var(--accent-500), var(--accent-600))' }}>
            {initial}
          </div>
          {!colapsada && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{nomeLoja}</div>
              <div className="sidebar-user-role">Lojista</div>
            </div>
          )}
        </div>
        <button
          id="btn-logout-lojista"
          onClick={handleLogout}
          disabled={isPending}
          className="btn btn-ghost btn-sm btn-full"
          style={{ marginTop: 'var(--space-2)', justifyContent: colapsada ? 'center' : 'flex-start' }}
          title={colapsada ? 'Sair' : undefined}
        >
          <IconLogout style={{ width: 15, height: 15 }} />
          {!colapsada && (isPending ? 'Saindo...' : 'Sair')}
        </button>
      </div>
    </aside>
  )
}
