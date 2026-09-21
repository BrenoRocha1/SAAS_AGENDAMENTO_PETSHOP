'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'

interface Props {
  nomeFunc: string
  nomeLoja: string
  userEmail: string
  podeAgenda: boolean
  podeServicos: boolean
}

export default function FuncionarioSidebar({
  nomeFunc,
  nomeLoja,
  podeAgenda,
  podeServicos,
}: Props) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(() => logoutAction())
  }

  // Menu dinâmico baseado nas permissões
  const navItems = [
    { href: '/funcionario/dashboard', icon: '🏠', label: 'Dashboard', always: true },
    { href: '/funcionario/agendamentos', icon: '📅', label: 'Agendamentos', always: false, requires: podeAgenda },
    { href: '/funcionario/servicos', icon: '✂️', label: 'Serviços', always: false, requires: podeServicos },
  ].filter(item => item.always || item.requires)

  const initials = nomeFunc
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

      {/* Info do petshop */}
      <div style={{
        padding: '0 var(--space-4)',
        marginBottom: 'var(--space-2)',
      }}>
        <div style={{
          background: 'var(--gray-800)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3)',
          fontSize: '0.8rem',
          color: 'var(--gray-400)',
          textAlign: 'center',
        }}>
          🏪 {nomeLoja}
        </div>
      </div>

      {/* Navegação */}
      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Menu</span>
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

      {/* Usuário + Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, var(--success-500), #059669)' }}>
            {initials}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{nomeFunc}</div>
            <div className="sidebar-user-role">Funcionário</div>
          </div>
        </div>
        <button
          id="btn-logout-funcionario"
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
