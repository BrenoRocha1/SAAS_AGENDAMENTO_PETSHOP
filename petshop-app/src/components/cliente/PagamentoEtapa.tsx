'use client'

import { useState } from 'react'
import { ROTULO_FORMA_PAGAMENTO, formasAtivas, type FormaPagamento, type FormasLoja } from '@/lib/pagamento'
import { IconCheck } from '@/components/icons'

// Etapa "Como você deseja pagar?" dos dois fluxos do cliente (link público
// e conta do cliente). Só as formas que a loja aceita (migration 057). A
// forma vale pro pedido inteiro; escolher não é pagar — a loja confirma o
// recebimento depois.

function estiloOpcao(selecionado: boolean): React.CSSProperties {
  return {
    padding: 'var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${selecionado ? 'var(--primary-500)' : 'var(--gray-700)'}`,
    background: selecionado ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    font: 'inherit',
    color: 'inherit',
  }
}

// Chave e nome do Pix da loja, com "Copiar".
export function PixDaLoja({ chave, nome }: { chave: string | null; nome: string | null }) {
  const [copiado, setCopiado] = useState(false)
  if (!chave) return null

  async function copiar() {
    try {
      await navigator.clipboard.writeText(chave!)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sem permissão de área de transferência: o cliente copia na mão.
    }
  }

  return (
    <div className="pix-loja">
      <div className="text-sm font-semibold" style={{ color: 'var(--gray-100)' }}>Pagamento via Pix</div>
      <div className="pix-loja-linha">
        <span className="text-xs text-muted">Chave</span>
        <span className="pix-loja-chave">{chave}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copiar}>
          {copiado ? <><IconCheck style={{ width: 13, height: 13 }} /> Copiado</> : 'Copiar'}
        </button>
      </div>
      {nome && (
        <div className="pix-loja-linha">
          <span className="text-xs text-muted">Nome</span>
          <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{nome}</span>
        </div>
      )}
      <p className="text-xs text-muted" style={{ margin: 0 }}>Confira o nome antes de pagar. A loja confirma o recebimento.</p>
    </div>
  )
}

export default function PagamentoEtapa({ formas, valor, onChange, resumoTaxiDog, onContinuar, rotuloContinuar = 'Continuar' }: {
  formas: FormasLoja
  valor: FormaPagamento | null
  onChange: (forma: FormaPagamento) => void
  // "TaxiDog · Buscar e entregar · R$ 20,00" quando o cliente escolheu TaxiDog.
  resumoTaxiDog?: string | null
  onContinuar: () => void
  rotuloContinuar?: string
}) {
  const opcoes = formasAtivas(formas)

  return (
    <div className="card">
      <h3 style={{ marginBottom: 'var(--space-2)' }}>Como você deseja pagar?</h3>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>
        Vale para o pedido todo{resumoTaxiDog ? ' (serviços e TaxiDog)' : ''}. Você paga direto para a loja.
      </p>

      {resumoTaxiDog && (
        <div className="pag-resumo-taxidog text-sm">{resumoTaxiDog}</div>
      )}

      {opcoes.length === 0 ? (
        <p className="text-sm text-muted">Esta loja ainda não configurou as formas de pagamento. Fale com a loja.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
          {opcoes.map(forma => (
            <button key={forma} type="button" style={estiloOpcao(valor === forma)} onClick={() => onChange(forma)} aria-pressed={valor === forma}>
              <span
                style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${valor === forma ? 'var(--primary-500)' : 'var(--gray-600)'}`,
                  background: valor === forma ? 'var(--primary-500)' : 'transparent',
                  boxShadow: valor === forma ? 'inset 0 0 0 3px var(--gray-900)' : 'none',
                }}
              />
              <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{ROTULO_FORMA_PAGAMENTO[forma]}</span>
            </button>
          ))}
        </div>
      )}

      {valor === 'pix' && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <PixDaLoja chave={formas.pix_chave} nome={formas.pix_nome} />
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" disabled={!valor} onClick={onContinuar}>
          {rotuloContinuar}
        </button>
      </div>
    </div>
  )
}
