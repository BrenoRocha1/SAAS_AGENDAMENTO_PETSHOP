'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarSenhaAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'

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

const DESTINO_POR_ROLE: Record<string, string> = {
  cliente: '/cliente/dashboard',
  lojista: '/lojista/dashboard',
  // Funcionário usa o mesmo painel do lojista — a própria página de
  // agendamentos redireciona pra Serviços se ele só tiver essa permissão.
  funcionario: '/lojista/agendamentos',
}

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await atualizarSenhaAction(new FormData(form))
      if (result?.error) {
        setError(result.error)
        return
      }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const destino = DESTINO_POR_ROLE[user?.user_metadata?.role as string] ?? '/login'
      router.push(destino)
    })
  }

  return (
    <div className="login-shell" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-form-pane">
        <div className="login-form-inner">
          <div className="login-brand">
            <span className="login-brand-mark">
              <IconPaw />
            </span>
            <span className="login-brand-name">SAIP</span>
          </div>

          <h1 className="login-heading">Defina sua senha</h1>
          <p className="login-sub">Escolha uma senha para acessar sua conta.</p>

          {error && (
            <div className="login-alert" role="alert">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="senha" className="login-label">Nova senha</label>
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
              {isPending ? 'Salvando...' : 'Salvar senha e entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
