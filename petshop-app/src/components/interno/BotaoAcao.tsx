'use client'

import { useState, useTransition } from 'react'

// Botão que roda uma Server Action já "amarrada" (bind) aos argumentos e
// mostra o erro logo abaixo, se houver. `confirmar` pede um OK antes.
export default function BotaoAcao({
  acao,
  children,
  className = 'btn btn-secondary btn-sm',
  confirmar,
}: {
  acao: () => Promise<{ error?: string; success?: boolean }>
  children: React.ReactNode
  className?: string
  confirmar?: string
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function clicar() {
    if (confirmar && !window.confirm(confirmar)) return
    setErro(null)
    iniciar(async () => {
      const r = await acao()
      if (r.error) setErro(r.error)
    })
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button type="button" className={className} onClick={clicar} disabled={pendente}>
        {pendente ? 'Aguarde…' : children}
      </button>
      {erro && <span className="form-error">{erro}</span>}
    </span>
  )
}
