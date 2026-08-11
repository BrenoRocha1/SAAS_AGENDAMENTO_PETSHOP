'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'

const navItems = [
  { href: '/cliente/dashboard',     icon: '🏠', label: 'Dashboard' },
  { href: '/cliente/agendamentos',  icon: '📅', label: 'Meus Agendamentos' },
  { href: '/cliente/novo-agendamento', icon: '➕', label: 'Novo Agendamento' },
  { href: '/cliente/pets',          icon: '🐕', label: 'Meus Pets' },
  { href: '/cliente/perfil',        icon: '👤', label: 'Meu Perfil' },
]

interface Props {
  userName: string
  userEmail: string
}

export default function ClienteSidebar({ userName, userEmail }: Props) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(() => logoutAction())
  }

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

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
        <span className="sidebar-section-label">Menu</span>
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Usuário + Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{userName}</div>
            <div className="sidebar-user-role">Cliente</div>
          </div>
        </div>
        <button
          id="btn-logout-cliente"
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
