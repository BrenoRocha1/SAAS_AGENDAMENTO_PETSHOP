'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { solicitarRedefinicaoSenhaAction } from '@/lib/actions'
import MarcaSaip from '@/components/MarcaSaip'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  )
}

export default function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      await solicitarRedefinicaoSenhaAction(new FormData(form))
      setEnviado(true)
    })
  }

  return (
    <div className="login-shell" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-form-pane">
        <div className="login-form-inner">
          <MarcaSaip />

          <h1 className="login-heading">Redefinir senha</h1>
          <p className="login-sub">
            Informe o e-mail da sua conta e enviaremos um link para você definir uma nova senha.
          </p>

          {enviado ? (
            <div className="login-alert" style={{ background: 'var(--lg-accent-soft)', color: 'var(--lg-accent-700)' }} role="status">
              <IconCheck />
              <span>
                Se esse e-mail estiver cadastrado, você vai receber um link para redefinir a senha em instantes.
              </span>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className="login-field">
                <label htmlFor="email" className="login-label">E-mail</label>
                <div className="login-input-wrap">
                  <IconMail />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    className="login-input"
                    placeholder="voce@petshop.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <button type="submit" className="login-submit" disabled={isPending}>
                {isPending ? 'Enviando...' : 'Enviar link de redefinição'}
              </button>
            </form>
          )}

          <p className="login-signup-hint">
            <Link href="/login">Voltar para o login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
