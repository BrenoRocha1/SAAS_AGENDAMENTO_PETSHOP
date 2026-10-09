'use client'

import { useState, useTransition } from 'react'
import { salvarTempoEsperaRetiradaAction } from '@/lib/actions-taxidog'
import { IconAlert, IconClock } from '@/components/icons'

// Tempo limite de espera na retirada (migration 093): passado esse tempo no
// endereço do cliente sem o pet ser entregue, o TaxiDog pode cancelar a
// retirada (o agendamento é cancelado e o cliente é avisado no WhatsApp).
export default function TaxiDogEsperaConfig({ inicial, disponivel }: { inicial: number | null; disponivel: boolean }) {
  const [valor, setValor] = useState(inicial ? String(inicial) : '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [isPending, startTransition] = useTransition()

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSalvo(false)
    const minutos = valor.trim() === '' ? null : Number(valor)
    startTransition(async () => {
      const r = await salvarTempoEsperaRetiradaAction(minutos)
      if (r.error) setErro(r.error)
      else setSalvo(true)
    })
  }

  return (
    <form className="card" style={{ maxWidth: 820, marginTop: 'var(--space-6)' }} onSubmit={salvar}>
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-3)' }}>
        <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconClock style={{ width: 18, height: 18 }} /></span>
        <div style={{ flex: 1 }}>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Tempo de espera na retirada</div>
          <div className="text-sm text-muted">
            Quanto o TaxiDog espera no endereço do cliente. Passado esse tempo sem o pet ser entregue, aparece o botão
            &quot;Cancelar retirada&quot;: o agendamento é cancelado e o WhatsApp abre com o aviso pronto para o cliente.
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3" style={{ flexWrap: 'wrap', opacity: disponivel ? 1 : 0.5 }}>
        <label className="flex items-center gap-2 text-sm" htmlFor="tempo-espera">
          <input
            id="tempo-espera"
            type="number"
            min={1}
            max={180}
            step={1}
            inputMode="numeric"
            className="form-input"
            style={{ width: 96 }}
            placeholder="Sem limite"
            value={valor}
            onChange={e => { setValor(e.target.value); setSalvo(false) }}
            disabled={!disponivel || isPending}
          />
          minutos
        </label>
        <button type="submit" className={`btn btn-primary btn-sm ${isPending ? 'btn-loading' : ''}`} disabled={!disponivel || isPending}>
          Salvar
        </button>
        <span className="text-xs text-muted">Deixe em branco para não ter limite.</span>
      </div>

      {!disponivel && <p className="text-xs text-muted" style={{ margin: 'var(--space-2) 0 0' }}>Execute a migration 093_taxidog_tempo_espera_retirada.sql para usar esta opção.</p>}
      {erro && (
        <div className="alert alert-error" style={{ marginTop: 'var(--space-2)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}
      {salvo && !erro && <p className="text-xs text-success" style={{ margin: 'var(--space-2) 0 0' }}>Salvo.</p>}
    </form>
  )
}
