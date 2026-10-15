'use client'

import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'

// Tela no lugar do painel quando a conta foi desativada pela equipe do SAIP
// (painel interno → Desativar). Os dados continuam guardados.
export default function ContaDesativada({ titulo, texto }: { titulo: string; texto: string }) {
  const [saindo, iniciar] = useTransition()
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)', background: 'var(--gray-950)' }}>
      <div className="card" style={{ maxWidth: 460, padding: 'var(--space-8)', textAlign: 'center' }}>
        <h1 className="page-title" style={{ marginBottom: 'var(--space-3)' }}>{titulo}</h1>
        <p className="text-muted" style={{ marginBottom: 'var(--space-5)' }}>{texto}</p>
        <button type="button" className="btn btn-secondary" disabled={saindo} onClick={() => iniciar(() => logoutAction())}>
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </div>
    </div>
  )
}
