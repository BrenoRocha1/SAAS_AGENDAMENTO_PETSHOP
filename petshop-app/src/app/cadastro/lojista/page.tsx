'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cadastroLojistaAction, getGoogleOAuthUrlAction } from '@/lib/actions'
import { IconMapPin, IconPhone, IconStore } from '@/components/icons'

const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

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

export default function CadastroLojistaPage() {
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [oauthPending, setOauthPending] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await cadastroLojistaAction(new FormData(form))
      if (result?.error) setError(result.error)
    })
  }

  async function handleGoogle() {
    setError(null)
    setOauthPending(true)
    
    const result = await getGoogleOAuthUrlAction('lojista')
    
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
        <div className="login-form-inner" style={{ maxWidth: 520 }}>
          <div className="login-brand">
            <span className="login-brand-mark">
              <IconPaw />
            </span>
            <span className="login-brand-name">SAIP</span>
          </div>

          <h1 className="login-heading">Cadastrar Petshop</h1>
          <p className="login-sub">Crie sua conta e comece a receber agendamentos.</p>

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

          <div className="login-divider">
            <span>ou</span>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="nome_loja" className="login-label">Nome do Estabelecimento</label>
              <div className="login-input-wrap">
                <IconStore />
                <input id="nome_loja" name="nome_loja" type="text" className="login-input" placeholder="PetShop do Bairro" required />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="login-field" style={{ flex: 1 }}>
                <label htmlFor="email" className="login-label">E-mail</label>
                <div className="login-input-wrap">
                  <IconMail />
                  <input id="email" name="email" type="email" className="login-input" placeholder="contato@petshop.com" required />
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
              <label htmlFor="descricao" className="login-label">Descrição</label>
              <textarea id="descricao" name="descricao" className="login-textarea" placeholder="Conte um pouco sobre seu petshop..." rows={3} />
            </div>

            <div className="login-field">
              <label htmlFor="endereco" className="login-label">Endereço</label>
              <div className="login-input-wrap">
                <IconMapPin />
                <input id="endereco" name="endereco" type="text" className="login-input" placeholder="Rua das Flores, 123" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="login-field" style={{ flex: 2 }}>
                <label htmlFor="cidade" className="login-label">Cidade</label>
                <input id="cidade" name="cidade" type="text" className="login-input login-input-plain" placeholder="São Paulo" />
              </div>
              <div className="login-field" style={{ flex: 1 }}>
                <label htmlFor="estado" className="login-label">Estado</label>
                <select id="estado" name="estado" className="login-input login-input-plain">
                  <option value="">UF</option>
                  {UF.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
              <div className="login-field" style={{ flex: 1 }}>
                <label htmlFor="cep" className="login-label">CEP</label>
                <input id="cep" name="cep" type="text" className="login-input login-input-plain" placeholder="00000-000" maxLength={9} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--lg-border)', paddingTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
              {isPending ? 'Cadastrando...' : 'Cadastrar Petshop'}
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
