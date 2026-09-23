'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completarCadastroClienteGoogleAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { IconIdCard, IconPhone } from '@/components/icons'

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
function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export default function CompletarCadastroClientePage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [userName, setUserName] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Carregar dados do usuário Google
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setUserName(
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        'Usuário'
      )
      setUserEmail(user.email ?? '')
      setLoading(false)
    })
  }, [router])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await completarCadastroClienteGoogleAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  if (loading) {
    return (
      <div className="login-shell" style={{ gridTemplateColumns: '1fr' }}>
        <div className="login-form-pane">
          <div className="login-form-inner" style={{ maxWidth: 460, textAlign: 'center' }}>
            <p style={{ color: 'var(--lg-ink-mute)' }}>Carregando...</p>
          </div>
        </div>
      </div>
    )
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

          <h1 className="login-heading">Completar cadastro</h1>
          <p className="login-sub">
            Quase lá! Precisamos de mais alguns dados para finalizar sua conta.
          </p>

          {/* Info do Google */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            marginBottom: 'var(--space-5)',
          }}>
            <span style={{ width: 20, height: 20, flexShrink: 0, color: '#16a34a' }}><IconCheck /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#15803d' }}>
                Conectado com o Google
              </span>
              <span style={{ fontSize: '0.75rem', color: '#166534' }}>
                {userName} • {userEmail}
              </span>
            </span>
          </div>

          {error && (
            <div className="login-alert" role="alert">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="login-field" style={{ flex: 1 }}>
                <label htmlFor="cpf" className="login-label">CPF</label>
                <div className="login-input-wrap">
                  <IconIdCard />
                  <input
                    id="cpf"
                    name="cpf"
                    type="text"
                    className="login-input"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    required
                  />
                </div>
              </div>
              <div className="login-field" style={{ flex: 1 }}>
                <label htmlFor="telefone" className="login-label">Telefone</label>
                <div className="login-input-wrap">
                  <IconPhone />
                  <input
                    id="telefone"
                    name="telefone"
                    type="tel"
                    className="login-input"
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="login-field" style={{ marginTop: 'var(--space-2)' }}>
              <label className="login-checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" name="aceita_termos" required />
                <span style={{ fontSize: '13px', color: 'var(--lg-text-secondary)' }}>
                  Eu li e aceito os <a href="/termos" target="_blank" style={{ color: 'var(--lg-primary)', textDecoration: 'none' }}>Termos de Uso</a> e a <a href="/privacidade" target="_blank" style={{ color: 'var(--lg-primary)', textDecoration: 'none' }}>Política de Privacidade</a>
                </span>
              </label>
            </div>

            <button type="submit" className="login-submit" disabled={isPending}>
              {isPending ? 'Finalizando...' : 'Finalizar cadastro'}
            </button>
          </form>

          <p className="login-signup-hint" style={{ fontSize: '0.6875rem', marginTop: 'var(--space-4)' }}>
            Seus dados são protegidos e não serão compartilhados.
          </p>
        </div>
      </div>
    </div>
  )
}
