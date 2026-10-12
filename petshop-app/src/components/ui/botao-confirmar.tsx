'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

// Botão de confirmar com estados animados: normal → salvando (girando) →
// ✓ concluído (verde) / erro (vermelho) → volta ao normal. Mesmo desenho
// dos botões do projeto (.btn .btn-primary etc.); só o conteúdo anima.

export type EstadoBotao = 'idle' | 'pending' | 'success' | 'error'

const TROCA = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const
const TOQUE = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const
const INSTANTE = { duration: 0 } as const

// Controle do estado do botão para formulários que já fazem o envio:
//   const b = useEstadoBotao()
//   b.iniciar(); const r = await salvar(); r.error ? b.erro() : await b.sucesso()
// `sucesso()` espera o ✓ aparecer antes de resolver (para fechar a janela depois).
export function useEstadoBotao(voltarEm = 1400) {
  const [estado, setEstado] = useState<EstadoBotao>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vivo = useRef(true)
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; if (timer.current) clearTimeout(timer.current) } }, [])

  const limpar = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const iniciar = useCallback(() => { limpar(); setEstado('pending') }, [])
  const erro = useCallback(() => {
    limpar()
    setEstado('error')
    timer.current = setTimeout(() => { if (vivo.current) setEstado('idle') }, voltarEm)
  }, [voltarEm])
  const sucesso = useCallback((esperar = 650) => {
    limpar()
    setEstado('success')
    timer.current = setTimeout(() => { if (vivo.current) setEstado('idle') }, voltarEm)
    return new Promise<void>(r => setTimeout(r, esperar))
  }, [voltarEm])
  const resetar = useCallback(() => { limpar(); setEstado('idle') }, [])

  // Junta com o isPending do useTransition: ✓/erro têm prioridade (o ✓ aparece
  // ainda dentro da transição, antes de fechar a janela).
  const estadoCom = useCallback((pendente: boolean): EstadoBotao => (estado !== 'idle' ? estado : pendente ? 'pending' : 'idle'), [estado])

  return { estado, estadoCom, iniciar, sucesso, erro, resetar, pendente: estado === 'pending' }
}

function Girando({ parado }: { parado: boolean }) {
  return (
    <motion.svg
      width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}
      animate={parado ? undefined : { rotate: 360 }}
      transition={parado ? undefined : { duration: 0.85, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
      <path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </motion.svg>
  )
}
function Certo() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M2.6 6.3 4.9 8.6 9.4 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function Alerta() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6 2.9v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6 9.05h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

export default function BotaoConfirmar({
  estado,
  children,
  rotuloPendente,
  rotuloSucesso = 'Salvo',
  rotuloErro = 'Tente de novo',
  type = 'submit',
  onClick,
  disabled = false,
  className = 'btn btn-primary',
  style,
  id,
}: {
  estado: EstadoBotao
  children: string
  rotuloPendente?: string
  rotuloSucesso?: string
  rotuloErro?: string
  type?: 'submit' | 'button'
  onClick?: () => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  id?: string
}) {
  const reduzido = useReducedMotion()
  const troca = reduzido ? INSTANTE : TROCA
  const pendente = estado === 'pending'
  const rotulo = estado === 'pending' ? (rotuloPendente ?? children) : estado === 'success' ? rotuloSucesso : estado === 'error' ? rotuloErro : children

  const faces: { chave: EstadoBotao; texto: string; icone: React.ReactNode }[] = [
    { chave: 'idle', texto: children, icone: null },
    { chave: 'pending', texto: rotuloPendente ?? children, icone: <Girando parado={reduzido === true || !pendente} /> },
    { chave: 'success', texto: rotuloSucesso, icone: <Certo /> },
    { chave: 'error', texto: rotuloErro, icone: <Alerta /> },
  ]

  return (
    <>
      <motion.button
        id={id}
        type={type}
        // Travado enquanto salva e no ✓ (evita enviar duas vezes, inclusive com Enter).
        disabled={disabled || pendente || estado === 'success'}
        aria-label={rotulo}
        aria-busy={pendente || undefined}
        whileTap={disabled || pendente || reduzido ? undefined : { y: 1 }}
        transition={TOQUE}
        onClick={e => {
          if (pendente) { e.preventDefault(); return }
          onClick?.()
        }}
        className={`${className} botao-confirmar is-${estado}`}
        style={{ touchAction: 'manipulation', ...style }}
      >
        <span aria-hidden className="botao-confirmar-faces">
          {faces.map(f => (
            <motion.span
              key={f.chave}
              initial={false}
              animate={f.chave === estado ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 3, filter: 'blur(3px)' }}
              transition={troca}
              className="botao-confirmar-face"
            >
              {f.icone}
              {f.texto}
            </motion.span>
          ))}
        </span>
      </motion.button>
      <span role="status" aria-live="polite" className="sr-only">
        {estado === 'success' ? rotuloSucesso : estado === 'error' ? rotuloErro : ''}
      </span>
    </>
  )
}
