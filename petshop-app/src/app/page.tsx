'use client'

// OBS: não exportar `metadata` aqui — este arquivo é 'use client' e isso
// quebra o build. O metadata da home vem do layout.tsx.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import './landing.css'

/* ------------------------------------------------------------------ *
 * Revelar ao rolar (IntersectionObserver) — usa só classes, sem state.
 * ------------------------------------------------------------------ */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = root.querySelectorAll('[data-reveal]')
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(t => t.classList.add('is-in'))
      return
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )
    targets.forEach(t => io.observe(t))
    return () => io.disconnect()
  }, [])
  return ref
}

/* ------------------------------------------------------------------ *
 * Cena 3D do hero: o palco inclina com o mouse (desktop) ou com o dedo
 * (celular). Escreve direto em CSS vars — nenhum re-render por movimento.
 * ------------------------------------------------------------------ */
function HeroScene() {
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
    <div className="lp-scene" ref={sceneRef} aria-hidden="true">
      <div className="lp-stage" ref={stageRef}>
        <div className="lp-float">
          {/* fundo em camadas (profundidade negativa) */}
          <div className="lp-orb lp-orb--a" />
          <div className="lp-orb lp-orb--b" />
          <div className="lp-ring lp-ring--1" />
          <div className="lp-ring lp-ring--2" />

          {/* celular */}
          <div className="lp-phone">
            <div className="lp-phone-notch" />
            <div className="lp-phone-screen">
              <div className="lp-ph-head">
                <span className="lp-ph-logo">🐾</span>
                <div>
                  <strong>Pet Shop Amigo</strong>
                  <small>Agende em 30 segundos</small>
                </div>
              </div>
              <div className="lp-ph-label">Quem vai ser atendido?</div>
              <div className="lp-ph-pets">
                <span className="is-on">🐶 Thor</span>
                <span>🐱 Mia</span>
              </div>
              <div className="lp-ph-label">Serviço</div>
              <div className="lp-ph-service">
                <span>Banho &amp; Tosa</span>
                <b>R$ 85</b>
              </div>
              <div className="lp-ph-label">Horário</div>
              <div className="lp-ph-slots">
                <span>09:00</span>
                <span className="lp-slot-pick">10:30</span>
                <span>14:00</span>
                <span>15:30</span>
              </div>
              <div className="lp-ph-btn">Confirmar agendamento</div>
              <div className="lp-ph-toast">✓ Agendado! Thor já tem horário</div>
            </div>
          </div>

          {/* cartões flutuando em alturas diferentes */}
          <div className="lp-chip lp-chip--1">
            <span className="lp-chip-ico lp-chip-ico--mint">✓</span>
            <div>
              <b>Agendamento aceito</b>
              <small>Thor • hoje, 10:30</small>
            </div>
          </div>
          <div className="lp-chip lp-chip--2">
            <span className="lp-chip-ico lp-chip-ico--sun">🚐</span>
            <div>
              <b>TaxiDog a caminho</b>
              <small>chega em 8 min</small>
            </div>
          </div>
          <div className="lp-chip lp-chip--3">
            <span className="lp-chip-ico lp-chip-ico--coral">★</span>
            <div>
              <b>Nova avaliação</b>
              <small>5 estrelas</small>
            </div>
          </div>

          {/* cubo 3D girando */}
          <div className="lp-cube">
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

/* ------------------------------------------------------------------ *
 * Card com inclinação 3D (só com mouse — em toque fica estático).
 * ------------------------------------------------------------------ */
function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--tx', `${(-y * 10).toFixed(2)}deg`)
    el.style.setProperty('--ty', `${(x * 12).toFixed(2)}deg`)
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`)
    el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`)
  }
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--tx', '0deg')
    el.style.setProperty('--ty', '0deg')
  }
  return (
    <div ref={ref} className={`lp-tilt ${className}`} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="lp-tilt-glow" />
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Dados
 * ------------------------------------------------------------------ */
const FEATURES = [
  {
    ico: '📅',
    title: 'Agenda que não dá conflito',
    text: 'Horários, duração de cada serviço e a equipe disponível entram na conta. O cliente só vê o que realmente dá pra atender.',
    tone: 'violet',
  },
  {
    ico: '🔗',
    title: 'Link de agendamento próprio',
    text: 'Cole o link na bio do Instagram. O tutor escolhe o pet, o serviço e o horário sozinho, sem instalar nada.',
    tone: 'coral',
  },
  {
    ico: '🚐',
    title: 'TaxiDog com rotas',
    text: 'Busca e entrega dos pets com kanban de corridas e rota montada para o motorista, direto no celular.',
    tone: 'sun',
  },
  {
    ico: '💳',
    title: 'Planos e pagamentos',
    text: 'Venda pacotes de banho, controle os benefícios usados e veja o que já foi pago, sem planilha.',
    tone: 'mint',
  },
  {
    ico: '👥',
    title: 'Equipe com acesso rápido',
    text: 'Cada funcionário entra com um código temporário gerado por você. Sem senha para esquecer ou compartilhar.',
    tone: 'violet',
  },
  {
    ico: '📊',
    title: 'Relatórios de verdade',
    text: 'Faturamento, serviços mais vendidos e desempenho por profissional, por período, em poucos toques.',
    tone: 'coral',
  },
]

const STEPS = [
  { n: '1', t: 'Cadastre sua loja', d: 'Serviços, preços, horários e equipe. Leva poucos minutos.', ico: '🏪' },
  { n: '2', t: 'Divulgue seu link', d: 'Coloque na bio, no status e no Google. Os clientes agendam sozinhos.', ico: '🔗' },
  { n: '3', t: 'Atenda e acompanhe', d: 'Agenda, kanban, pagamentos e relatórios no mesmo painel.', ico: '✨' },
]

const SHOWCASE = [
  { name: 'Agenda', kind: 'agenda' },
  { name: 'Kanban', kind: 'kanban' },
  { name: 'TaxiDog', kind: 'taxi' },
  { name: 'Relatórios', kind: 'bars' },
  { name: 'Planos', kind: 'plans' },
] as const

function ShowcaseMock({ kind }: { kind: (typeof SHOWCASE)[number]['kind'] }) {
  if (kind === 'agenda')
    return (
      <div className="lp-mock-list">
        {[
          ['09:00', 'Thor', 'Banho e tosa'],
          ['10:30', 'Mia', 'Banho'],
          ['14:00', 'Bidu', 'Tosa higiênica'],
        ].map(r => (
          <div key={r[0]} className="lp-mock-row">
            <b>{r[0]}</b>
            <span>
              {r[1]}
              <small>{r[2]}</small>
            </span>
          </div>
        ))}
      </div>
    )
  if (kind === 'kanban')
    return (
      <div className="lp-mock-kanban">
        {['Aceito', 'Em andamento', 'Pronto'].map((c, i) => (
          <div key={c}>
            <small>{c}</small>
            {Array.from({ length: 3 - i }).map((_, j) => (
              <span key={j} />
            ))}
          </div>
        ))}
      </div>
    )
  if (kind === 'taxi')
    return (
      <div className="lp-mock-taxi">
        <svg viewBox="0 0 200 110" fill="none">
          <path d="M14 92 C 50 20, 90 100, 120 50 S 175 30, 186 16" stroke="url(#g)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 9" />
          <defs>
            <linearGradient id="g" x1="0" x2="1">
              <stop stopColor="#ffc857" />
              <stop offset="1" stopColor="#ff7a59" />
            </linearGradient>
          </defs>
          <circle cx="14" cy="92" r="7" fill="#2ec4a0" />
          <circle cx="186" cy="16" r="7" fill="#ff7a59" />
        </svg>
        <small>Rota do dia • 4 paradas</small>
      </div>
    )
  if (kind === 'bars')
    return (
      <div className="lp-mock-bars">
        {[40, 62, 48, 80, 70, 94].map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
    )
  return (
    <div className="lp-mock-plans">
      <b>Plano Banho Mensal</b>
      <div>
        <i style={{ width: '65%' }} />
      </div>
      <small>3 de 4 banhos usados</small>
    </div>
  )
}

/* ================================================================== *
 * LANDING
 * ================================================================== */
export default function LandingPage() {
  const rootRef = useReveal()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Trava a rolagem do fundo com o menu mobile aberto.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const fechar = () => setMenuOpen(false)

  return (
    <div className="lp" ref={rootRef}>
      {/* ── NAV ── */}
      <nav className={`lp-nav ${scrolled || menuOpen ? 'is-solid' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-brand" onClick={fechar}>
            <span className="lp-brand-ico">🐾</span>
            SAIP
          </Link>

          <ul className="lp-nav-links">
            <li><a href="#recursos">Recursos</a></li>
            <li><a href="#como-funciona">Como funciona</a></li>
            <li><a href="#telas">Telas</a></li>
          </ul>

          <div className="lp-nav-cta">
            <Link href="/login" className="lp-btn lp-btn--ghost">Entrar</Link>
            <Link href="/cadastro/lojista" className="lp-btn lp-btn--primary">Começar grátis</Link>
          </div>

          <button
            className={`lp-burger ${menuOpen ? 'is-open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>

        <div className={`lp-drawer ${menuOpen ? 'is-open' : ''}`}>
          <a href="#recursos" onClick={fechar}>Recursos</a>
          <a href="#como-funciona" onClick={fechar}>Como funciona</a>
          <a href="#telas" onClick={fechar}>Telas</a>
          <Link href="/login" className="lp-btn lp-btn--ghost" onClick={fechar}>Entrar</Link>
          <Link href="/cadastro/lojista" className="lp-btn lp-btn--primary" onClick={fechar}>Começar grátis</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="lp-hero">
        <div className="lp-blob lp-blob--1" />
        <div className="lp-blob lp-blob--2" />
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-badge" data-reveal>🐶 Agendamento para banho e tosa</span>
            <h1 className="lp-h1" data-reveal style={{ '--d': '80ms' } as React.CSSProperties}>
              Seu petshop cheio,<br />
              <span className="lp-grad">sem o telefone</span> tocando o dia todo.
            </h1>
            <p className="lp-lead" data-reveal style={{ '--d': '160ms' } as React.CSSProperties}>
              Seus clientes agendam sozinhos pelo celular em 30 segundos. Você organiza a agenda,
              a equipe, o TaxiDog e o caixa em um só lugar.
            </p>
            <div className="lp-hero-actions" data-reveal style={{ '--d': '240ms' } as React.CSSProperties}>
              <Link href="/cadastro/lojista" className="lp-btn lp-btn--primary lp-btn--lg">Criar minha loja grátis</Link>
              <a href="#telas" className="lp-btn lp-btn--outline lp-btn--lg">Ver o sistema</a>
            </div>
            <ul className="lp-hero-points" data-reveal style={{ '--d': '320ms' } as React.CSSProperties}>
              <li>✓ Sem instalar nada</li>
              <li>✓ Funciona no celular</li>
              <li>✓ Dados protegidos (LGPD)</li>
            </ul>
          </div>

          <HeroScene />
        </div>
      </header>

      {/* ── FAIXA ── */}
      <section className="lp-strip" data-reveal>
        <div className="lp-wrap lp-strip-in">
          <div><b>30s</b><span>para o cliente agendar</span></div>
          <div><b>24h</b><span>agenda online aberta</span></div>
          <div><b>0</b><span>app para instalar</span></div>
          <div><b>1</b><span>painel para tudo</span></div>
        </div>
      </section>

      {/* ── RECURSOS ── */}
      <section id="recursos" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Recursos</span>
            <h2 className="lp-h2">Tudo que o seu petshop usa todo dia</h2>
            <p className="lp-sub">Menos improviso, menos planilha e mais tempo para cuidar dos pets.</p>
          </div>

          <div className="lp-features">
            {FEATURES.map((f, i) => (
              <div key={f.title} data-reveal style={{ '--d': `${(i % 3) * 90}ms` } as React.CSSProperties}>
                <TiltCard className={`lp-feature lp-tone--${f.tone}`}>
                  <span className="lp-feature-ico">{f.ico}</span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </TiltCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CARROSSEL 3D ── */}
      <section id="telas" className="lp-section lp-section--dark">
        <div className="lp-wrap">
          <div className="lp-head lp-head--light" data-reveal>
            <span className="lp-eyebrow lp-eyebrow--light">Por dentro</span>
            <h2 className="lp-h2">Um painel simples de usar</h2>
            <p className="lp-sub">Passe o mouse (ou toque) para pausar e dar uma olhada.</p>
          </div>

          <div className="lp-carousel" data-reveal>
            <div className="lp-carousel-ring">
              {SHOWCASE.map((s, i) => (
                <div key={s.name} className="lp-slide" style={{ '--i': i } as React.CSSProperties}>
                  <div className="lp-slide-bar"><i /><i /><i /><span>{s.name}</span></div>
                  <div className="lp-slide-body"><ShowcaseMock kind={s.kind} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Como funciona</span>
            <h2 className="lp-h2">Comece a receber agendamentos hoje</h2>
          </div>

          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div key={s.n} className="lp-step" data-reveal style={{ '--d': `${i * 120}ms` } as React.CSSProperties}>
                <div className="lp-step-card">
                  <span className="lp-step-n">{s.n}</span>
                  <span className="lp-step-ico">{s.ico}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-wrap">
          <div className="lp-cta-card" data-reveal>
            <span className="lp-cta-paw lp-cta-paw--1">🐾</span>
            <span className="lp-cta-paw lp-cta-paw--2">🐾</span>
            <h2>Pronto para organizar seu petshop?</h2>
            <p>Crie sua loja em poucos minutos e mande o link para os seus clientes.</p>
            <div className="lp-cta-actions">
              <Link href="/cadastro/lojista" className="lp-btn lp-btn--white lp-btn--lg">Criar minha loja grátis</Link>
              <Link href="/login" className="lp-btn lp-btn--line lp-btn--lg">Já tenho conta</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <div>
            <Link href="/" className="lp-brand"><span className="lp-brand-ico">🐾</span>SAIP</Link>
            <p>Sistema de agendamento para petshops.</p>
          </div>
          <div className="lp-footer-links">
            <a href="#recursos">Recursos</a>
            <a href="#telas">Telas</a>
            <a href="#como-funciona">Como funciona</a>
            <Link href="/login">Entrar</Link>
            <Link href="/cadastro/lojista">Criar conta</Link>
          </div>
        </div>
        <div className="lp-wrap lp-copy">© {new Date().getFullYear()} SAIP. Todos os direitos reservados.</div>
      </footer>
    </div>
  )
}
