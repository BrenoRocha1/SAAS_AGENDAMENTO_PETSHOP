'use client'

import type { CSSProperties } from 'react'
import type { IconUser } from '@/components/icons'
import './quadro.css'

// Filtro da barra do quadro numa etiqueta: mostra o que está escolhido (ou
// "Todos os…"; no celular, só o nome curto) e, ao tocar, abre a lista do
// próprio navegador — o <select> fica invisível por cima.
export function FiltroChip({ icone: Icone, rotulo, todos, valor, onChange, opcoes }: {
  icone: typeof IconUser
  // Nome curto do filtro ("Profissional"): o que aparece no celular sem nada escolhido.
  rotulo: string
  // A opção de não filtrar ("Todos os profissionais").
  todos: string
  valor: string
  onChange: (valor: string) => void
  opcoes: { valor: string; rotulo: string }[]
}) {
  const escolhida = opcoes.find(o => o.valor === valor)
  return (
    <label className={`filtro-chip ${escolhida ? 'is-ativo' : ''}`}>
      <Icone />
      <span className="filtro-chip-texto">
        {escolhida ? escolhida.rotulo : (
          <>
            <span className="filtro-chip-longo">{todos}</span>
            <span className="filtro-chip-curto">{rotulo}</span>
          </>
        )}
      </span>
      <select value={valor} onChange={e => onChange(e.target.value)} aria-label={rotulo}>
        <option value="">{todos}</option>
        {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    </label>
  )
}

// As etapas do quadro em abas (só no celular, até 768px): a contagem em
// cima, o nome embaixo e a cor da etapa no traço de cima.
export function EtapasDoQuadro<T extends string>({ etapas, valor, onChange }: {
  etapas: { id: T; rotulo: string; total: number; cor: string }[]
  valor: T
  onChange: (id: T) => void
}) {
  return (
    <div className="quadro-etapas" role="tablist" aria-label="Etapas">
      {etapas.map(e => (
        <button
          key={e.id}
          type="button"
          role="tab"
          aria-selected={e.id === valor}
          className={`quadro-etapa ${e.id === valor ? 'is-ativa' : ''}`}
          style={{ '--cor-etapa': e.cor } as CSSProperties}
          onClick={() => onChange(e.id)}
        >
          <strong>{e.total}</strong>
          <span>{e.rotulo}</span>
        </button>
      ))}
    </div>
  )
}
