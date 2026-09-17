'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'
import { IconGrid, IconLogout, IconStore } from '@/components/icons'

const navItems = [
  { href: '/admin', icon: IconGrid, label: 'Empresas' },
]

interface Props {
  nome: string
  email: string
}

export default function AdminSidebar({ nome, email }: Props) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(() => logoutAction())
  }

  const initial = (nome || email)[0]?.toUpperCase() ?? 'A'

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <IconStore style={{ width: 18, height: 18 }} />
        </div>
        <span className="sidebar-logo-text">
          SA<span>IP</span> Admin
        </span>
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Plataforma</span>
        {navItems.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
            >
              <span className="sidebar-link-icon">
                <Icon style={{ width: 18, height: 18 }} />
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" title={email}>
          <div className="sidebar-avatar">{initial}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{nome || email}</div>
            <div className="sidebar-user-role">Admin da plataforma</div>
          </div>
        </div>
        <button
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
