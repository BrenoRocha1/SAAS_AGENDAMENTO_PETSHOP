'use client'

import { Suspense, useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { loginAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'

/* ------------------------------------------------------------------ *
 * Ícones — line icons em SVG inline (sem biblioteca externa).
 * ------------------------------------------------------------------ */
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
  // Logo de marca do Google (colorido). Não é emoji.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7C21.8 18.9 23 15.9 23 12.3Z" />
      <path fill="#34A853" d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3C3.6 20.5 7.5 23 12 23Z" />
      <path fill="#FBBC05" d="M5.5 13.6a6.6 6.6 0 0 1 0-4.2v-3H1.7a11 11 0 0 0 0 10.2l3.8-3Z" />
      <path fill="#EA4335" d="M12 4.6c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.1 15.1 0 12 0 7.5 0 3.6 2.5 1.7 6.4l3.8 3C6.4 6.6 9 4.6 12 4.6Z" />
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S14 16 14.5 19M16 6.2a3 3 0 0 1 0 5.6M18 14.6c2 .7 3.4 2.1 3.8 4.4" />
    </svg>
  )
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M4 4v16h16" />
      <path d="M8 15l3-4 3 2 4-6" />
    </svg>
  )
}
function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3Z" />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * Conteúdo do painel de apoio.
 * ⚠️ PLACEHOLDER — features, depoimento e números são exemplos.
 *    Trocar por conteúdo real do produto antes de ir para produção.
 * ------------------------------------------------------------------ */
const FEATURES = [
  {
    icon: <IconCalendar />,
    title: 'Agenda online',
    desc: 'Clientes marcam banho e tosa a qualquer hora, sem telefone.',
  },
  {
    icon: <IconClock />,
    title: 'Horários sob controle',
    desc: 'Defina turnos e o sistema bloqueia encaixes automaticamente.',
  },
  {
    icon: <IconUsers />,
    title: 'Equipe e clientes',
    desc: 'Cada funcionário com seu acesso; histórico do pet sempre à mão.',
  },
  {
    icon: <IconChart />,
    title: 'Visão do negócio',
    desc: 'Agendamentos, receita e ocupação num painel só.',
  },
]

function LoginAside() {
  return (
    <aside className="login-aside">
      <div className="login-aside-inner">
        <p className="login-tagline">
          A agenda do seu petshop, organizada num lugar só.
        </p>

        <div className="login-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="login-feature">
              <span className="login-feature-ico">{f.icon}</span>
              <span className="login-feature-title">{f.title}</span>
              <span className="login-feature-desc">{f.desc}</span>
            </div>
          ))}
        </div>

        <figure className="login-quote">
          <div className="login-stars" aria-label="5 de 5 estrelas">
            {Array.from({ length: 5 }).map((_, i) => (
              <IconStar key={i} />
            ))}
          </div>
          <blockquote className="login-quote-text">
            &ldquo;Parei de anotar agendamento em caderno. A equipe abre o painel de
            manhã e já sabe o dia inteiro.&rdquo;
          </blockquote>
          <figcaption className="login-quote-person">
            <span className="login-avatar" aria-hidden="true">MR</span>
            <span>
              <span className="login-quote-name" style={{ display: 'block' }}>
                Marina Rocha
              </span>
              <span className="login-quote-role">Petshop Focinho Feliz</span>
            </span>
          </figcaption>
        </figure>

        <div className="login-stats">
          <div>
            <div className="login-stat-value">1.200+</div>
            <div className="login-stat-label">agendamentos/mês</div>
          </div>
          <div>
            <div className="login-stat-value">180</div>
            <div className="login-stat-label">petshops ativos</div>
          </div>
          <div>
            <div className="login-stat-value">4,9</div>
            <div className="login-stat-label">nota média</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ------------------------------------------------------------------ *
 * Painel do formulário
 * ------------------------------------------------------------------ */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="login-alert" role="alert">
      <IconAlert />
      <span>{message}</span>
    </div>
  )
}

