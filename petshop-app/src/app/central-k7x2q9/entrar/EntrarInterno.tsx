'use client'

import { useState, useTransition } from 'react'
import { getGoogleOAuthUrlInternoAction } from '@/lib/actions'
import { entrarComCodigoAction } from '@/lib/actions-interno'
import MarcaSaip from '@/components/MarcaSaip'

export default function EntrarInterno() {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, iniciar] = useTransition()
  const [googlePendente, setGooglePendente] = useState(false)

  function entrarComCodigo(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    iniciar(async () => {
      const r = await entrarComCodigoAction(codigo)
      if (r?.error) setErro(r.error)
    })
  }

  async function entrarComGoogle() {
    setErro(null)
    setGooglePendente(true)
    const r = await getGoogleOAuthUrlInternoAction()
    if (r.error || !r.url) {
      setGooglePendente(false)
      setErro(r.error ?? 'Não foi possível conectar com o Google.')
      return
    }
    window.location.href = r.url
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)', background: 'var(--gray-950)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 'var(--space-8)', textAlign: 'center' }}>
        <MarcaSaip />
        <h1 className="page-title" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>Acesso interno</h1>
        <p className="text-muted" style={{ marginBottom: 'var(--space-5)' }}>Digite o seu código de acesso.</p>

        <form onSubmit={entrarComCodigo}>
          <input
            className="form-input"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            autoFocus
            required
            style={{ textAlign: 'center', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 'var(--space-3)' }}
          />
          {erro && <div className="alert alert-error" role="alert" style={{ marginBottom: 'var(--space-3)' }}><span>{erro}</span></div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={entrando || !codigo.trim()}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-xs text-muted" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>Ainda sem código? Entre uma vez com o Google e gere o seu em Administradores.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={entrarComGoogle} disabled={googlePendente}>
          {googlePendente ? 'Conectando…' : 'Entrar com o Google'}
        </button>
      </div>
    </div>
  )
}
