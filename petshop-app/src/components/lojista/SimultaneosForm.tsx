'use client'

import { useState, useTransition } from 'react'
import { definirAgendamentosSimultaneosAction } from '@/lib/actions-agenda'
import { IconAlert, IconCheck, IconUsers } from '@/components/icons'

const MAXIMO = 20

// Quantos agendamentos a loja aceita no mesmo horário (migration 076).
// Vale para tudo que confere horário: agendamento online, os que a loja
// cria, remarcar e trocar serviço.
export default function SimultaneosForm({ atual }: { atual: number }) {
  const [quantidade, setQuantidade] = useState(atual)
  const [salvo, setSalvo] = useState(atual)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [isPending, startTransition] = useTransition()

  function mudar(n: number) {
    setQuantidade(Math.min(MAXIMO, Math.max(1, n)))
    setSucesso(false)
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(false)
    startTransition(async () => {
      const result = await definirAgendamentosSimultaneosAction(quantidade)
      if (result?.error) { setErro(result.error); return }
      setSalvo(quantidade)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    })
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconUsers style={{ width: 17, height: 17 }} /></span>
        <div>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Agendamentos simultâneos</div>
          <div className="text-sm text-muted">Quantos pets a loja atende ao mesmo tempo. Um horário só fica ocupado quando esse número é atingido.</div>
        </div>
      </div>

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}
      {sucesso && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Configuração salva!</span>
        </div>
      )}

      <form onSubmit={salvar}>
        <div className="form-group">
          <label htmlFor="simultaneos" className="form-label">Agendamentos no mesmo horário</label>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => mudar(quantidade - 1)} disabled={isPending || quantidade <= 1} aria-label="Diminuir">−</button>
            <input
              id="simultaneos"
              type="number"
              min={1}
              max={MAXIMO}
              step={1}
              className="form-input"
              style={{ width: 90, textAlign: 'center' }}
              value={quantidade}
              onChange={e => mudar(Math.round(Number(e.target.value)) || 1)}
              disabled={isPending}
            />
            <button type="button" className="btn btn-secondary" onClick={() => mudar(quantidade + 1)} disabled={isPending || quantidade >= MAXIMO} aria-label="Aumentar">+</button>
          </div>
          <span className="form-hint">
            {quantidade === 1
              ? 'Com 1, cada horário aceita um agendamento só (como sempre foi).'
              : `Com ${quantidade}, o mesmo horário aceita até ${quantidade} agendamentos de pets diferentes.`}
            {' '}Vale para o agendamento online e para os que a loja cria. O mesmo pet nunca fica com dois serviços no mesmo horário.
          </span>
        </div>

        <div className="flex justify-end" style={{ marginTop: 'var(--space-2)' }}>
          <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending || quantidade === salvo}>
            {isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
