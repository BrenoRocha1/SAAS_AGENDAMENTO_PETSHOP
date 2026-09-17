'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cadastroClienteAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { IconIdCard, IconPhone, IconUser } from '@/components/icons'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconPaw() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="7" cy="9.5" r="1.6" />
      <circle cx="12" cy="7" r="1.7" />
      <circle cx="17" cy="9.5" r="1.6" />
      <path d="M8 15c1-1.8 2.4-2.8 4-2.8s3 1 4 2.8c1 1.8-.4 3.4-2.4 3.4-.9 0-1.1-.4-1.6-.4s-.7.4-1.6.4C8 18.4 7 16.8 8 15Z" />
    </svg>
  )
}
function IconMail() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
function IconEye() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}
function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3 3 21 21" />
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4M6.6 6.6A17 17 0 0 0 2 12s3.5 6.5 10 6.5a9.6 9.6 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}
function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  )
}
function IconGoogle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7C21.8 18.9 23 15.9 23 12.3Z" />
      <path fill="#34A853" d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3C3.6 20.5 7.5 23 12 23Z" />
      <path fill="#FBBC05" d="M5.5 13.6a6.6 6.6 0 0 1 0-4.2v-3H1.7a11 11 0 0 0 0 10.2l3.8-3Z" />
      <path fill="#EA4335" d="M12 4.6c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.1 15.1 0 12 0 7.5 0 3.6 2.5 1.7 6.4l3.8 3C6.4 6.6 9 4.6 12 4.6Z" />
    </svg>
  )
}
function IconApple() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.64-2.2.46-3.06-.4C3.79 16.17 4.36 9.53 8.7 9.28c1.23.06 2.09.72 2.81.76.98-.2 1.92-.77 2.98-.7 1.27.1 2.22.6 2.84 1.53-2.6 1.54-1.98 4.93.37 5.87-.47 1.22-.67 1.76-1.27 2.84l-.38.7ZM12.05 9.18c-.14-2.42 1.82-4.5 4.1-4.68.32 2.71-2.44 4.82-4.1 4.68Z" />
    </svg>
  )
}

export default function CadastroClientePage() {
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [oauthPending, setOauthPending] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await cadastroClienteAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  async function handleGoogle() {
    setError(null)
    setOauthPending(true)
    const supabase = createClient()
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?role=cliente` },
    })
    if (oauthErr) {
      setOauthPending(false)
      setError('Não foi possível conectar com o Google. Tente novamente.')
    }
  }

  async function handleApple() {
    setError(null)
    setOauthPending(true)
    const supabase = createClient()
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback?role=cliente` },
    })
    if (oauthErr) {
      setOauthPending(false)
      setError('Não foi possível conectar com a Apple. Tente novamente.')
    }
  }

  return (
    <div className="login-shell" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-form-pane">
        <div className="login-form-inner" style={{ maxWidth: 460 }}>
          <div className="login-brand">
            <span className="login-brand-mark">
              <IconPaw />
            </span>
            <span className="login-brand-name">PetShop Agenda</span>
          </div>

          <h1 className="login-heading">Criar conta</h1>
          <p className="login-sub">Cadastre-se para agendar serviços para o seu pet.</p>

          {error && (
            <div className="login-alert" role="alert">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          {/* ── Botões OAuth ── */}
          <div className="login-secondary-stack">
            <button
              type="button"
              className="login-btn-outline"
              onClick={handleGoogle}
              disabled={oauthPending}
            >
              <IconGoogle />
              {oauthPending ? 'Conectando...' : 'Cadastrar com o Google'}
            </button>
            <button
              type="button"
              className="login-btn-outline"
              onClick={handleApple}
              disabled={oauthPending}
            >
              <IconApple />
              {oauthPending ? 'Conectando...' : 'Cadastrar com a Apple'}
            </button>
          </div>

          <div className="login-divider">
            <span>ou</span>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="nome" className="login-label">Nome completo</label>
              <div className="login-input-wrap">
                <IconUser />
                <input id="nome" name="nome" type="text" className="login-input" placeholder="João Silva" required />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="login-field" style={{ flex: 1 }}>
                <label htmlFor="cpf" className="login-label">CPF</label>
                <div className="login-input-wrap">
                  <IconIdCard />
                  <input id="cpf" name="cpf" type="text" className="login-input" placeholder="000.000.000-00" maxLength={14} required />
                </div>
              </div>
              <div className="login-field" style={{ flex: 1 }}>
                <label htmlFor="telefone" className="login-label">Telefone</label>
                <div className="login-input-wrap">
                  <IconPhone />
                  <input id="telefone" name="telefone" type="tel" className="login-input" placeholder="(11) 99999-9999" required />
                </div>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="email" className="login-label">E-mail</label>
              <div className="login-input-wrap">
                <IconMail />
                <input id="email" name="email" type="email" className="login-input" placeholder="seu@email.com" autoComplete="email" required />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="senha" className="login-label">Senha</label>
              <div className="login-input-wrap">
                <IconLock />
                <input
                  id="senha"
                  name="senha"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input has-toggle"
                  placeholder="Mín. 8 chars, 1 maiúscula, 1 número, 1 especial"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="confirmaSenha" className="login-label">Confirmar senha</label>
              <div className="login-input-wrap">
                <IconLock />
                <input
                  id="confirmaSenha"
                  name="confirmaSenha"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="login-submit" disabled={isPending}>
              {isPending ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <p className="login-signup-hint">
            Já tem conta? <Link href="/login">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
