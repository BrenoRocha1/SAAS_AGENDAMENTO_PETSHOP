'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cadastroClienteAction } from '@/lib/actions'

export default function CadastroClientePage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await cadastroClienteAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="auth-layout">
      <div
        className="auth-card animate-slide-up"
        style={{ maxWidth: 520 }}
      >
        <div className="auth-logo">
          <div className="auth-logo-icon">🐕</div>
          <h1 className="auth-title">Criar conta</h1>
          <p className="auth-subtitle">Cadastre-se para agendar serviços para seu pet</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="nome" className="form-label form-label-required">Nome completo</label>
            <input id="nome" name="nome" type="text" className="form-input" placeholder="João Silva" required />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="cpf" className="form-label form-label-required">CPF</label>
              <input id="cpf" name="cpf" type="text" className="form-input" placeholder="000.000.000-00" maxLength={14} required />
            </div>
            <div className="form-group">
              <label htmlFor="telefone" className="form-label form-label-required">Telefone</label>
              <input id="telefone" name="telefone" type="tel" className="form-input" placeholder="(11) 99999-9999" required />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label form-label-required">E-mail</label>
            <input id="email" name="email" type="email" className="form-input" placeholder="seu@email.com" autoComplete="email" required />
          </div>

          <div className="form-group">
            <label htmlFor="senha" className="form-label form-label-required">Senha</label>
            <input id="senha" name="senha" type="password" className="form-input" placeholder="Mín. 8 caracteres, 1 maiúscula, 1 número, 1 especial" required />
            <span className="form-hint">Mín. 8 caracteres com letras, números e caractere especial</span>
          </div>

          <div className="form-group">
            <label htmlFor="confirmaSenha" className="form-label form-label-required">Confirmar senha</label>
            <input id="confirmaSenha" name="confirmaSenha" type="password" className="form-input" placeholder="••••••••" required />
          </div>

          <button
            type="submit"
            id="btn-cadastro-cliente"
            className={`btn btn-primary btn-full btn-lg ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending}
          >
            {isPending ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 'var(--space-5)', fontSize: '0.9rem', color: 'var(--gray-500)' }}>
          Já tem conta?{' '}
          <Link href="/login" style={{ color: 'var(--primary-400)', fontWeight: 600 }}>
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
