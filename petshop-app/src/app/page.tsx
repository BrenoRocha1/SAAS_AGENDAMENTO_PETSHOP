'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import './landing.css'

/* ------------------------------------------------------------------ *
 * SCROLL REVEAL HOOK — Intersection Observer
 * ------------------------------------------------------------------ */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    )

    // Observe the element and all children with reveal classes
    const targets = el.querySelectorAll('.lp-reveal, .lp-reveal-left, .lp-reveal-right, .lp-reveal-scale, .lp-word')
    targets.forEach((t) => observer.observe(t))
    observer.observe(el)

    return () => observer.disconnect()
  }, [])

  return ref
}

/* ------------------------------------------------------------------ *
 * ANIMATED COUNTER HOOK
 * ------------------------------------------------------------------ */
function useCounter(end: number, duration: number = 1500, suffix: string = '') {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true
          const start = performance.now()
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
            setValue(Math.round(eased * end))
            if (progress < 1) requestAnimationFrame(animate)
          }
          requestAnimationFrame(animate)
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [end, duration])

  return { nodeRef: ref, value: `${value}${suffix}` }
}

/* ------------------------------------------------------------------ *
 * 3D TILT HOOK
 * ------------------------------------------------------------------ */
function use3DTilt(maxDeg: number = 8) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})

  const handleMove = useCallback((e: MouseEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateX = ((y - centerY) / centerY) * -maxDeg
    const rotateY = ((x - centerX) / centerX) * maxDeg
    setStyle({
      transform: `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
    })
  }, [maxDeg])

  const handleLeave = useCallback(() => {
    setStyle({
      transform: 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('mousemove', handleMove)
    el.addEventListener('mouseleave', handleLeave)
    return () => {
      el.removeEventListener('mousemove', handleMove)
      el.removeEventListener('mouseleave', handleLeave)
    }
  }, [handleMove, handleLeave])

  return { nodeRef: ref, style }
}

/* ------------------------------------------------------------------ *
 * WORD SPLIT COMPONENT
 * ------------------------------------------------------------------ */
function WordReveal({ text, className = '' }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const words = el.querySelectorAll('.lp-word')
          words.forEach((word, i) => {
            setTimeout(() => {
              word.classList.add('is-visible')
            }, i * 80)
          })
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <span ref={containerRef} className={className}>
      {text.split(' ').map((word, i) => (
        <span key={i} className="lp-word">
          {word}&nbsp;
        </span>
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * FLOATING PARTICLES
 * ------------------------------------------------------------------ */
function Particles() {
  return (
    <div className="lp-particles">
      {Array.from({ length: 18 }).map((_, i) => {
        // Deterministic pseudo-randomness based on index to avoid hydration mismatch 
        // and impure function calls (Math.random) during render.
        const left = (i * 17) % 100
        const dur = 8 + ((i * 7) % 12)
        const delay = (i * 3) % 10
        const size = 2 + ((i * 5) % 3)
        const opacity = 0.15 + (((i * 11) % 25) / 100)
        
        return (
          <span
            key={i}
            className="lp-particle"
            style={{
              left: `${left}%`,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
              width: `${size}px`,
              height: `${size}px`,
              opacity,
            }}
          />
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * CURSOR GLOW
 * ------------------------------------------------------------------ */
function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (glowRef.current) {
        glowRef.current.style.left = `${e.clientX}px`
        glowRef.current.style.top = `${e.clientY}px`
      }
    }
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])

  return <div ref={glowRef} className="lp-cursor-glow" />
}

/* ================================================================== *
 * LANDING PAGE
 * ================================================================== */
export default function LandingPage() {
  const revealRef = useScrollReveal()
  const { nodeRef: tiltRef, style: tiltStyle } = use3DTilt(6)

  // Animated counters
  const { nodeRef: counter1Ref, value: counter1Value } = useCounter(180, 1800, '+')
  const { nodeRef: counter2Ref, value: counter2Value } = useCounter(85, 1400, '%')
  const { nodeRef: counter3Ref, value: counter3Value } = useCounter(3, 1200, '.5h')
  const { nodeRef: counter4Ref, value: counter4Value } = useCounter(4, 1000, '.9★')

  // Navbar scroll effect
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="lp" ref={revealRef}>
      <CursorGlow />
      <Particles />

      {/* ── NAVBAR ── */}
      <nav className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="lp-container">
          <div className="lp-nav-inner">
            <Link href="/" className="lp-nav-brand">
              SAIP<span>.</span>
            </Link>

            <ul className="lp-nav-links">
              <li><a href="#capacidades" className="lp-nav-link">Capacidades</a></li>
              <li><a href="#plataforma" className="lp-nav-link">Plataforma</a></li>
              <li><a href="#processo" className="lp-nav-link">Processo</a></li>
              <li><a href="#tecnologia" className="lp-nav-link">Tecnologia</a></li>
            </ul>

            <div className="lp-nav-actions">
              <Link href="/login" className="lp-bracket-btn">Entrar</Link>
              <Link href="/cadastro/lojista" className="lp-cta-btn" style={{ padding: '0.65rem 1.5rem', fontSize: '0.75rem' }}>
                Começar agora ↗
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="lp-hero">
        <div className="lp-hero-mesh" />
        <div className="lp-hero-grid" />

        <div className="lp-container">
          <div className="lp-hero-layout">
            {/* Left — Typography */}
            <div className="lp-hero-content">
              <span className="lp-tag lp-tag--primary lp-reveal lp-delay-1">Sistema de Agendamento Inteligente</span>

              <h1 className="lp-hero-title">
                <WordReveal text="Agendamento inteligente para petshops que levam" />
                <em><WordReveal text="o ofício a sério." /></em>
              </h1>

              <p className="lp-lead lp-reveal lp-delay-3">
                <strong>Automatize 100% da sua recepção</strong>, elimine faltas com
                confirmações no WhatsApp e dê aos tutores o poder de agendar
                em 30 segundos — sem instalar nada.
              </p>

              <div className="lp-reveal lp-delay-4" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <Link href="/cadastro/lojista" className="lp-cta-btn">
                  Iniciar teste grátis ↗
                </Link>
                <a href="#capacidades" className="lp-cta-btn lp-cta-btn--outline">
                  Explorar capacidades
                </a>
              </div>
            </div>

            {/* Right — 3D App Preview */}
            <div className="lp-hero-visual lp-reveal-right lp-delay-2" ref={tiltRef}>
              <div className="lp-app-3d-wrapper" style={tiltStyle}>
                {/* Floating badges */}
                <div className="lp-float-badge lp-float-badge--top">
                  <div className="lp-float-icon lp-float-icon--indigo">📅</div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--lp-primary)', fontFamily: 'var(--lp-font-mono)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      Novo Agendamento
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>Thor • Banho &amp; Tosa</div>
                  </div>
                </div>

                <div className="lp-float-badge lp-float-badge--bottom">
                  <div className="lp-float-icon lp-float-icon--green">📈</div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#047857', fontFamily: 'var(--lp-font-mono)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      Taxa de Ocupação
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>94.8% da capacidade</div>
                  </div>
                </div>

                <div className="lp-app-frame">
                  <div className="lp-app-bar">
                    <span className="lp-app-dot" />
                    <span className="lp-app-dot" />
                    <span className="lp-app-dot" />
                    <span className="lp-app-url">saip.app/painel — Centro de Comando</span>
                  </div>
                  <div className="lp-app-body">
                    <div className="lp-app-body-header">
                      <h4>Quinta-feira • 18 Atendimentos</h4>
                      <span className="lp-app-status">
                        <span className="lp-dot-live" />
                        3 em andamento
                      </span>
                    </div>

                    <div className="lp-schedule-item">
                      <span className="lp-schedule-time">14:00</span>
                      <div>
                        <div className="lp-schedule-name">Thor — Golden Retriever</div>
                        <div className="lp-schedule-detail">Banho Terapêutico + Tosa Higiênica • Lucas M.</div>
                        <span className="lp-schedule-alert">⚠ Alergia a perfumes cítricos</span>
                      </div>
                    </div>

                    <div className="lp-schedule-item">
                      <span className="lp-schedule-time">14:30</span>
                      <div>
                        <div className="lp-schedule-name">Mel — Shih Tzu</div>
                        <div className="lp-schedule-detail">Tosa Bebê Tesoura + Hidratação • Beatriz S.</div>
                      </div>
                    </div>

                    <div className="lp-schedule-item">
                      <span className="lp-schedule-time">15:30</span>
                      <div>
                        <div className="lp-schedule-name">Pipoca — Spitz Alemão</div>
                        <div className="lp-schedule-detail">Desembolo + Banho de Hidratação • Lucas M.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Animated Stats */}
          <div className="lp-hero-stats lp-reveal-scale lp-delay-5">
            <div className="lp-stat">
              <span className="lp-stat-value" ref={counter1Ref}>{counter1Value}</span>
              <span className="lp-stat-label">Petshops ativos</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value" ref={counter2Ref}>{counter2Value}</span>
              <span className="lp-stat-label">Redução de faltas</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value" ref={counter3Ref}>{counter3Value}</span>
              <span className="lp-stat-label">Economizadas / dia</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value" ref={counter4Ref}>{counter4Value}</span>
              <span className="lp-stat-label">Avaliação dos tutores</span>
            </div>
          </div>
        </div>
      </header>

      <hr className="lp-hairline" />

      {/* ── S/01 — CAPACIDADES ── */}
      <section id="capacidades" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index lp-reveal-left">S / 01</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary lp-reveal">Capacidades</span>
                <h2 className="lp-display lp-display--section">
                  <WordReveal text="Desenhado para a física real de um petshop." />
                </h2>
                <p className="lp-lead lp-reveal lp-delay-2">
                  Sistemas genéricos não entendem que um <strong>Golden Retriever leva 1h40 de secador</strong> enquanto
                  um Shih Tzu leva 40min. Nossa inteligência de grade calcula banheiras, mesas e tosadores
                  para evitar filas.
                </p>
              </div>

              <div className="lp-capabilities">
                {[
                  {
                    num: '[01]',
                    title: 'Automação de Agenda',
                    desc: 'O sistema <strong>bloqueia automaticamente</strong> novas reservas caso todas as banheiras estejam ocupadas ou se o único tosador especialista em corte na tesoura já estiver com horário preenchido. Zero atrasos no balcão.',
                    tags: ['Anti-overbooking', 'Banheiras', 'Mesas', 'Sopradores'],
                  },
                  {
                    num: '[02]',
                    title: 'Confirmação via WhatsApp',
                    desc: 'Chega de passar <strong>2 horas da manhã ligando</strong> para tutores. O sistema dispara lembretes automáticos com botão de confirmação. Se o cliente cancelar, a vaga é liberada na hora e preenchida por lista de espera.',
                    tags: ['Cloud API', 'Confirmação 1-clique', 'Lista de espera'],
                  },
                  {
                    num: '[03]',
                    title: 'Portal do Tutor',
                    desc: 'Link exclusivo para a bio do Instagram: <strong>o cliente escolhe o pet</strong>, o pacote de serviços e marca em menos de 30 segundos. Sem instalar app, sem mandar direct, sem ligar.',
                    tags: ['Link na bio', 'PWA', 'Sem download'],
                  },
                  {
                    num: '[04]',
                    title: 'Gestão de Equipe e Comissões',
                    desc: 'Regras flexíveis: porcentagem por serviço, bônus por hidratação vendida ou valor fixo por procedimento. <strong>Relatório transparente</strong> para o colaborador auditar no próprio celular, sem precisar de Excel.',
                    tags: ['Comissões', 'Fechamento de caixa', 'Relatório'],
                  },
                ].map((cap, i) => (
                  <div key={i} className="lp-capability lp-reveal" style={{ transitionDelay: `${i * 0.12}s` }}>
                    <span className="lp-capability-num">{cap.num}</span>
                    <div className="lp-capability-content">
                      <h3 className="lp-capability-title">{cap.title}</h3>
                      <p className="lp-capability-desc" dangerouslySetInnerHTML={{ __html: cap.desc }} />
                      <div className="lp-capability-tags">
                        {cap.tags.map((tag) => (
                          <span key={tag} className="lp-pill">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATEMENT ── */}
      <div className="lp-statement">
        <div className="lp-container">
          <p className="lp-statement-text lp-reveal">
            Não somos mais um app de agenda genérico. <em>Somos a infraestrutura operacional
            que faltava entre a primeira ligação e o pet sair impecável pela porta.</em>
          </p>
        </div>
      </div>

      {/* ── P/02 — BENTO GRID ── */}
      <section id="plataforma" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index lp-reveal-left">P / 02</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary lp-reveal">Plataforma</span>
                <h2 className="lp-display lp-display--section">
                  <WordReveal text="Cada detalhe foi projetado para o seu dia a dia." />
                </h2>
              </div>

              <div className="lp-bento">
                <div className="lp-bento-card lp-bento-card--span2 lp-reveal lp-delay-1">
                  <div>
                    <span className="lp-tag">Grade inteligente</span>
                    <h3>Motor Anti-Conflito de Banheiras &amp; Mesas</h3>
                    <p>
                      Visualize banheiras, mesas de tosa e sopradores em uma única timeline.
                      O sistema cruza porte do animal, especialidade do tosador e tempo estimado.
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {[
                      { label: 'Mesa 01', status: 'Ocupada', color: 'var(--lp-primary)' },
                      { label: 'Banheira 01', status: 'Disponível', color: '#047857' },
                      { label: 'Soprador', status: 'Em uso', color: 'var(--lp-text-main)' },
                    ].map((item) => (
                      <div key={item.label} style={{ background: 'var(--lp-canvas)', border: '1px solid var(--lp-hairline)', padding: '0.85rem', textAlign: 'center' }}>
                        <span className="lp-tag" style={{ fontSize: '0.6rem' }}>{item.label}</span>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: item.color, marginTop: '0.3rem' }}>{item.status}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lp-bento-card lp-bento-card--dark lp-reveal lp-delay-2">
                  <div>
                    <span className="lp-tag">WhatsApp Cloud</span>
                    <h3>Confirmação Autônoma</h3>
                    <p>Lembretes automáticos com botão de confirmação. Cancelou? A vaga volta instantaneamente.</p>
                  </div>
                  <div className="lp-bento-metric lp-bento-metric--dark">−85%</div>
                </div>

                <div className="lp-bento-card lp-reveal lp-delay-3">
                  <div>
                    <span className="lp-tag">Prontuário</span>
                    <h3>Ficha Clínica &amp; Fotos</h3>
                    <p>Anotações sobre alergias, lesões de pele, fotos do corte anterior e preferências de cada tutor.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="lp-pill">Vacinas em dia ✓</span>
                    <span className="lp-pill">Pelo duplo</span>
                    <span className="lp-pill">Microchip</span>
                  </div>
                </div>

                <div className="lp-bento-card lp-bento-card--dark lp-reveal lp-delay-4">
                  <div>
                    <span className="lp-tag">Financeiro</span>
                    <h3>Comissões em 1 Clique</h3>
                    <p>Sem Excel. Regras flexíveis por serviço, bônus e valor fixo com relatório auditável.</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '0.7rem', color: '#a5b4fc', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      Extrato mensal
                    </span>
                    <span className="lp-bento-metric lp-bento-metric--dark" style={{ fontSize: '1.8rem' }}>R$ 1.840</span>
                  </div>
                </div>

                <div className="lp-bento-card lp-bento-card--span2 lp-reveal lp-delay-5">
                  <div>
                    <span className="lp-tag">Portal do tutor</span>
                    <h3>Link Exclusivo para Bio do Instagram</h3>
                    <p>O cliente entra, escolhe o pet, seleciona o pacote e marca em menos de 30 segundos.</p>
                  </div>
                  <div style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '0.85rem', color: 'var(--lp-primary)', marginTop: '0.5rem' }}>
                    → saip.app/@seupetshop
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="lp-hairline" />

      {/* ── S/03 — PROCESSO ── */}
      <section id="processo" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index lp-reveal-left">S / 03</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary lp-reveal">Processo</span>
                <h2 className="lp-display lp-display--section">
                  <WordReveal text="Do cadastro ao primeiro agendamento em 4 minutos." />
                </h2>
              </div>

              <div className="lp-steps">
                {[
                  { num: '01.', title: 'Configure sua loja', desc: 'Cadastre suas banheiras, mesas de tosa, sopradores e cada colaborador com suas especialidades. O assistente guiado configura tudo em poucos cliques.' },
                  { num: '02.', title: 'Compartilhe seu link', desc: 'Cole o link personalizado na bio do Instagram, no status do WhatsApp ou no Google Meu Negócio. Seus clientes começam a agendar sozinhos.' },
                  { num: '03.', title: 'Opere com eficiência', desc: 'Acompanhe agendamentos, confirmações automáticas, prontuários e comissões em um único painel. O sistema trabalha enquanto você cuida dos pets.' },
                ].map((step, i) => (
                  <div key={i} className="lp-step lp-reveal" style={{ transitionDelay: `${i * 0.15}s` }}>
                    <span className="lp-step-num">{step.num}</span>
                    <h4>{step.title}</h4>
                    <p>{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="lp-hairline" />

      {/* ── T/04 — STACK ── */}
      <section id="tecnologia" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index lp-reveal-left">T / 04</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary lp-reveal">Tecnologia</span>
                <h2 className="lp-display lp-display--section">
                  <WordReveal text="Stack de engenharia moderna." />
                </h2>
                <p className="lp-lead lp-reveal lp-delay-2">
                  Construído com as <strong>mesmas ferramentas usadas por Vercel, Supabase e Stripe</strong> para
                  garantir velocidade, segurança e escalabilidade.
                </p>
              </div>

              <div className="lp-tech-grid lp-reveal-scale lp-delay-3">
                {[
                  { icon: '⚡', name: 'Next.js 16', role: 'Framework' },
                  { icon: '🔐', name: 'Supabase', role: 'Auth & Database' },
                  { icon: '🐘', name: 'PostgreSQL', role: 'Data Layer' },
                  { icon: '▲', name: 'Vercel', role: 'Edge Deploy' },
                  { icon: '🔷', name: 'TypeScript', role: 'Type Safety' },
                  { icon: '💬', name: 'WhatsApp API', role: 'Messaging' },
                  { icon: '🔒', name: 'RLS Policies', role: 'Row-Level Security' },
                  { icon: '⚛️', name: 'React 19', role: 'UI Runtime' },
                ].map((tech) => (
                  <div key={tech.name} className="lp-tech-item">
                    <div className="lp-tech-icon">{tech.icon}</div>
                    <div>
                      <div className="lp-tech-name">{tech.name}</div>
                      <div className="lp-tech-role">{tech.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta-section">
        <div className="lp-container">
          <div className="lp-cta-inner">
            <span className="lp-tag lp-reveal" style={{ color: '#a5b4fc' }}>Pronto para começar?</span>
            <h2 className="lp-cta-title lp-reveal lp-delay-1">
              Seu petshop merece operar com a precisão de um software de verdade.
            </h2>
            <p className="lp-cta-desc lp-reveal lp-delay-2">
              Teste grátis por 14 dias. Sem cartão de crédito. Sem compromisso.
              Configure em 4 minutos e comece a receber agendamentos hoje.
            </p>
            <div className="lp-cta-actions lp-reveal lp-delay-3">
              <Link href="/cadastro/lojista" className="lp-cta-btn" style={{ background: '#ffffff', color: 'var(--lp-primary)' }}>
                Iniciar teste grátis ↗
              </Link>
              <Link href="/login" className="lp-cta-btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff' }}>
                Já tenho conta
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-inner">
            <div>
              <div className="lp-footer-brand">SAIP<span>.</span></div>
              <div className="lp-footer-copy">
                Sistema de Agendamento Inteligente para Petshop<br />
                © {new Date().getFullYear()} SAIP. Todos os direitos reservados.
              </div>
            </div>
            <div className="lp-footer-links">
              <div className="lp-footer-col">
                <span className="lp-footer-col-title">Produto</span>
                <a href="#capacidades" className="lp-footer-link">Capacidades</a>
                <a href="#plataforma" className="lp-footer-link">Plataforma</a>
                <a href="#processo" className="lp-footer-link">Processo</a>
                <a href="#tecnologia" className="lp-footer-link">Tecnologia</a>
              </div>
              <div className="lp-footer-col">
                <span className="lp-footer-col-title">Acesso</span>
                <Link href="/login" className="lp-footer-link">Entrar</Link>
                <Link href="/cadastro/lojista" className="lp-footer-link">Criar conta</Link>
              </div>
              <div className="lp-footer-col">
                <span className="lp-footer-col-title">Legal</span>
                <a href="#" className="lp-footer-link">Termos de uso</a>
                <a href="#" className="lp-footer-link">Privacidade</a>
              </div>
            </div>
          </div>
          <div className="lp-footer-meta">
            <div><span className="lp-footer-meta-label">SLA</span><br /><span className="lp-footer-meta-value">99.9%</span></div>
            <div><span className="lp-footer-meta-label">Versão</span><br /><span className="lp-footer-meta-value">v3.1.0</span></div>
            <div><span className="lp-footer-meta-label">Latência</span><br /><span className="lp-footer-meta-value">&lt;120ms</span></div>
            <div><span className="lp-footer-meta-label">Deploy</span><br /><span className="lp-footer-meta-value">Edge (GRU)</span></div>
          </div>
        </div>
      </footer>
    </div>
  )
}
