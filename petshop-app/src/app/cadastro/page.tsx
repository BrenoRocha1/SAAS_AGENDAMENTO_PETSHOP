'use client'

import { Suspense, useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cadastroClienteAction, getGoogleOAuthUrlAction } from '@/lib/actions'
import { IconIdCard, IconPhone, IconUser } from '@/components/icons'
import Ilustracao from '@/components/Ilustracao'
import MarcaSaip from '@/components/MarcaSaip'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
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

// Quem veio do link público de agendamento (?redirectTo=/agendamento/...)
// volta para ele depois de criar a conta. Só estes dois pedaços leem a URL,
// para o resto da página continuar pronto de antemão.
function CampoVolta() {
  const volta = useSearchParams().get('redirectTo')
  return volta ? <input type="hidden" name="redirectTo" value={volta} /> : null
}

function LinkEntrar() {
  const volta = useSearchParams().get('redirectTo')
  return <Link href={volta ? `/login?redirectTo=${encodeURIComponent(volta)}` : '/login'}>Entrar</Link>
}

export default function CadastroClientePage() {
  const [error, setError] = useState<string | null>(null)
  const [oauthPending, setOauthPending] = useState(false)

  async function handleGoogle() {
    setError(null)
    setOauthPending(true)
    
    const volta = new URLSearchParams(window.location.search).get('redirectTo')
    const result = await getGoogleOAuthUrlAction('cliente', volta)
    
    if (result.error || !result.url) {
      setOauthPending(false)
      setError(result.error || 'Não foi possível conectar com o Google. Tente novamente.')
      return
    }
    
    window.location.href = result.url
  }


  return (
    <div className="login-shell" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-form-pane">
        <div className="login-form-inner" style={{ maxWidth: 460 }}>
          <MarcaSaip />

          <Ilustracao nome="boas-vindas" altura={120} />

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
          </div>



          <p className="login-signup-hint">
            Já tem conta? <Suspense fallback={<Link href="/login">Entrar</Link>}><LinkEntrar /></Suspense>
          </p>
        </div>
      </div>
    </div>
  )
}
