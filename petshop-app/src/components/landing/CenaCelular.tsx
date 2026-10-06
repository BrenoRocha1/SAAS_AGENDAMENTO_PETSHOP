'use client'

import { useEffect, useRef } from 'react'
import './cena-celular.css'

/* ------------------------------------------------------------------ *
 * Celular 3D da landing: um celular flutuando com a tela de agendamento
 * (a hora escolhida e o botão "se mexem" sozinhos), três cartões e um
 * cubo girando. O palco inclina com o mouse (computador) ou com o dedo
 * (celular) — escreve direto em variáveis CSS, sem re-render.
 *
 * Veio do redesenho da landing feito pelo Breno (commit a10683d), onde
 * se chamava HeroScene; o Pedro quis manter só esta peça na landing
 * anterior. Decorativa: o leitor de tela pula (aria-hidden).
 * ------------------------------------------------------------------ */
export default function CenaCelular() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scene = sceneRef.current
    const stage = stageRef.current
    if (!scene || !stage) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let tx = 0
    let ty = 0
    const apply = () => {
      stage.style.setProperty('--ry', `${tx * 16}deg`)
      stage.style.setProperty('--rx', `${ty * -12}deg`)
      raf = 0
    }
    const move = (clientX: number, clientY: number) => {
      const r = scene.getBoundingClientRect()
      tx = Math.max(-1, Math.min(1, (clientX - r.left) / r.width - 0.5)) * 2
      ty = Math.max(-1, Math.min(1, (clientY - r.top) / r.height - 0.5)) * 2
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const reset = () => {
      tx = 0
      ty = 0
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onMouse = (e: MouseEvent) => move(e.clientX, e.clientY)
    const onTouch = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY)

    window.addEventListener('mousemove', onMouse)
    scene.addEventListener('touchmove', onTouch, { passive: true })
    scene.addEventListener('touchend', reset)
    scene.addEventListener('mouseleave', reset)
    return () => {
      window.removeEventListener('mousemove', onMouse)
      scene.removeEventListener('touchmove', onTouch)
      scene.removeEventListener('touchend', reset)
      scene.removeEventListener('mouseleave', reset)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="lpc-scene" ref={sceneRef} aria-hidden="true">
      <div className="lpc-stage" ref={stageRef}>
        <div className="lpc-float">
          {/* fundo em camadas (profundidade negativa) */}
          <div className="lpc-orb lpc-orb--a" />
          <div className="lpc-orb lpc-orb--b" />
          <div className="lpc-ring lpc-ring--1" />
          <div className="lpc-ring lpc-ring--2" />

          {/* celular */}
          <div className="lpc-phone">
            <div className="lpc-phone-notch" />
            <div className="lpc-phone-screen">
              <div className="lpc-ph-head">
                <span className="lpc-ph-logo">🐾</span>
                <div>
                  <strong>Pet Shop Amigo</strong>
                  <small>Agende em 30 segundos</small>
                </div>
              </div>
              <div className="lpc-ph-label">Quem vai ser atendido?</div>
              <div className="lpc-ph-pets">
                <span className="is-on">🐶 Thor</span>
                <span>🐱 Mia</span>
              </div>
              <div className="lpc-ph-label">Serviço</div>
              <div className="lpc-ph-service">
                <span>Banho &amp; Tosa</span>
                <b>R$ 85</b>
              </div>
              <div className="lpc-ph-label">Horário</div>
              <div className="lpc-ph-slots">
                <span>09:00</span>
                <span className="lpc-slot-pick">10:30</span>
                <span>14:00</span>
                <span>15:30</span>
              </div>
              <div className="lpc-ph-btn">Confirmar agendamento</div>
              <div className="lpc-ph-toast">✓ Agendado! Thor já tem horário</div>
            </div>
          </div>

          {/* cartões flutuando em alturas diferentes */}
          <div className="lpc-chip lpc-chip--1">
            <span className="lpc-chip-ico lpc-chip-ico--mint">✓</span>
            <div>
              <b>Agendamento aceito</b>
              <small>Thor • hoje, 10:30</small>
            </div>
          </div>
          <div className="lpc-chip lpc-chip--2">
            <span className="lpc-chip-ico lpc-chip-ico--sun">🚐</span>
            <div>
              <b>TaxiDog a caminho</b>
              <small>chega em 8 min</small>
            </div>
          </div>
          <div className="lpc-chip lpc-chip--3">
            <span className="lpc-chip-ico lpc-chip-ico--coral">★</span>
            <div>
              <b>Nova avaliação</b>
              <small>5 estrelas</small>
            </div>
          </div>

          {/* cubo 3D girando */}
          <div className="lpc-cube">
            <i>🐶</i>
            <i>🐱</i>
            <i>🐾</i>
            <i>🛁</i>
            <i>✂️</i>
            <i>🦴</i>
          </div>
        </div>
      </div>
    </div>
  )
}
