'use client'

import { useState } from 'react'
import { getGoogleOAuthUrlInternoAction } from '@/lib/actions'
import MarcaSaip from '@/components/MarcaSaip'

export default function EntrarInterno() {
  const [pendente, setPendente] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar() {
    setErro(null)
    setPendente(true)
    const r = await getGoogleOAuthUrlInternoAction()
    if (r.error || !r.url) {
      setPendente(false)
      setErro(r.error ?? 'Não foi possível conectar com o Google.')
      return
    }
    window.location.href = r.url
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)', background: 'var(--gray-950)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 380, padding: 'var(--space-8)', textAlign: 'center' }}>
        <MarcaSaip />
        <h1 className="page-title" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>Acesso interno</h1>
        <p className="text-muted" style={{ marginBottom: 'var(--space-6)' }}>Entre com a conta Google da equipe.</p>
        {erro && <div className="alert alert-error" role="alert"><span>{erro}</span></div>}
        <button type="button" className="btn btn-primary btn-full" onClick={entrar} disabled={pendente}>
          {pendente ? 'Conectando…' : 'Continuar com o Google'}
        </button>
      </div>
    </div>
  )
}
