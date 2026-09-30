'use client'

import { useEffect, useRef } from 'react'

// Arrastar com o dedo (celular/tablet). O arrastar-e-soltar nativo do HTML5
// (draggable/onDrop) só funciona com mouse. Aqui: segurar o card ~0,35 s
// "pega" o card (se o dedo andar antes disso, é rolagem normal da página);
// uma cópia do card segue o dedo, a página (ou a coluna) rola sozinha perto
// das bordas e, ao soltar, onSoltar recebe o alvo embaixo do dedo — o
// elemento mais próximo com o atributo data-alvo-toque.

const ESPERA_MS = 350
const TOLERANCIA_PX = 10
const BORDA_ROLAGEM_PX = 70
const VELOCIDADE_ROLAGEM = 14

interface Opcoes {
  aoIniciar: (id: string) => void
  aoMudarAlvo: (id: string, alvo: string | null) => void
  aoSoltar: (id: string, alvo: string | null) => void
  aoEncerrar: () => void
}

interface Gesto {
  id: string
  el: HTMLElement
  x0: number
  y0: number
  x: number
  y: number
  ativo: boolean
  alvo: string | null
  fantasma: HTMLElement | null
  dx: number
  dy: number
  timer: ReturnType<typeof setTimeout> | null
  rolagem: ReturnType<typeof setInterval> | null
  // As funções registradas no document (para remover as mesmas).
  ouvintes: { mover: (ev: TouchEvent) => void; soltar: (ev: TouchEvent) => void; cancelar: () => void }
}

// Rolável na vertical embaixo do ponto (coluna do Kanban no tablet).
function rolavelEm(x: number, y: number): HTMLElement | null {
  let el = document.elementFromPoint(x, y) as HTMLElement | null
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
    el = el.parentElement
  }
  return null
}

export function useArrastarToque(opcoes: Opcoes) {
  const opcoesRef = useRef(opcoes)
  useEffect(() => { opcoesRef.current = opcoes })
  const gestoRef = useRef<Gesto | null>(null)

  function alvoEm(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-alvo-toque]')
    return el?.getAttribute('data-alvo-toque') ?? null
  }

  function atualizarAlvo(g: Gesto) {
    const alvo = alvoEm(g.x, g.y)
    if (alvo !== g.alvo) {
      g.alvo = alvo
      opcoesRef.current.aoMudarAlvo(g.id, alvo)
    }
  }

  function posicionarFantasma(g: Gesto) {
    if (g.fantasma) g.fantasma.style.transform = `translate(${g.x - g.dx}px, ${g.y - g.dy}px) rotate(2deg)`
  }

  // Rola a página (ou a coluna) enquanto o dedo está perto da borda.
  function rolar() {
    const g = gestoRef.current
    if (!g || !g.ativo) return
    let rolou = false
    if (g.y < BORDA_ROLAGEM_PX) { window.scrollBy(0, -VELOCIDADE_ROLAGEM); rolou = true }
    else if (g.y > window.innerHeight - BORDA_ROLAGEM_PX) { window.scrollBy(0, VELOCIDADE_ROLAGEM); rolou = true }
    const caixa = rolavelEm(g.x, g.y)
    if (caixa) {
      const r = caixa.getBoundingClientRect()
      if (g.y < r.top + 40) { caixa.scrollTop -= VELOCIDADE_ROLAGEM; rolou = true }
      else if (g.y > r.bottom - 40) { caixa.scrollTop += VELOCIDADE_ROLAGEM; rolou = true }
    }
    // O conteúdo andou embaixo do dedo parado: o alvo pode ter mudado.
    if (rolou) atualizarAlvo(g)
  }

  function encerrar() {
    const g = gestoRef.current
    if (!g) return
    if (g.timer) clearTimeout(g.timer)
    if (g.rolagem) clearInterval(g.rolagem)
    g.fantasma?.remove()
    document.removeEventListener('touchmove', g.ouvintes.mover)
    document.removeEventListener('touchend', g.ouvintes.soltar)
    document.removeEventListener('touchcancel', g.ouvintes.cancelar)
    gestoRef.current = null
    if (g.ativo) opcoesRef.current.aoEncerrar()
  }

  function ativar() {
    const g = gestoRef.current
    if (!g) return
    g.timer = null
    g.ativo = true
    const r = g.el.getBoundingClientRect()
    g.dx = g.x - r.left
    g.dy = g.y - r.top
    const fantasma = g.el.cloneNode(true) as HTMLElement
    fantasma.classList.add('arrastar-toque-fantasma')
    fantasma.setAttribute('aria-hidden', 'true')
    fantasma.style.width = `${r.width}px`
    document.body.appendChild(fantasma)
    g.fantasma = fantasma
    posicionarFantasma(g)
    try { navigator.vibrate?.(15) } catch { /* sem vibração */ }
    opcoesRef.current.aoIniciar(g.id)
    atualizarAlvo(g)
    // Intervalo (não requestAnimationFrame): continua rodando mesmo se o
    // navegador pausar a pintura da página.
    g.rolagem = setInterval(rolar, 16)
  }

  function aoMover(ev: TouchEvent) {
    const g = gestoRef.current
    const t = ev.touches[0]
    if (!g || !t) return
    g.x = t.clientX
    g.y = t.clientY
    if (!g.ativo) {
      // Andou antes de "pegar": é rolagem — deixa a página rolar.
      if (Math.hypot(g.x - g.x0, g.y - g.y0) > TOLERANCIA_PX) encerrar()
      return
    }
    ev.preventDefault()
    posicionarFantasma(g)
    atualizarAlvo(g)
  }

  function aoSoltarDedo(ev: TouchEvent) {
    const g = gestoRef.current
    if (!g) return
    if (g.ativo) {
      // Sem isso o toque vira também um clique (abriria o detalhe do card).
      ev.preventDefault()
      const { id, alvo } = g
      encerrar()
      opcoesRef.current.aoSoltar(id, alvo)
      return
    }
    encerrar()
  }

  // Saiu da tela no meio do gesto: limpa listeners e a cópia do card.
  useEffect(() => () => encerrar(), [])

  return {
    // No onTouchStart do card que pode ser arrastado.
    iniciar(e: React.TouchEvent<HTMLElement>, id: string) {
      if (e.touches.length !== 1 || gestoRef.current) return
      const t = e.touches[0]
      const ouvintes = { mover: aoMover, soltar: aoSoltarDedo, cancelar: encerrar }
      gestoRef.current = {
        id, el: e.currentTarget, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY,
        ativo: false, alvo: null, fantasma: null, dx: 0, dy: 0, timer: setTimeout(ativar, ESPERA_MS), rolagem: null, ouvintes,
      }
      document.addEventListener('touchmove', ouvintes.mover, { passive: false })
      document.addEventListener('touchend', ouvintes.soltar, { passive: false })
      document.addEventListener('touchcancel', ouvintes.cancelar)
    },
    // Um toque está em curso (esperando ou arrastando) — para o card
    // ignorar o arrastar nativo e o menu de toque longo.
    emAndamento() {
      return gestoRef.current !== null
    },
  }
}
