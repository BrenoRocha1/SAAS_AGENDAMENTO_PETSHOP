'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Configurações que salvam sozinhas: a cada mudança (com uma pausa curta
// para não salvar a cada tecla) chama `salvar`. Ao sair da tela com algo
// pendente, salva na hora. Mostra "Salvando…" e depois "✓ Salvo" em verde (fica até a próxima mudança).

export type EstadoAutoSalvar = 'ocioso' | 'salvando' | 'salvo' | 'erro'

export function useSalvarSozinho<T>({
  valores,
  salvar,
  pronto = true,
  espera = 700,
}: {
  // O que está na tela agora; muda → salva.
  valores: T
  salvar: (v: T) => Promise<{ error?: string } | undefined | void>
  // false = ainda não dá para salvar (ex.: campo obrigatório vazio).
  pronto?: boolean
  espera?: number
}) {
  const [estado, setEstado] = useState<EstadoAutoSalvar>('ocioso')
  const [erro, setErro] = useState<string | null>(null)
  const chave = JSON.stringify(valores)
  const salvoRef = useRef(chave)
  const pendenteRef = useRef<{ chave: string; valores: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const salvarRef = useRef(salvar)
  useEffect(() => { salvarRef.current = salvar })

  const executar = useCallback(async () => {
    const p = pendenteRef.current
    if (!p) return
    pendenteRef.current = null
    setEstado('salvando')
    setErro(null)
    try {
      const r = await salvarRef.current(p.valores)
      if (r && r.error) { setEstado('erro'); setErro(r.error); return }
      salvoRef.current = p.chave
      setEstado(atual => (pendenteRef.current ? atual : 'salvo'))
    } catch {
      setEstado('erro')
      setErro('Não foi possível salvar. Tente de novo.')
    }
  }, [])

  useEffect(() => {
    if (chave === salvoRef.current || !pronto) return
    pendenteRef.current = { chave, valores }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void executar() }, espera)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `valores` é representado por `chave`
  }, [chave, pronto, espera, executar])

  // Saindo da tela (ou trocando de aba) com algo pendente: salva já.
  useEffect(() => {
    const agora = () => { if (pendenteRef.current) { if (timer.current) clearTimeout(timer.current); void executar() } }
    const aoOcultar = () => { if (document.visibilityState === 'hidden') agora() }
    document.addEventListener('visibilitychange', aoOcultar)
    window.addEventListener('pagehide', agora)
    return () => {
      document.removeEventListener('visibilitychange', aoOcultar)
      window.removeEventListener('pagehide', agora)
      agora()
    }
  }, [executar])

  // Salvar já (ex.: ao sair de um campo).
  const salvarAgora = useCallback(() => {
    if (!pendenteRef.current) return
    if (timer.current) clearTimeout(timer.current)
    void executar()
  }, [executar])

  return { estado, erro, salvarAgora }
}

// `flutuante`: fixo no canto da tela (formulários compridos).
export function IndicadorSalvo({ estado, erro, flutuante }: { estado: EstadoAutoSalvar; erro?: string | null; flutuante?: boolean }) {
  return (
    <span className={`indicador-salvo${flutuante ? ' is-flutuante' : ''}`} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {estado === 'salvando' && (
          <motion.span key="s" className="is-salvando" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}>
            <motion.svg width="12" height="12" viewBox="0 0 12 12" fill="none" animate={{ rotate: 360 }} transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
              <path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </motion.svg>
            Salvando…
          </motion.span>
        )}
        {estado === 'salvo' && (
          <motion.span key="ok" className="is-salvo" initial={{ opacity: 0, y: 3, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.6 6.3 4.9 8.6 9.4 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Salvo
          </motion.span>
        )}
        {estado === 'erro' && (
          <motion.span key="e" className="is-erro" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {erro ?? 'Não foi possível salvar'}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
