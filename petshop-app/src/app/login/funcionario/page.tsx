'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { loginFuncionarioCodigoAction } from '@/lib/actions'

function IconStore({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="m2 7 4.5-4.5h11L22 7l-1 12H3Z" />
      <path d="M16 19v-4.5c0-1.4-1.1-2.5-2.5-2.5h-3c-1.4 0-2.5 1.1-2.5 2.5V19" />
    </svg>
  )
}

export default function LoginFuncionarioPage() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleLogin(formData: FormData) {
    setError(null)
    const codigo = (formData.get('codigo') as string)?.replace(/\D/g, '') ?? ''

    if (codigo.length !== 6) {
      setError('Digite os 6 números do código.')
      return
    }

    startTransition(async () => {
      const res = await loginFuncionarioCodigoAction(codigo)
      if (res?.error) {
        setError(res.error)
      } else {
        router.push('/lojista/agendamentos')
        router.refresh()
      }
    })
  }

  return (
    <div className="auth-layout animate-fade-in">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div style={{ 
            width: 48, height: 48, borderRadius: 'var(--radius-md)', 
            background: 'var(--primary-soft-bg)', color: 'var(--primary-500)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            margin: '0 auto var(--space-4)' 
          }}>
            <IconStore style={{ width: 24, height: 24 }} />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 'var(--space-1)' }}>Login da Equipe</h1>
          <p className="text-muted">Acesso rápido para funcionários</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        <form action={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label htmlFor="codigo" className="form-label">Código de Acesso</label>
            <input type="text" id="codigo" name="codigo" className="form-input" required placeholder="000000" maxLength={6} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" autoFocus style={{ letterSpacing: '0.25em', fontSize: '1.25rem', textAlign: 'center' }} />
            <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
              Peça ao responsável da loja o seu código de 6 dígitos. Ele vale 1 minuto e já identifica você — não precisa de e-mail nem senha.
            </p>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-2)' }} disabled={isPending}>
            {isPending ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--gray-800)' }}>
          <Link href="/login" className="text-sm text-primary hover-underline">
            Voltar para o login normal
          </Link>
        </div>
      </div>
    </div>
  )
}
