'use client'

import { useState, useTransition } from 'react'
import { atualizarJanelaAgendamentoAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconClock } from '@/components/icons'

type Unidade = 'horas' | 'dias'

interface Props {
  minValorAtual: number
  minUnidadeAtual: Unidade
  maxValorAtual: number
  maxUnidadeAtual: Unidade
}

// Só afeta o agendamento que o CLIENTE faz sozinho (online) — o lojista
// continua criando agendamento walk-in/telefone pra qualquer data/hora,
// sem essa trava (ver fn_criar_agendamento_lojista, não alterada).
export default function JanelaAgendamentoForm({ minValorAtual, minUnidadeAtual, maxValorAtual, maxUnidadeAtual }: Props) {
  const [minValor, setMinValor] = useState(minValorAtual)
  const [minUnidade, setMinUnidade] = useState<Unidade>(minUnidadeAtual)
  const [maxValor, setMaxValor] = useState(maxValorAtual)
  const [maxUnidade, setMaxUnidade] = useState<Unidade>(maxUnidadeAtual)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [isPending, startTransition] = useTransition()

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setSucesso(false)
    const fd = new FormData()
    fd.set('minValor', String(minValor))
    fd.set('minUnidade', minUnidade)
    fd.set('maxValor', String(maxValor))
    fd.set('maxUnidade', maxUnidade)
    startTransition(async () => {
      const result = await atualizarJanelaAgendamentoAction(fd)
      if (result?.error) { setErro(result.error); return }
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    })
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconClock style={{ width: 17, height: 17 }} /></span>
        <div>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Antecedência do agendamento online</div>
          <div className="text-sm text-muted">Controle com quanto tempo de antecedência o cliente pode agendar sozinho pelo link.</div>
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
        <div className="form-grid-2">
          <div className="form-group">
            <label className="form-label">Antecedência mínima</label>
            <div className="flex gap-2">
              <input
                type="number" min={0} max={999} className="form-input"
                value={minValor} onChange={e => setMinValor(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <select className="form-select" value={minUnidade} onChange={e => setMinUnidade(e.target.value as Unidade)} style={{ flexShrink: 0, width: 100 }}>
                <option value="horas">horas</option>
                <option value="dias">dias</option>
              </select>
            </div>
            <span className="form-hint">Ex.: 3 horas — não dá pra agendar pros próximos 3h.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Antecedência máxima</label>
            <div className="flex gap-2">
              <input
                type="number" min={1} max={999} className="form-input"
                value={maxValor} onChange={e => setMaxValor(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <select className="form-select" value={maxUnidade} onChange={e => setMaxUnidade(e.target.value as Unidade)} style={{ flexShrink: 0, width: 100 }}>
                <option value="horas">horas</option>
                <option value="dias">dias</option>
              </select>
            </div>
            <span className="form-hint">Ex.: 5 dias — só mostra disponibilidade até 5 dias à frente.</span>
          </div>
        </div>

        <div className="flex justify-end" style={{ marginTop: 'var(--space-2)' }}>
          <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
