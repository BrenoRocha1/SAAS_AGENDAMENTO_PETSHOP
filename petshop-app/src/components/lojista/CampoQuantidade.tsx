'use client'

import { useState } from 'react'
import { rotuloUnidade, SUBUNIDADE, unidadeFracionavel, type UnidadeVenda } from '@/lib/produto'

interface Props {
  name: string
  label: string
  required?: boolean
  unidadeVenda: string
  valorInicial?: number
  autoFocus?: boolean
  hint?: string
}

// Campo numérico com opção de digitar na sub-unidade (g/ml) quando a
// unidade de venda do produto é kg/litro — ex.: digitar "500" e escolher
// "g" em vez de precisar acertar "0,5" em kg de cabeça. Quem vende
// ração/shampoo no kg/litro às vezes atende um pedido de 500g, não meio
// quilo redondo.
//
// O campo visível não tem `name` — quem carrega o valor de verdade é o
// input escondido, já convertido pra unidade BASE do produto (a única
// que fica salva no banco). Assim a action que recebe o FormData do
// formulário-pai nem sabe que essa troca de unidade existiu.
export default function CampoQuantidade({ name, label, required, unidadeVenda, valorInicial, autoFocus, hint }: Props) {
  const sub = SUBUNIDADE[unidadeVenda as UnidadeVenda]
  const [usarSub, setUsarSub] = useState(false)
  const [texto, setTexto] = useState(valorInicial != null ? String(valorInicial) : '')

  const numerico = parseFloat(texto)
  const convertido = texto.trim() === '' || isNaN(numerico) ? '' : String(usarSub && sub ? numerico * sub.fator : numerico)

  return (
    <div className="form-group">
      <div className="flex items-center justify-between">
        <label htmlFor={`campo-${name}`} className={`form-label ${required ? 'form-label-required' : ''}`} style={{ margin: 0 }}>
          {label}
        </label>
        {sub && (
          <div className="flex gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontWeight: !usarSub ? 700 : 400 }}
              onClick={() => setUsarSub(false)}
            >
              {rotuloUnidade(unidadeVenda)}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontWeight: usarSub ? 700 : 400 }}
              onClick={() => setUsarSub(true)}
            >
              {sub.label}
            </button>
          </div>
        )}
      </div>
      <input
        id={`campo-${name}`}
        type="number"
        className="form-input"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="0"
        step={usarSub || !unidadeFracionavel(unidadeVenda) ? '1' : '0.001'}
        min="0"
        required={required}
        autoFocus={autoFocus}
      />
      <input type="hidden" name={name} value={convertido} />
      {hint && <p className="text-xs text-muted" style={{ margin: 0 }}>{hint}</p>}
    </div>
  )
}
