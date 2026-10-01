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
    const email = formData.get('email') as string
    const codigo = formData.get('codigo') as string

    if (!email || !codigo) {
      setError('Preencha todos os campos.')
      return
    }

    startTransition(async () => {
      const res = await loginFuncionarioCodigoAction(email, codigo)
      if (res?.error) {
        setError(res.error)
      } else {
        router.push('/funcionario/dashboard')
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
          <p className="text-muted">Acesso rpido para funcionrios</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        <form action={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label htmlFor="email" className="form-label">E-mail</label>
            <input type="email" id="email" name="email" className="form-input" required placeholder="seu@email.com" />
          </div>
          
          <div className="form-group">
            <label htmlFor="codigo" className="form-label">Cdigo de Acesso</label>
            <input type="text" id="codigo" name="codigo" className="form-input" required placeholder="000000" maxLength={6} style={{ letterSpacing: '0.25em', fontSize: '1.25rem', textAlign: 'center' }} />
            <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
              Peca o cdigo de 6 dgitos para o administrador da loja.
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
