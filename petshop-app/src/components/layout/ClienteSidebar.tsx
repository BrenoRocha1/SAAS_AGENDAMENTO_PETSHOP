'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { logoutAction } from '@/lib/actions'
import {
  IconPaw,
  IconGrid,
  IconCalendar,
  IconPlus,
  IconDog,
  IconUser,
  IconLogout,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons'

const navItems = [
  { href: '/cliente/dashboard', icon: IconGrid, label: 'Dashboard' },
  { href: '/cliente/agendamentos', icon: IconCalendar, label: 'Meus Agendamentos' },
  { href: '/cliente/novo-agendamento', icon: IconPlus, label: 'Novo Agendamento' },
  { href: '/cliente/pets', icon: IconDog, label: 'Meus Pets' },
  { href: '/cliente/perfil', icon: IconUser, label: 'Meu Perfil' },
]

const CHAVE_COLAPSADA = 'saip:cliente-sidebar-colapsada'

interface Props {
  userName: string
  userEmail: string
}

export default function ClienteSidebar({ userName, userEmail }: Props) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [colapsada, setColapsada] = useState(false)

  // Mesmo padrão de LojistaSidebar.tsx — lembrar a preferência entre
  // sessões, só neste navegador.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura de localStorage é só possível pós-montagem; não é "espelhar prop", é sincronizar com um sistema externo
      setColapsada(localStorage.getItem(CHAVE_COLAPSADA) === '1')
    } catch {
      // localStorage indisponível (aba privada etc.) — segue expandida
    }
  }, [])

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

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

  return (
    <aside className={`app-sidebar ${colapsada ? 'is-collapsed' : ''}`}>
      <div className="sidebar-logo">
        {!colapsada && (
          <>
            <div className="sidebar-logo-icon">
              <IconPaw style={{ width: 18, height: 18 }} />
            </div>
            <span className="sidebar-logo-text">
              SA<span>IP</span>
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

      <nav className="sidebar-nav">
        {!colapsada && <span className="sidebar-section-label">Menu</span>}
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

      <div className="sidebar-footer">
        <div className="sidebar-user" title={userEmail}>
          <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, var(--primary-400), var(--primary-700))' }}>
            {initials}
          </div>
          {!colapsada && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{userName}</div>
              <div className="sidebar-user-role">Cliente</div>
            </div>
          )}
        </div>
        <button
          id="btn-logout-cliente"
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