function SecondaryButtons({ googleSlot }: { googleSlot: React.ReactNode }) {
  return (
    <div className="login-secondary-stack">
      {googleSlot}
      <Link href="/cadastro" className="login-btn-outline">
        <IconPaw />
        Criar conta como cliente
      </Link>
      <Link href="/cadastro/lojista" className="login-btn-outline">
        <IconCalendar />
        Cadastrar meu petshop
      </Link>
    </div>
  )
}

function LoginFormPane() {
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [oauthPending, setOauthPending] = useState(false)

  const oauthError = searchParams.get('error')
  const paramMessage =
    oauthError === 'oauth'
      ? 'Não foi possível entrar com o Google. Tente novamente ou use e-mail e senha.'
      : oauthError
        ? 'Não foi possível concluir o login. Tente novamente.'
        : null

  const message = error ?? paramMessage

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await loginAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  async function handleGoogle() {
    setError(null)
    setOauthPending(true)
    const supabase = createClient()
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthErr) {
      setOauthPending(false)
      setError('Não foi possível conectar com o Google. Tente novamente.')
    }
    // Em caso de sucesso o browser é redirecionado para o Google.
  }

  return (
    <div className="login-form-inner">
      <div className="login-brand">
        <span className="login-brand-mark">
          <IconPaw />
        </span>
        <span className="login-brand-name">PetShop Agenda</span>
      </div>

      <h1 className="login-heading">Entrar</h1>
      <p className="login-sub">Acesse a agenda e os agendamentos do seu petshop.</p>

      {message && <ErrorBanner message={message} />}

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

        <div className="login-field">
          <label htmlFor="senha" className="login-label">Senha</label>
          <div className="login-input-wrap">
            <IconLock />
            <input
              id="senha"
              name="senha"
              type={showPassword ? 'text' : 'password'}
              className="login-input has-toggle"
              placeholder="Sua senha"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="login-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </div>

        <button type="submit" className="login-submit" disabled={isPending}>
          {isPending ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="login-divider">
        <span>ou</span>
      </div>

      <SecondaryButtons
        googleSlot={
          <button
            type="button"
            className="login-btn-outline"
            onClick={handleGoogle}
            disabled={oauthPending}
          >
            <IconGoogle />
            {oauthPending ? 'Conectando...' : 'Continuar com o Google'}
          </button>
        }
      />

      <p className="login-signup-hint">
        Os dois cadastros são gratuitos e levam menos de um minuto.
      </p>
    </div>
  )
}

/* Fallback do Suspense: mesmo layout, sem a parte que depende da URL. */
function LoginFormFallback() {
  return (
    <div className="login-form-inner">
      <div className="login-brand">
        <span className="login-brand-mark">
          <IconPaw />
        </span>
        <span className="login-brand-name">PetShop Agenda</span>
      </div>
      <h1 className="login-heading">Entrar</h1>
      <p className="login-sub">Acesse a agenda e os agendamentos do seu petshop.</p>

      <form className="login-form" aria-hidden="true">
        <div className="login-field">
          <label className="login-label">E-mail</label>
          <div className="login-input-wrap">
            <IconMail />
            <input className="login-input" placeholder="voce@petshop.com" disabled />
          </div>
        </div>
        <div className="login-field">
          <label className="login-label">Senha</label>
          <div className="login-input-wrap">
            <IconLock />
            <input className="login-input" type="password" placeholder="Sua senha" disabled />
          </div>
        </div>
        <button type="button" className="login-submit" disabled>Entrar</button>
      </form>

      <div className="login-divider">
        <span>ou</span>
      </div>

      <SecondaryButtons
        googleSlot={
          <button type="button" className="login-btn-outline" disabled>
            <IconGoogle />
            Continuar com o Google
          </button>
        }
      />

      <p className="login-signup-hint">
        Os dois cadastros são gratuitos e levam menos de um minuto.
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-form-pane">
        <Suspense fallback={<LoginFormFallback />}>
          <LoginFormPane />
        </Suspense>
      </div>
      <LoginAside />
    </div>
  )
}
