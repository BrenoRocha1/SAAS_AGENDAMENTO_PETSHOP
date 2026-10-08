'use client'

import { useState, useTransition } from 'react'
import { adicionarAdminAction } from '@/lib/actions-interno'

export default function FormAdmin() {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pendente, iniciar] = useTransition()

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setOk(false)
    iniciar(async () => {
      const r = await adicionarAdminAction(email, nome)
      if (r.error) { setErro(r.error); return }
      setOk(true)
      setEmail('')
      setNome('')
    })
  }

  return (
    <form onSubmit={enviar} className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
      <div className="grid-3" style={{ alignItems: 'end' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="adm-email">E-mail da conta</label>
          <input id="adm-email" className="form-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@email.com" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="adm-nome">Nome (opcional)</label>
          <input id="adm-nome" className="form-input" value={nome} onChange={e => setNome(e.target.value)} />
        </div>
        <div className="form-group">
          <button type="submit" className="btn btn-primary" disabled={pendente}>{pendente ? 'Adicionando…' : 'Adicionar administrador'}</button>
        </div>
      </div>
      {erro && <div className="alert alert-error" role="alert"><span>{erro}</span></div>}
      {ok && <div className="alert alert-success" role="status"><span>Administrador adicionado.</span></div>}
      <p className="form-hint">A pessoa precisa já ter conta (cliente ou lojista) com esse e-mail.</p>
    </form>
  )
}
