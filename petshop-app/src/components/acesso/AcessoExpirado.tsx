'use client'

import { useTransition } from 'react'
import { logoutAction } from '@/lib/actions'

// Tela no lugar do painel quando o período de teste (ou o plano) acabou.
export default function AcessoExpirado({ nomeLoja, ehDono, repetido }: { nomeLoja: string; ehDono: boolean; repetido?: boolean }) {
  const [saindo, iniciar] = useTransition()
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)', background: 'var(--gray-950)' }}>
      <div className="card" style={{ maxWidth: 460, padding: 'var(--space-8)', textAlign: 'center' }}>
        <h1 className="page-title" style={{ marginBottom: 'var(--space-3)' }}>{repetido ? 'Período de teste indisponível' : 'Período de teste encerrado'}</h1>
        <p className="text-muted" style={{ marginBottom: 'var(--space-5)' }}>
          {repetido
            ? 'O telefone desta loja já usou o período de teste em outra conta. Fale com a gente para ativar o seu plano.'
            : ehDono
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
