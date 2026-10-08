'use client'

import { useState, useTransition } from 'react'
import { trocarEmailAction } from '@/lib/actions-interno'

export default function TrocarEmail({ tipo, id, emailAtual }: { tipo: 'lojista' | 'cliente'; id: string; emailAtual: string }) {
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState(emailAtual)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!window.confirm(`Trocar o e-mail da conta para ${email}?`)) return
    setErro(null)
    iniciar(async () => {
      const r = await trocarEmailAction(tipo, id, email)
      if (r.error) setErro(r.error)
      else setAberto(false)
    })
  }

  if (!aberto) {
    return <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAberto(true)}>Trocar e-mail</button>
  }
  return (
    <form onSubmit={enviar} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
      <input type="email" required className="form-input" value={email} onChange={e => setEmail(e.target.value)} style={{ minWidth: 220 }} aria-label="Novo e-mail" />
      <button type="submit" className="btn btn-primary btn-sm" disabled={pendente}>{pendente ? 'Trocando…' : 'Trocar'}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAberto(false); setErro(null); setEmail(emailAtual) }}>Cancelar</button>
      {erro && <span className="form-error" style={{ flexBasis: '100%' }}>{erro}</span>}
    </form>
  )
}
