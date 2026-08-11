'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { loginAction } from '@/lib/actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await loginAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="auth-layout">
      <div className="auth-card animate-slide-up">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🐾</div>
          <h1 className="auth-title">Bem-vindo de volta</h1>
          <p className="auth-subtitle">Entre na sua conta para continuar</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email" className="form-label form-label-required">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              placeholder="seu@email.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="senha" className="form-label form-label-required">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              className="form-input"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            id="btn-login"
            className={`btn btn-primary btn-full btn-lg ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending}
          >
            {isPending ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="auth-divider" style={{ marginTop: 'var(--space-6)' }}>
          <div className="auth-divider-line" />
          <span className="auth-divider-text">Novo por aqui?</span>
          <div className="auth-divider-line" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Link href="/cadastro" className="btn btn-secondary btn-full">
            🐕 Criar conta como Cliente
          </Link>
          <Link href="/cadastro/lojista" className="btn btn-ghost btn-full">
            🏪 Cadastrar meu Petshop
          </Link>
        </div>
      </div>
    </div>
  )
}
