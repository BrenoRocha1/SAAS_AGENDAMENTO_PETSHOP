'use client'

import { useState, useTransition } from 'react'
import { salvarTaxiDogCriaRotasAction } from '@/lib/actions-taxidog'
import { IconAlert, IconRoute } from '@/components/icons'

// Configuração das rotas (migration 053): o TaxiDog monta a rota e já pode
// sair, ou a rota espera a aprovação de um administrador / da gestão de
// agendamentos. Salva na hora, sem o "Salvar" do formulário de preços.
export default function TaxiDogRotasConfig({ inicial, disponivel }: { inicial: boolean; disponivel: boolean }) {
  const [ligado, setLigado] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [isPending, startTransition] = useTransition()

  function alternar() {
    const novo = !ligado
    setLigado(novo)
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      const r = await salvarTaxiDogCriaRotasAction(novo)
      if (r.error) {
        setLigado(!novo)
        setErro(r.error)
        return
      }
      setSalvo(true)
    })
  }

  return (
    <div className="card" style={{ maxWidth: 820, marginTop: 'var(--space-6)' }}>
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-2)' }}>
        <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconRoute style={{ width: 18, height: 18 }} /></span>
        <div style={{ flex: 1 }}>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Rotas</div>
          <div className="text-sm text-muted">O TaxiDog pode juntar várias corridas numa rota, além de pegar uma de cada vez pelo Kanban.</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3" style={{ padding: 'var(--space-3) 0', opacity: disponivel ? 1 : 0.5 }}>
        <div>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>TaxiDog monta rotas sem aprovação</div>
          <div className="text-sm text-muted">
            {ligado
              ? 'Ligado: a rota que o TaxiDog montar já pode sair.'
              : 'Desligado: a rota fica "Aguardando aprovação" até um administrador ou alguém da gestão de agendamentos aprovar.'}
          </div>
        </div>
        <button
          type="button"
          className={`switch ${ligado ? 'switch-on' : ''}`}
          onClick={alternar}
          disabled={!disponivel || isPending}
          role="switch"
          aria-checked={ligado}
          aria-label="TaxiDog monta rotas sem aprovação"
          style={{ flexShrink: 0 }}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      {!disponivel && <p className="text-xs text-muted" style={{ margin: 0 }}>Execute a migration 053_taxidog_kanban_e_rotas.sql para usar esta opção.</p>}
      {erro && (
        <div className="alert alert-error" style={{ marginTop: 'var(--space-2)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}
      {salvo && !erro && <p className="text-xs text-success" style={{ margin: 0 }}>Salvo.</p>}
    </div>
  )
}
