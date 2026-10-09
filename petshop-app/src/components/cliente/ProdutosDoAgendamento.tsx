'use client'

import { useState } from 'react'
import { arredondarQuantidade, lerValorDigitado, passoQuantidade } from '@/lib/pdv'
import { rotuloUnidade, unidadeFracionavel } from '@/lib/produto'
import { formatarReais } from '@/lib/taxidog'
import { IconMinus, IconPackage, IconPlus } from '@/components/icons'

export interface ProdutoDoAgendamento {
  id_produto: string
  nome: string
  preco_venda: number
  unidade_venda: string
  estoque_atual: number
}

interface Props {
  produtos: ProdutoDoAgendamento[]
  // Por id_produto. Sem entrada (ou 0) = não escolhido.
  quantidades: Record<string, number>
  onChange: (idProduto: string, quantidade: number) => void
}

// "2" / "1,5" — vírgula decimal, sem a unidade (que já aparece ao lado).
function textoDaQuantidade(q: number): string {
  return String(arredondarQuantidade(q)).replace('.', ',')
}

// "Adicionar produtos (opcional)" do agendamento do cliente (link público e
// cliente logado — NovoAgendamentoWizard e AgendamentoOnlineWizard usam o
// mesmo componente). Mesma lógica de quantidade do PDV (src/lib/pdv.ts):
// produto por kg/litro aceita vírgula e anda de 0,1 em 0,1; os outros só
// contam inteiro. Em 0, o produto sai do pedido — basta tocar em "+" de
// novo pra voltar, por isso não pede confirmação.
export default function ProdutosDoAgendamento({ produtos, quantidades, onChange }: Props) {
  if (produtos.length === 0) return null

  const total = produtos.reduce((soma, p) => soma + p.preco_venda * (quantidades[p.id_produto] ?? 0), 0)

  return (
    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
      <label className="form-label">Adicionar produtos (opcional)</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {produtos.map(p => (
          <LinhaProduto
            key={p.id_produto}
            produto={p}
            quantidade={quantidades[p.id_produto] ?? 0}
            onChange={q => onChange(p.id_produto, q)}
          />
        ))}
      </div>
      {total > 0 && (
        <p className="text-sm text-success font-semibold" style={{ marginTop: 'var(--space-2)' }}>
          Subtotal produtos: {formatarReais(total)}
        </p>
      )}
    </div>
  )
}

function LinhaProduto({ produto: p, quantidade, onChange }: {
  produto: ProdutoDoAgendamento
  quantidade: number
  onChange: (quantidade: number) => void
}) {
  const passo = passoQuantidade(p.unidade_venda)
  const fracionavel = unidadeFracionavel(p.unidade_venda)
  const [aviso, setAviso] = useState<string | null>(null)

  function avisar(msg: string) {
    setAviso(msg)
    setTimeout(() => setAviso(null), 3000)
  }

  // Confere o limite do estoque antes de aplicar — mesma regra do PDV.
  function definir(q: number) {
    const quantidadeArredondada = arredondarQuantidade(Math.max(0, q))
    if (quantidadeArredondada > p.estoque_atual) {
      avisar(`Só há ${textoDaQuantidade(p.estoque_atual)} ${rotuloUnidade(p.unidade_venda).toLowerCase()} em estoque.`)
      onChange(arredondarQuantidade(p.estoque_atual))
      return
    }
    onChange(quantidadeArredondada)
  }

  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--gray-850)', border: '1px solid var(--gray-800)', borderRadius: 'var(--radius-sm)' }}
    >
      <IconPackage style={{ width: 15, height: 15, color: 'var(--gray-500)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</div>
        <div className="text-xs text-muted">{formatarReais(p.preco_venda)} / {rotuloUnidade(p.unidade_venda)}</div>
        {aviso && <div className="text-xs" style={{ color: 'var(--danger-400)', marginTop: 2 }}>{aviso}</div>}
      </div>
      {quantidade > 0 && (
        <span className="text-sm font-semibold" style={{ color: 'var(--success-400)', whiteSpace: 'nowrap' }}>
          {formatarReais(p.preco_venda * quantidade)}
        </span>
      )}
      <span
        className="flex items-center"
        style={{ flexShrink: 0, background: 'var(--gray-900)', border: '1px solid var(--gray-700)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
      >
        {quantidade > 0 && (
          <>
            <button
              type="button"
              onClick={() => definir(quantidade - passo)}
              aria-label={`Diminuir quantidade de ${p.nome}`}
              style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', background: 'none', border: 0, color: 'var(--gray-400)', cursor: 'pointer' }}
            >
              <IconMinus style={{ width: 13, height: 13 }} />
            </button>
            <CampoQtd
              key={quantidade}
              valor={quantidade}
              fracionavel={fracionavel}
              onConfirmar={definir}
            />
          </>
        )}
        <button
          type="button"
          onClick={() => definir(quantidade === 0 ? 1 : quantidade + passo)}
          disabled={quantidade >= p.estoque_atual}
          aria-label={`Aumentar quantidade de ${p.nome}`}
          style={{
            width: 28, height: 28, display: 'grid', placeItems: 'center', background: 'none', border: 0,
            color: 'var(--gray-400)', cursor: quantidade >= p.estoque_atual ? 'default' : 'pointer',
            opacity: quantidade >= p.estoque_atual ? 0.4 : 1,
          }}
        >
          <IconPlus style={{ width: 13, height: 13 }} />
        </button>
      </span>
    </div>
  )
}

// Campo de quantidade da linha — digita-se à vontade e só vale ao sair do
// campo/Enter (mesmo padrão do PDV, src/components/lojista/PdvCaixa.tsx).
// `key={valor}` no uso recria o campo quando a quantidade muda por outro
// caminho (os botões +/-), sem brigar com o que a pessoa está digitando.
function CampoQtd({ valor, fracionavel, onConfirmar }: {
  valor: number
  fracionavel: boolean
  onConfirmar: (q: number) => void
}) {
  const [texto, setTexto] = useState(textoDaQuantidade(valor))

  function confirmar() {
    let q = lerValorDigitado(texto)
    if (!fracionavel) q = Math.round(q)
    q = arredondarQuantidade(q)
    if (q === valor) { setTexto(textoDaQuantidade(valor)); return }
    onConfirmar(q)
  }

  return (
    <input
      inputMode={fracionavel ? 'decimal' : 'numeric'}
      value={texto}
      onChange={e => setTexto(e.target.value)}
      onBlur={confirmar}
      onFocus={e => e.currentTarget.select()}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      aria-label="Quantidade"
      style={{
        width: 40, height: 28, textAlign: 'center', background: 'var(--gray-900)', border: 0,
        borderInline: '1px solid var(--gray-700)', fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
        fontWeight: 700, color: 'var(--gray-100)', outline: 'none',
      }}
    />
  )
}
