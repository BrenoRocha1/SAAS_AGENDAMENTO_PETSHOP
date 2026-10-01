'use client'

import { useState, useEffect } from 'react'
import { gerarCodigoLoginFuncionarioAction } from '@/lib/actions'
import { IconAlert } from '@/components/icons'

export default function GeradorCodigoLogin() {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [tempoRestante, setTempoRestante] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const gerarCodigo = async () => {
    setLoading(true)
    setError(null)
    const res = await gerarCodigoLoginFuncionarioAction()
    if (res.error) {
      setError(res.error)
    } else if (res.codigo && res.expiracao) {
      setCodigo(res.codigo)
      const diff = Math.max(0, Math.floor((new Date(res.expiracao).getTime() - Date.now()) / 1000))
      setTempoRestante(diff)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (tempoRestante > 0) {
      const timer = setInterval(() => {
        setTempoRestante(t => {
          if (t <= 1) {
            gerarCodigo()
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [tempoRestante])

  return (
    <div className="card" style={{ marginBottom: 'var(--space-6)', background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <IconAlert style={{ width: 18, height: 18, color: 'var(--primary-500)' }} />
        Cdigo Rápido de Login
      </h3>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
        Use este cdigo para permitir que seus funcionrios entrem rapidamente pelo terminal da loja.
      </p>
      
      {error && <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {codigo ? (
          <>
            <div style={{ fontSize: '2rem', letterSpacing: '0.25em', fontWeight: 800, color: 'var(--primary-500)' }}>
              {codigo}
            </div>
            <div className="text-sm text-muted">
              Atualiza em <strong style={{ color: tempoRestante <= 10 ? 'var(--danger-500)' : 'inherit' }}>{tempoRestante}s</strong>
            </div>
          </>
        ) : (
          <button className="btn btn-primary" onClick={gerarCodigo} disabled={loading}>
            {loading ? 'Gerando...' : 'Gerar Cdigo de Acesso'}
          </button>
        )}
      </div>
    </div>
  )
}
