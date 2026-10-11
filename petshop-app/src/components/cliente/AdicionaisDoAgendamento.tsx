'use client'

import type { ServicoAdicional } from '@/lib/adicionais'
import { formatarReais } from '@/lib/taxidog'
import { IconCheck } from '@/components/icons'
import './adicionais-agendamento.css'

interface Props {
  // Os adicionais que valem para o serviço escolhido (já filtrados).
  opcoes: ServicoAdicional[]
  nomeServico: string
  marcados: string[]
  onAlternar: (idAdicional: string) => void
  disabled?: boolean
}

// "Serviços adicionais (opcional)" do agendamento pela conta do cliente
// (NovoAgendamentoWizard): o cliente marca nenhum, um ou vários adicionais
// que a loja liberou para o serviço (migration 095). Sem nenhum liberado,
// não aparece.
export default function AdicionaisDoAgendamento({ opcoes, nomeServico, marcados, onAlternar, disabled }: Props) {
  if (opcoes.length === 0) return null
  const total = opcoes.filter(a => marcados.includes(a.id_adicional)).reduce((soma, a) => soma + a.preco, 0)

  return (
    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
      <label className="form-label">Serviços adicionais para {nomeServico} (opcional)</label>
      <div className="adic-escolha">
        {opcoes.map(a => {
          const marcado = marcados.includes(a.id_adicional)
          return (
            <button
              key={a.id_adicional}
              type="button"
              className={`adic-escolha-opcao ${marcado ? 'is-ativa' : ''}`}
              role="checkbox"
              aria-checked={marcado}
              disabled={disabled}
              onClick={() => onAlternar(a.id_adicional)}
            >
              <span className="ag2-caixa" aria-hidden="true"><IconCheck /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="text-sm font-semibold" style={{ display: 'block', color: 'var(--gray-100)' }}>{a.nome}</span>
                {a.descricao && <span className="text-xs text-muted" style={{ display: 'block' }}>{a.descricao}</span>}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--primary-300)', whiteSpace: 'nowrap' }}>+ {formatarReais(a.preco)}</span>
            </button>
          )
        })}
      </div>
      {total > 0 && (
        <p className="text-sm text-success font-semibold" style={{ marginTop: 'var(--space-2)' }}>
          Subtotal adicionais: {formatarReais(total)}
        </p>
      )}
    </div>
  )
}
