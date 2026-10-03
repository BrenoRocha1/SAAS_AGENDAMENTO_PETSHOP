'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { loginFuncionarioCodigoAction } from '@/lib/actions'
import { OtpInput, type OtpInputHandle, type OtpStatus } from '@/components/ui/otp-input'

function IconStore({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="m2 7 4.5-4.5h11L22 7l-1 12H3Z" />
      <path d="M16 19v-4.5c0-1.4-1.1-2.5-2.5-2.5h-3c-1.4 0-2.5 1.1-2.5 2.5V19" />
    </svg>
  )
}

// Login da equipe: só o código de acesso rápido que o responsável da loja
// gera na tela do funcionário (6 dígitos, 1 minuto, uso único). Não tem
// e-mail nem senha — o código já diz quem está entrando. Entra sozinho ao
// completar os 6 dígitos.
export default function LoginFuncionarioPage() {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<OtpStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const campo = useRef<OtpInputHandle>(null)
  const router = useRouter()

  // Código recusado: as células tremem em vermelho e depois esvaziam pra
  // digitar de novo (cheias, qualquer tecla dispararia outra tentativa).
  useEffect(() => {
    if (status !== 'error') return
    const volta = setTimeout(() => {
      campo.current?.clear()
      setStatus('idle')
    }, 900)
    return () => clearTimeout(volta)
  }, [status])

  function entrar(codigo: string) {
    if (isPending || status !== 'idle') return
    setError(null)
    startTransition(async () => {
      const res = await loginFuncionarioCodigoAction(codigo)
      if (res?.error) {
        setError(res.error)
        setStatus('error')
        return
      }
      setStatus('success')
      router.push('/lojista/agendamentos')
      router.refresh()
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
          <p className="text-muted">Digite o seu código de acesso rápido</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
          <OtpInput
            ref={campo}
            label="Código de acesso"
            status={status}
            disabled={isPending || status === 'success'}
            autoFocus
            onChange={valor => { if (valor) setError(null) }}
            onComplete={entrar}
          />
          <p className="text-xs text-muted" style={{ textAlign: 'center', minHeight: '1.25rem' }}>
            {isPending || status === 'success'
              ? 'Entrando...'
              : 'Peça ao responsável da loja o seu código de 6 dígitos. Ele vale 1 minuto e já identifica você — não precisa de e-mail nem senha.'}
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--gray-800)' }}>
          <Link href="/login" className="text-sm text-primary hover-underline">
            Voltar para o login normal
          </Link>
        </div>
      </div>
    </div>
  )
}
