'use client'

import { useState } from 'react'
import { definirAgendamentosSimultaneosAction } from '@/lib/actions-agenda'
import { IconAlert, IconUsers } from '@/components/icons'
import { IndicadorSalvo, useSalvarSozinho } from '@/components/ui/salvo-sozinho'

const MAXIMO = 20

// Quantos agendamentos a loja aceita no mesmo horário (migration 076).
// Vale para tudo que confere horário: agendamento online, os que a loja
// cria, remarcar e trocar serviço. Salva sozinho a cada mudança.
export default function SimultaneosForm({ atual }: { atual: number }) {
  const [quantidade, setQuantidade] = useState(atual)
  const auto = useSalvarSozinho({ valores: quantidade, salvar: definirAgendamentosSimultaneosAction })

  function mudar(n: number) {
    setQuantidade(Math.min(MAXIMO, Math.max(1, n)))
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconUsers style={{ width: 17, height: 17 }} /></span>
        <div style={{ flex: 1 }}>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Agendamentos simultâneos</div>
          <div className="text-sm text-muted">Quantos pets a loja atende ao mesmo tempo. Um horário só fica ocupado quando esse número é atingido.</div>
        </div>
        <IndicadorSalvo estado={auto.estado} />
      </div>

      {auto.estado === 'erro' && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{auto.erro}</span>
        </div>
      )}

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label htmlFor="simultaneos" className="form-label">Agendamentos no mesmo horário</label>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => mudar(quantidade - 1)} disabled={quantidade <= 1} aria-label="Diminuir">−</button>
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
            onBlur={auto.salvarAgora}
          />
          <button type="button" className="btn btn-secondary" onClick={() => mudar(quantidade + 1)} disabled={quantidade >= MAXIMO} aria-label="Aumentar">+</button>
        </div>
        <span className="form-hint">
          {quantidade === 1
            ? 'Com 1, cada horário aceita um agendamento só (como sempre foi).'
            : `Com ${quantidade}, o mesmo horário aceita até ${quantidade} agendamentos de pets diferentes.`}
          {' '}Vale para o agendamento online e para os que a loja cria. O mesmo pet nunca fica com dois serviços no mesmo horário.
        </span>
      </div>
    </div>
  )
}
