'use client'

import { useState } from 'react'

// "Cancelar" com um passo de confirmação: cancelar não tem volta (o status
// não pode mais mudar e o TaxiDog do agendamento é cancelado junto).
export default function BotaoCancelarAgendamento({ onConfirmar, disabled }: {
  onConfirmar: () => void
  disabled?: boolean
}) {
  const [confirmando, setConfirmando] = useState(false)

  if (!confirmando) {
    return (
      <button type="button" className="btn btn-danger btn-sm" style={{ flex: 1 }} disabled={disabled} onClick={() => setConfirmando(true)}>
        Cancelar
      </button>
    )
  }

  return (
    <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span className="text-xs text-muted">Cancelar este agendamento? Não dá para desfazer.</span>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-danger btn-sm"
          style={{ flex: 1 }}
          disabled={disabled}
          onClick={() => { setConfirmando(false); onConfirmar() }}
        >
          Sim, cancelar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setConfirmando(false)}>
          Voltar
        </button>
      </div>
    </div>
  )
}
