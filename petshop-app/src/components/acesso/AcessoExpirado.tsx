'use client'

import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'

// Tela no lugar do painel quando o período de teste (ou o plano) acabou.
export default function AcessoExpirado({ nomeLoja, ehDono }: { nomeLoja: string; ehDono: boolean }) {
  const [saindo, iniciar] = useTransition()
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)', background: 'var(--gray-950)' }}>
      <div className="card" style={{ maxWidth: 460, padding: 'var(--space-8)', textAlign: 'center' }}>
        <h1 className="page-title" style={{ marginBottom: 'var(--space-3)' }}>Período de teste encerrado</h1>
        <p className="text-muted" style={{ marginBottom: 'var(--space-5)' }}>
          {ehDono
            ? `O acesso de ${nomeLoja} ao SAIP foi pausado. Seus dados estão guardados — fale com a gente para reativar.`
            : `O acesso de ${nomeLoja} ao SAIP está pausado. Fale com o responsável pela loja.`}
        </p>
        <button type="button" className="btn btn-secondary" disabled={saindo} onClick={() => iniciar(() => logoutAction())}>
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </div>
    </div>
  )
}
