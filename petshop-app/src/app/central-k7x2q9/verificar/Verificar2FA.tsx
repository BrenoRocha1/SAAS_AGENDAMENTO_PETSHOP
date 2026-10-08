'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import MarcaSaip from '@/components/MarcaSaip'

// Segundo fator do painel interno (TOTP — Google Authenticator, Authy, 1Password…).
// Primeira vez: mostra o QR para cadastrar o app. Depois: só pede o código.
export default function Verificar2FA() {
  const supabase = createClient()
  const [fatorId, setFatorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [segredo, setSegredo] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    async function preparar() {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (!vivo) return
      if (error) { setErro(error.message); setCarregando(false); return }

      const verificado = data.totp.find(f => f.status === 'verified')
      if (verificado) { setFatorId(verificado.id); setCarregando(false); return }

      // Sobras de cadastros que ninguém terminou: remove antes de criar outro.
      for (const f of data.all.filter(f => f.factor_type === 'totp' && f.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const novo = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SAIP interno' })
      if (!vivo) return
      if (novo.error || !novo.data) {
        setErro(`Não foi possível iniciar o 2º fator: ${novo.error?.message ?? 'erro desconhecido'}. Confira se o MFA (TOTP) está ligado no Supabase (Authentication → Sign In / Providers → MFA).`)
      } else {
        setFatorId(novo.data.id)
        setQr(novo.data.totp.qr_code)
        setSegredo(novo.data.totp.secret)
      }
      setCarregando(false)
    }
    void preparar()
    return () => { vivo = false }
  }, [supabase])

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!fatorId) return
    setErro(null)
    setEnviando(true)
    const desafio = await supabase.auth.mfa.challenge({ factorId: fatorId })
    if (desafio.error) { setEnviando(false); setErro(desafio.error.message); return }
    const r = await supabase.auth.mfa.verify({ factorId: fatorId, challengeId: desafio.data.id, code: codigo.trim() })
    if (r.error) {
      setEnviando(false)
      setErro('Código incorreto ou vencido. Tente o código atual do app.')
      setCodigo('')
      return
    }
    window.location.href = ROTA_INTERNA
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 'var(--space-6)', background: 'var(--gray-950)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 'var(--space-8)', textAlign: 'center' }}>
        <MarcaSaip />
        <h1 className="page-title" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>Verificação em 2 etapas</h1>

        {carregando ? (
          <p className="text-muted">Carregando…</p>
        ) : (
          <>
            {qr ? (
              <>
                <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>
                  Primeira vez: leia o QR code no app autenticador (Google Authenticator, Authy, 1Password) e digite o código de 6 dígitos.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URI gerado pelo Supabase */}
                <img src={qr} alt="QR code do autenticador" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 8, margin: '0 auto var(--space-3)' }} />
                {segredo && <p className="text-xs text-muted" style={{ wordBreak: 'break-all', marginBottom: 'var(--space-4)' }}>Sem câmera? Chave: {segredo}</p>}
              </>
            ) : (
              <p className="text-muted" style={{ marginBottom: 'var(--space-4)' }}>Digite o código de 6 dígitos do seu app autenticador.</p>
            )}

            {fatorId && (
              <form onSubmit={confirmar}>
                <input
                  className="form-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                  style={{ textAlign: 'center', letterSpacing: '0.4em', fontSize: '1.25rem', marginBottom: 'var(--space-3)' }}
                />
                <button type="submit" className="btn btn-primary btn-full" disabled={enviando || codigo.length !== 6}>
                  {enviando ? 'Verificando…' : 'Confirmar'}
                </button>
              </form>
            )}
          </>
        )}
        {erro && <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-4)' }}><span>{erro}</span></div>}
      </div>
    </div>
  )
}
