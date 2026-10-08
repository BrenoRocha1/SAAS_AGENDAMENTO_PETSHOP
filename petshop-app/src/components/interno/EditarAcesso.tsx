'use client'

import { useState, useTransition } from 'react'
import { definirAcessoAteAction } from '@/lib/actions-interno'

// "yyyy-MM-ddTHH:mm" no horário local, que é o que o <input datetime-local> usa.
function paraCampo(iso: string): string {
  const d = new Date(iso)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`
}

export default function EditarAcesso({ idLojista, acessoAte }: { idLojista: string; acessoAte: string }) {
  const [valor, setValor] = useState(paraCampo(acessoAte))
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pendente, iniciar] = useTransition()

  function salvar(quando: string, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return
    setErro(null)
    setOk(false)
    iniciar(async () => {
      const r = await definirAcessoAteAction(idLojista, quando)
      if (r.error) setErro(r.error)
      else setOk(true)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label className="form-label" htmlFor="acesso-ate">Acesso vai até</label>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <input id="acesso-ate" type="datetime-local" className="form-input" value={valor} onChange={e => setValor(e.target.value)} style={{ maxWidth: 240 }} />
        <button type="button" className="btn btn-primary btn-sm" disabled={pendente || !valor} onClick={() => salvar(new Date(valor).toISOString())}>
          {pendente ? 'Salvando…' : 'Salvar data'}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={pendente}
          onClick={() => salvar(new Date().toISOString(), 'Bloquear o acesso desta empresa agora?')}
        >
          Bloquear agora
        </button>
      </div>
      {erro && <span className="form-error">{erro}</span>}
      {ok && <span className="text-sm text-success">Salvo.</span>}
    </div>
  )
}
