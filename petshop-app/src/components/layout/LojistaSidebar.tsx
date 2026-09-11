'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'
import {
  IconPaw,
  IconGrid,
  IconCalendar,
  IconScissors,
  IconClock,
  IconUsers,
  IconUserBadge,
  IconStore,
  IconLogout,
} from '@/components/icons'

const navItems = [
  { href: '/lojista/dashboard',     icon: IconGrid,      label: 'Dashboard' },
  { href: '/lojista/agendamentos',  icon: IconCalendar,  label: 'Agendamentos' },
  { href: '/lojista/servicos',      icon: IconScissors,  label: 'Serviços' },
  { href: '/lojista/horarios',      icon: IconClock,     label: 'Horários' },
  { href: '/lojista/clientes',      icon: IconUsers,     label: 'Clientes' },
  { href: '/lojista/funcionarios',  icon: IconUserBadge, label: 'Funcionários' },
  { href: '/lojista/perfil',        icon: IconStore,     label: 'Perfil da Loja' },
]

interface Props {
  nomeLoja: string
  userEmail: string
}

export default function LojistaSidebar({ nomeLoja, userEmail }: Props) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(() => logoutAction())
  }

  const initial = nomeLoja[0]?.toUpperCase() ?? 'P'

  return (
    <aside className="app-sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <IconPaw style={{ width: 18, height: 18 }} />
        </div>
        <span className="sidebar-logo-text">
          Pet<span>Agenda</span>
        </span>
      </div>

      {/* Navegação */}
      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Gestão</span>
        {navItems.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname.startsWith(item.href) ? 'active' : ''}`}
            >
              <span className="sidebar-link-icon">
                <Icon style={{ width: 18, height: 18 }} />
              </span>
              <span>{item.label}</span>
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
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{nomeLoja}</div>
            <div className="sidebar-user-role">Lojista</div>
          </div>
        </div>
        <button
          id="btn-logout-lojista"
          onClick={handleLogout}
          disabled={isPending}
          className="btn btn-ghost btn-sm btn-full"
          style={{ marginTop: 'var(--space-2)', justifyContent: 'flex-start' }}
        >
          <IconLogout style={{ width: 15, height: 15 }} />
          {isPending ? 'Saindo...' : 'Sair'}
        </button>
      </div>
    </aside>
  )
}
