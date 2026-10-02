'use client'

import type { ReactNode } from 'react'
import { IconClose } from '@/components/icons'

// Peças do app (petshop-mobile/src/components) para as telas do site no
// celular: mesmo desenho e mesmo jeito de usar de lá. O visual fica nas
// classes *-app do globals.css.

// Fileira de botões pequenos pra escolher um entre poucos (Segmentos).
export function Segmentos<T extends string>({ opcoes, valor, onChange }: {
  opcoes: { valor: T; rotulo: string }[]
  valor: T | null
  onChange: (v: T) => void
}) {
  return (
    <div className="segmentos-app">
      {opcoes.map(o => (
        <button
          key={o.valor}
          type="button"
          className={`segmento-app ${o.valor === valor ? 'is-ativo' : ''}`}
          aria-pressed={o.valor === valor}
          onClick={() => onChange(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

// Linha "rótulo + liga/desliga" (LinhaSwitch).
export function LinhaSwitch({ titulo, detalhe, valor, onChange, desativado }: {
  titulo: string
  detalhe?: string
  valor: boolean
  onChange: (v: boolean) => void
  desativado?: boolean
}) {
  return (
    <div className="linha-switch-app">
      <div>
        <strong className={desativado ? 'is-apagado' : ''}>{titulo}</strong>
        {detalhe && <span>{detalhe}</span>}
      </div>
      <button
        type="button"
        className={`switch ${valor ? 'switch-on' : ''}`}
        onClick={() => onChange(!valor)}
        disabled={desativado}
        role="switch"
        aria-checked={valor}
        aria-label={titulo}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}

// Linha de escolha única (Opcao): a marcada ganha borda índigo e a bolinha cheia.
export function Opcao({ titulo, detalhe, lateral, selecionada, onClick, desativada }: {
  titulo: string
  detalhe?: string
  lateral?: string
  selecionada: boolean
  onClick: () => void
  desativada?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selecionada}
      className={`opcao-linha-app ${selecionada ? 'is-selecionada' : ''}`}
      onClick={onClick}
      disabled={desativada}
    >
      <i aria-hidden="true" />
      <span>
        <strong>{titulo}</strong>
        {detalhe && <small>{detalhe}</small>}
      </span>
      {lateral && <b>{lateral}</b>}
    </button>
  )
}

// Painel que sobe de baixo (Folha). No computador é a janela comum.
export function Folha({ titulo, onFechar, ocupado, semSubir, children }: {
  titulo: string
  onFechar: () => void
  // Enquanto salva, tocar fora ou no X não fecha.
  ocupado?: boolean
  // Troca de aba dentro do painel: não repete a subida.
  semSubir?: boolean
  children: ReactNode
}) {
  const fechar = () => { if (!ocupado) onFechar() }
  return (
    <div className="modal-overlay" onClick={fechar}>
      <div className={`modal folha-app ${semSubir ? 'sem-subir' : ''}`} style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{titulo}</h3>
          <button type="button" className="modal-close" onClick={fechar} aria-label="Fechar" disabled={ocupado}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// Pergunta de confirmação (o "dialogo" do app).
export function Confirmacao({ titulo, mensagem, confirmar, ocupado, onConfirmar, onFechar }: {
  titulo: string
  mensagem: string
  confirmar: string
  ocupado?: boolean
  onConfirmar: () => void
  onFechar: () => void
}) {
  return (
    <div className="dialogo-app-fundo" onClick={() => { if (!ocupado) onFechar() }}>
      <div className="dialogo-app" role="alertdialog" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <h3>{titulo}</h3>
        <p>{mensagem}</p>
        {/* A ação em cima; "Voltar" sempre por último. */}
        <div>
          <button type="button" className="is-perigo" onClick={onConfirmar} disabled={ocupado}>{confirmar}</button>
          <button type="button" onClick={onFechar} disabled={ocupado}>Voltar</button>
        </div>
      </div>
    </div>
  )
}
