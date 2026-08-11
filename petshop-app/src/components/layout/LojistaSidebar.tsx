'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'

const navItems = [
  { href: '/lojista/dashboard',     icon: '🏠', label: 'Dashboard' },
  { href: '/lojista/agendamentos',  icon: '📅', label: 'Agendamentos' },
  { href: '/lojista/servicos',      icon: '✂️',  label: 'Serviços' },
  { href: '/lojista/horarios',      icon: '⏰', label: 'Horários' },
  { href: '/lojista/clientes',      icon: '👥', label: 'Clientes' },
  { href: '/lojista/perfil',        icon: '🏪', label: 'Perfil da Loja' },
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
        <div className="sidebar-logo-icon">🐾</div>
        <span className="sidebar-logo-text">
          Pet<span>Agenda</span>
        </span>
      </div>

      {/* Navegação */}
      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Gestão</span>
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${pathname.startsWith(item.href) ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Loja + Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
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
          {isPending ? '...' : '🚪 Sair'}
        </button>
      </div>
    </aside>
  )
}
