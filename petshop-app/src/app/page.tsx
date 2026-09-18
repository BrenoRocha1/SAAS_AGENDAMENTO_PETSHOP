'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import './landing.css'

/* ------------------------------------------------------------------ *
 * LINE ICONS (1.75 STROKE - ULTRA CRISP)
 * ------------------------------------------------------------------ */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconPaw() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="20" height="20" aria-hidden="true">
      <circle cx="7" cy="9.5" r="1.6" />
      <circle cx="17" cy="9.5" r="1.6" />
      <circle cx="10" cy="5.5" r="1.6" />
      <circle cx="14" cy="5.5" r="1.6" />
      <path d="M12 11.5c-2.4 0-4.5 1.7-4.5 3.8 0 2 1.8 3.7 4.5 3.7s4.5-1.7 4.5-3.7c0-2.1-2.1-3.8-4.5-3.8Z" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="20" height="20" aria-hidden="true">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  )
}

function IconMessageCircle() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="20" height="20" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="20" height="20" aria-hidden="true">
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S14 16 14.5 19M16 6.2a3 3 0 0 1 0 5.6M18 14.6c2 .7 3.4 2.1 3.8 4.4" />
    </svg>
  )
}

function IconShieldCheck() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="20" height="20" aria-hidden="true">
      <path d="M12 3l8 4v6c0 5.25-3.5 10-8 11-4.5-1-8-5.75-8-11V7l8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="16" height="16" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

function IconArrowRight() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="16" height="16" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function IconArrowUpRight() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="15" height="15" aria-hidden="true">
      <path d="M7 17L17 7M7 7h10v10" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconTrendingUp() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="20" height="20" aria-hidden="true">
      <path d="m22 7-8.5 8.5-5-5L2 17M16 7h6v6" />
    </svg>
  )
}

function IconSliders() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} width="20" height="20" aria-hidden="true">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  )
}

function IconChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...stroke}
      width="18"
      height="18"
      style={{
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * LANDING PAGE COMPONENT
 * ------------------------------------------------------------------ */
export default function LandingPage() {
  // 3D Perspective Tilt State
  const sceneRef = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!sceneRef.current) return
    const rect = sceneRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    // Limit rotation to max 8 degrees for a luxurious 3D feel
    const rotX = -(y / (rect.height / 2)) * 7
    const rotY = (x / (rect.width / 2)) * 7
    setTilt({ x: rotX, y: rotY })
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 })
  }

  // Interactive Demo State
  const [activeTab, setActiveTab] = useState<'grade' | 'whatsapp' | 'prontuario' | 'financeiro'>('grade')
  const [waConfirmed, setWaConfirmed] = useState(false)

  // Interactive ROI Calculator State
  const [petsPerDay, setPetsPerDay] = useState(24)
  const monthlyRevenue = petsPerDay * 95 * 26 // R$ 95 ticket médio, 26 dias úteis
  const noShowSavings = Math.round(monthlyRevenue * 0.12) // 12% a menos de faltas
  const hoursSaved = Math.round(petsPerDay * 3.5) // ~3.5h por dia no mês

  // Interactive Booking Simulator State
  const [simPet, setSimPet] = useState<'thor' | 'pipoca'>('thor')
  const [simService, setSimService] = useState<'banho' | 'tosa'>('banho')
  const [simTime, setSimTime] = useState('14:00')
  const [simBooked, setSimBooked] = useState(false)

  // Perspective & FAQ State
  const [perspective, setPerspective] = useState<'lojista' | 'cliente'>('lojista')
  const [pricingCycle, setPricingCycle] = useState<'mensal' | 'anual'>('mensal')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="lp-wrapper">
      {/* Background ambient grid mesh */}
      <div className="lp-bg-grid-mesh" />

      {/* ── 1. NAVBAR GLASS ── */}
      <nav className="lp-nav">
        <div className="lp-container">
          <div className="lp-nav-inner">
            <Link href="/" className="lp-brand">
              <div className="lp-brand-logo">
                <IconPaw />
              </div>
              <div className="lp-brand-title">
                PetShop<span>Agenda</span>
              </div>
            </Link>

            <ul className="lp-nav-links">
              <li><a href="#demonstracao" className="lp-nav-link">Demonstração 3D</a></li>
              <li><a href="#recursos" className="lp-nav-link">Recursos</a></li>
              <li><a href="#calculadora" className="lp-nav-link">Calculadora ROI</a></li>
              <li><a href="#simulador" className="lp-nav-link">Simulador Tutor</a></li>
              <li><a href="#precos" className="lp-nav-link">Planos</a></li>
              <li><a href="#faq" className="lp-nav-link">Dúvidas</a></li>
            </ul>

            <div className="lp-nav-actions">
              <Link href="/login" className="lp-btn lp-btn-ghost">
                Entrar
              </Link>
              <Link href="/cadastro/lojista" className="lp-btn lp-btn-primary">
                + Novo Agendamento
                <IconArrowUpRight />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── 2. HERO 3D COM CONTROLE DE PERSPECTIVA ── */}
      <header className="lp-hero">
        <div className="lp-container">
          <div className="lp-hero-center">
            <div className="lp-badge-tech">
              <span className="lp-dot-pulse" />
              <span>MOTOR DE AGENDAMENTO AUTÔNOMO V3.0 • TEMPO REAL</span>
            </div>

            <h1 className="lp-hero-title">
              A infraestrutura definitiva para <em>petshops de alta performance.</em>
            </h1>

            <p className="lp-hero-subtitle">
              Automatize 100% da sua recepção, elimine faltas com confirmações no WhatsApp
              e dê aos tutores o poder de agendar em 30 segundos — sem instalar nada.
            </p>

            <div className="lp-hero-actions">
              <Link
                href="/cadastro/lojista"
                className="lp-btn lp-btn-primary"
                style={{ padding: '0.95rem 2rem', fontSize: '1rem', borderRadius: 12 }}
              >
                Iniciar teste grátis de 14 dias
                <IconArrowRight />
              </Link>
              <a
                href="#demonstracao"
                className="lp-btn lp-btn-secondary"
                style={{ padding: '0.95rem 1.65rem', fontSize: '1rem', borderRadius: 12 }}
              >
                Explorar Painel 3D
                <IconSliders />
              </a>
            </div>

            <div className="lp-hero-trust">
              <span>✓ Sem cartão de crédito</span>
              <span>✓ Configuração em 4 minutos</span>
              <span>✓ Suporte VIP via WhatsApp</span>
            </div>
          </div>

          {/* ── 3D INTERACTIVE CHASSIS (MOUSE TILT VIBRANTE) ── */}
          <div
            id="demonstracao"
            ref={sceneRef}
            className="lp-3d-scene"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Floating Badge 1 (Top Left) */}
            <div className="lp-floating-card lp-float-top-left">
              <div className="lp-float-icon-box">
                <IconCalendar />
              </div>
              <div>
                <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>NOVO AGENDAMENTO</span>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--lp-text-main)' }}>
                  Thor (Golden) • Banho & Tosa
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-muted)' }}>Hoje às 14:00 • Lucas M.</div>
              </div>
            </div>

            {/* Floating Badge 2 (Bottom Right) */}
            <div className="lp-floating-card lp-float-bottom-right">
              <div className="lp-float-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}>
                <IconTrendingUp />
              </div>
              <div>
                <span className="lp-mono-code" style={{ color: '#047857' }}>TAXA DE OCUPAÇÃO</span>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--lp-text-main)' }}>
                  94.8% da capacidade
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-muted)' }}>+32% faturamento este mês</div>
              </div>
            </div>

            {/* Viewport 3D rotativo */}
            <div
              className="lp-3d-viewport"
              style={{
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              }}
            >
              <div className="lp-3d-chassis">
                {/* Header do Chassis */}
                <div className="lp-chassis-bar">
                  <div className="lp-chassis-dots">
                    <span className="lp-chassis-dot" />
                    <span className="lp-chassis-dot" />
                    <span className="lp-chassis-dot" />
                    <span className="lp-mono-code" style={{ marginLeft: '0.75rem' }}>
                      CENTRO DE COMANDO // HOJE: 17 DE SETEMBRO
                    </span>
                  </div>

                  <div className="lp-chassis-tabs">
                    <button
                      type="button"
                      className={`lp-chassis-tab-btn ${activeTab === 'grade' ? 'active' : ''}`}
                      onClick={() => setActiveTab('grade')}
                    >
                      Grade de Horários
                    </button>
                    <button
                      type="button"
                      className={`lp-chassis-tab-btn ${activeTab === 'whatsapp' ? 'active' : ''}`}
                      onClick={() => setActiveTab('whatsapp')}
                    >
                      WhatsApp Agent
                    </button>
                    <button
                      type="button"
                      className={`lp-chassis-tab-btn ${activeTab === 'prontuario' ? 'active' : ''}`}
                      onClick={() => setActiveTab('prontuario')}
                    >
                      Prontuário Pet
                    </button>
                    <button
                      type="button"
                      className={`lp-chassis-tab-btn ${activeTab === 'financeiro' ? 'active' : ''}`}
                      onClick={() => setActiveTab('financeiro')}
                    >
                      Comissões & Caixa
                    </button>
                  </div>
                </div>

                {/* Grid interno da visualização */}
                <div className="lp-console-grid">
                  {/* Painel Esquerdo */}
                  <div className="lp-console-main-pane">
                    {activeTab === 'grade' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--lp-text-main)' }}>
                              Quinta-feira • 18 Atendimentos Programados
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--lp-text-muted)' }}>
                              Mesa 1 (Lucas M.), Mesa 2 (Beatriz S.), Banheira 1 e 2 operando
                            </p>
                          </div>
                          <span className="lp-tag-status lp-tag-active">● 3 em andamento</span>
                        </div>

                        {/* Card 1 */}
                        <div className="lp-item-card">
                          <div className="lp-time-badge">14:00 - 15:30</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '1rem', color: 'var(--lp-text-main)' }}>Thor</strong>
                              <span className="lp-tag-status lp-tag-active">Em Secagem 🚿</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-secondary)', marginTop: '0.2rem' }}>
                              Golden Retriever (32 kg) • Banho Terapêutico + Tosa Higiênica • Tosador: <strong>Lucas M.</strong>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#92400e', background: '#fffbeb', padding: '0.2rem 0.5rem', borderRadius: 4, display: 'inline-block', marginTop: '0.35rem' }}>
                              ⚠️ Alergia a perfumes cítricos — Usar toalha morna e finalizador neutro
                            </div>
                          </div>
                        </div>

                        {/* Card 2 */}
                        <div className="lp-item-card">
                          <div className="lp-time-badge">14:30 - 15:15</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '1rem', color: 'var(--lp-text-main)' }}>Mel</strong>
                              <span className="lp-tag-status lp-tag-done">Pronta para Retirada ✨</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-secondary)', marginTop: '0.2rem' }}>
                              Shih Tzu (5.2 kg) • Tosa Bebê Tesoura + Hidratação • Banhista: <strong>Beatriz S.</strong>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--lp-text-muted)', marginTop: '0.25rem' }}>
                              WhatsApp automático disparado às 15:10 comunicando a tutora
                            </div>
                          </div>
                        </div>

                        {/* Card 3 */}
                        <div className="lp-item-card">
                          <div className="lp-time-badge">15:30 - 16:30</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '1rem', color: 'var(--lp-text-main)' }}>Pipoca</strong>
                              <span className="lp-tag-status lp-tag-indigo">Confirmado pelo Tutor ✓</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-secondary)', marginTop: '0.2rem' }}>
                              Spitz Alemão (3.8 kg) • Desembolo + Banho de Hidratação • Tosador: <strong>Lucas M.</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'whatsapp' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>SIMULAÇÃO DO BOT WHATSAPP EM NUVEM</span>
                          <span className="lp-tag-status lp-tag-active">Status: Online</span>
                        </div>

                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
                          <div style={{ fontWeight: 700, color: '#166534', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <IconMessageCircle />
                            Mensagem Automática Enviada ao Tutor:
                          </div>
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#1e3a5f', lineHeight: 1.5 }}>
                            &quot;Olá, Camila! 🐾 O horário da <strong>Pipoca</strong> para Banho & Tosa está agendado para amanhã às <strong>15:30</strong> na PetCare. Por favor, confirme se comparecerá:&quot;
                          </p>

                          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                            <button
                              type="button"
                              onClick={() => setWaConfirmed(true)}
                              className="lp-btn lp-btn-primary"
                              style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: 6 }}
                            >
                              {waConfirmed ? '✓ Presença Confirmada!' : 'Confirmar Presença (Simular Clique)'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setWaConfirmed(false)}
                              className="lp-btn lp-btn-secondary"
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', borderRadius: 6 }}
                            >
                              Reagendar Horário
                            </button>
                          </div>
                        </div>

                        {waConfirmed && (
                          <div style={{ background: '#ffffff', border: '1px solid var(--lp-primary-border)', borderRadius: 10, padding: '0.85rem', fontSize: '0.85rem', color: 'var(--lp-text-main)' }}>
                            ⚡ <strong>Ação Instantânea no Painel:</strong> O status do agendamento foi atualizado para verde e a vaga está 100% garantida sem que você precisasse digitar nada.
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'prontuario' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                          <div style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--lp-primary-soft)', color: 'var(--lp-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', border: '1px solid var(--lp-primary-border)' }}>
                            🐕
                          </div>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--lp-text-main)' }}>
                              Thor — Golden Retriever
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--lp-text-muted)' }}>
                              Tutor: Ricardo Camargo • Fone: (11) 99882-1100 • Microchip: #BR-882910
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                          <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', padding: '1rem', borderRadius: 10 }}>
                            <span className="lp-mono-code">PESO CORPÓREO</span>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--lp-text-main)', marginTop: 4 }}>32.4 kg</div>
                          </div>
                          <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', padding: '1rem', borderRadius: 10 }}>
                            <span className="lp-mono-code">FREQUÊNCIA MÉDIA</span>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--lp-primary)', marginTop: 4 }}>A cada 14 dias</div>
                          </div>
                          <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', padding: '1rem', borderRadius: 10 }}>
                            <span className="lp-mono-code">LTV ACUMULADO</span>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#047857', marginTop: 4 }}>R$ 2.480,00</div>
                          </div>
                        </div>

                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '1rem', fontSize: '0.875rem', color: '#92400e' }}>
                          <strong>Ficha de Cuidados Especiais:</strong> Cão dócil, mas fica inquieto durante o corte de unhas das patas traseiras. Recomenda-se realizar em dupla no final do atendimento.
                        </div>
                      </div>
                    )}

                    {activeTab === 'financeiro' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                          <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', borderRadius: 12, padding: '1.25rem' }}>
                            <span className="lp-mono-code">FATURAMENTO DO DIA</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--lp-text-main)', marginTop: '0.25rem' }}>
                              R$ 2.340,00
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#047857' }}>+18% acima da média da quinta-feira</span>
                          </div>
                          <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', borderRadius: 12, padding: '1.25rem' }}>
                            <span className="lp-mono-code">COMISSÕES ESTIMADAS</span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--lp-primary)', marginTop: '0.25rem' }}>
                              R$ 702,00
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--lp-text-muted)' }}>Dividido entre Lucas M. e Beatriz S.</span>
                          </div>
                        </div>

                        <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', borderRadius: 12, padding: '1.25rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Meta Semanal da Loja</span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--lp-primary)' }}>84% alcançada</span>
                          </div>
                          <div style={{ width: '100%', height: 10, background: 'var(--lp-primary-soft)', borderRadius: 9999, overflow: 'hidden' }}>
                            <div style={{ width: '84%', height: '100%', background: 'linear-gradient(90deg, var(--lp-primary), #3b82f6)', borderRadius: 9999 }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Painel Direito (Feed de Eventos em Tempo Real) */}
                  <div className="lp-console-side-pane">
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>FEED OPERACIONAL</span>
                        <span className="lp-dot-pulse" />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.825rem' }}>
                        <div style={{ borderLeft: '2px solid var(--lp-primary)', paddingLeft: '0.75rem' }}>
                          <div style={{ color: 'var(--lp-text-muted)', fontSize: '0.725rem' }}>14:15 • WHATSAPP CLOUD</div>
                          <div style={{ color: 'var(--lp-text-main)', fontWeight: 600 }}>Confirmação recebida</div>
                          <div style={{ color: 'var(--lp-text-secondary)' }}>Tutor do Bob confirmou presença para amanhã</div>
                        </div>

                        <div style={{ borderLeft: '2px solid #10b981', paddingLeft: '0.75rem' }}>
                          <div style={{ color: 'var(--lp-text-muted)', fontSize: '0.725rem' }}>14:02 • RECEPÇÃO</div>
                          <div style={{ color: 'var(--lp-text-main)', fontWeight: 600 }}>Check-in realizado</div>
                          <div style={{ color: 'var(--lp-text-secondary)' }}>Thor entrou na Banheira 1 com Lucas</div>
                        </div>

                        <div style={{ borderLeft: '2px solid #f59e0b', paddingLeft: '0.75rem' }}>
                          <div style={{ color: 'var(--lp-text-muted)', fontSize: '0.725rem' }}>13:45 • REENGAJAMENTO</div>
                          <div style={{ color: 'var(--lp-text-main)', fontWeight: 600 }}>Lembrete de retorno</div>
                          <div style={{ color: 'var(--lp-text-secondary)' }}>4 tutores ausentes há +20 dias notificados</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--lp-border)' }}>
                      <Link
                        href="/cadastro/lojista"
                        className="lp-btn lp-btn-primary"
                        style={{ width: '100%', fontSize: '0.85rem' }}
                      >
                        Experimentar este painel na prática
                        <IconArrowUpRight />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── METRICS STRIP ── */}
          <div className="lp-metrics-strip">
            <div className="lp-metric-tile">
              <span className="lp-metric-num">+180</span>
              <span className="lp-metric-desc">Petshops e clínicas ativas diariamente</span>
            </div>
            <div className="lp-metric-tile">
              <span className="lp-metric-num">85%</span>
              <span className="lp-metric-desc">Redução drástica de clientes ausentes</span>
            </div>
            <div className="lp-metric-tile">
              <span className="lp-metric-num">3.5h</span>
              <span className="lp-metric-desc">Economizadas por atendente por dia</span>
            </div>
            <div className="lp-metric-tile">
              <span className="lp-metric-num">4.9/5</span>
              <span className="lp-metric-desc">Avaliação média feita por tutores</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── 3. BENTO GRID 3D: ARQUITETURA DO SISTEMA ── */}
      <section id="recursos" className="lp-section-wrap">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>[ 01 // ARQUITETURA DE DADOS & CAPACIDADE ]</span>
            <h2 className="lp-section-h2">Desenvolvido sob medida para a física real de um petshop.</h2>
            <p className="lp-section-sub">
              Sistemas comuns não entendem que um Golden Retriever leva 1h40 de secador enquanto um Shih Tzu leva 40min.
              Nossa inteligência de grade calcula banheiras, mesas, sopradores e tosadores para evitar filas.
            </p>
          </div>

          <div className="lp-bento-layout">
            {/* Card 1: Anti-Overbooking Engine */}
            <div className="lp-card-3d span-2">
              <div>
                <span className="lp-mono-code">[ CAPACIDADE FÍSICA ]</span>
                <h3>Motor Anti-Conflito de Banheiras & Mesas</h3>
                <p>
                  O sistema bloqueia automaticamente novas reservas caso todas as banheiras estejam ocupadas ou se o
                  único tosador especialista em corte na tesoura já estiver com horário preenchido. Zero atrasos no balcão.
                </p>
              </div>

              <div className="lp-card-preview-area">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', borderRadius: 10, padding: '0.85rem' }}>
                    <span className="lp-mono-code">MESA 01 (TESOURA)</span>
                    <div style={{ fontWeight: 700, color: 'var(--lp-primary)', marginTop: 4 }}>Lucas M. • Ocupado</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', borderRadius: 10, padding: '0.85rem' }}>
                    <span className="lp-mono-code">BANHEIRA 01 (PORTE G)</span>
                    <div style={{ fontWeight: 700, color: '#047857', marginTop: 4 }}>Disponível (14:30)</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid var(--lp-border)', borderRadius: 10, padding: '0.85rem' }}>
                    <span className="lp-mono-code">SOPRADOR / SECAGEM</span>
                    <div style={{ fontWeight: 700, color: 'var(--lp-text-main)', marginTop: 4 }}>Higienização OK</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: WhatsApp Autônomo */}
            <div className="lp-card-3d">
              <div>
                <span className="lp-mono-code">[ AGENTE EM NUVEM ]</span>
                <h3>Confirmação Ativa pelo WhatsApp</h3>
                <p>
                  Chega de passar 2 horas da manhã ligando para tutores. O sistema dispara lembretes com botão de confirmação.
                  Se o cliente cancelar, a vaga é liberada na hora.
                </p>
              </div>

              <div className="lp-card-preview-area" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--lp-primary)', lineHeight: 1 }}>
                  -85%
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--lp-text-muted)', marginTop: '0.35rem' }}>
                  Faltas e desistências no banho e tosa
                </div>
              </div>
            </div>

            {/* Card 3: Link Personalizado da Bio */}
            <div className="lp-card-3d">
              <div>
                <span className="lp-mono-code">[ PORTAL DE AGENDAMENTO ]</span>
                <h3>Link Exclusivo para sua Bio do Instagram</h3>
                <p>
                  Seu cliente entra em <code>petagenda.com.br/@seupetshop</code>, escolhe o pet, o pacote de serviços e marca
                  em menos de 30 segundos, sem precisar mandar direct.
                </p>
              </div>

              <div className="lp-card-preview-area" style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '0.85rem', color: 'var(--lp-primary)' }}>
                👉 petagenda.com.br/petcare-alpha
              </div>
            </div>

            {/* Card 4: Comissões Automáticas */}
            <div className="lp-card-3d">
              <div>
                <span className="lp-mono-code">[ FECHAMENTO DE CAIXA ]</span>
                <h3>Comissões em 1 Clique sem Excel</h3>
                <p>
                  Regras flexíveis: porcentagem por serviço, bônus por hidratação vendida ou valor fixo por procedimento.
                  Relatório transparente para o colaborador auditar no próprio celular.
                </p>
              </div>

              <div className="lp-card-preview-area" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Extrato do Colaborador:</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#047857' }}>R$ 1.840,00</span>
              </div>
            </div>

            {/* Card 5: Prontuário Veterinário */}
            <div className="lp-card-3d">
              <div>
                <span className="lp-mono-code">[ FICHA CLÍNICA ]</span>
                <h3>Histórico Veterinário & Fotos</h3>
                <p>
                  Mantenha anotações sobre pulgas, lesões de pele pré-existentes, fotos do corte anterior e preferências
                  específicas de cada tutor gravadas com segurança.
                </p>
              </div>

              <div className="lp-card-preview-area" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="lp-tag-status lp-tag-active">Vacinas em dia ✓</span>
                <span className="lp-tag-status lp-tag-indigo">Pelo Duplo Subpelo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. CALCULADORA INTERATIVA DE ROI ── */}
      <section id="calculadora" className="lp-section-wrap" style={{ background: '#ffffff' }}>
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>[ 02 // IMPACTO FINANCEIRO MENSAL ]</span>
            <h2 className="lp-section-h2">Calcule o impacto do sistema no seu caixa.</h2>
            <p className="lp-section-sub">
              Arraste o número de pets que seu estabelecimento atende por dia e veja a economia e receita adicionais.
            </p>
          </div>

          <div className="lp-calc-box">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <label htmlFor="pets-slider" style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--lp-text-main)' }}>
                  Pets atendidos por dia:
                </label>
                <span style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--lp-primary)' }}>
                  {petsPerDay} pets / dia
                </span>
              </div>

              <input
                id="pets-slider"
                type="range"
                min={8}
                max={60}
                step={2}
                value={petsPerDay}
                onChange={(e) => setPetsPerDay(Number(e.target.value))}
                className="lp-slider-ui"
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--lp-text-muted)', marginTop: '0.5rem' }}>
                <span>8 pets (início)</span>
                <span>30 pets (médio porte)</span>
                <span>60 pets (grande centro)</span>
              </div>

              <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="lp-check-pill"><IconCheck /></div>
                  <span style={{ fontSize: '0.925rem', color: 'var(--lp-text-secondary)' }}>
                    Recuperação média de <strong>R$ {noShowSavings.toLocaleString('pt-BR')}</strong> em faltas que seriam perdidas.
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="lp-check-pill"><IconCheck /></div>
                  <span style={{ fontSize: '0.925rem', color: 'var(--lp-text-secondary)' }}>
                    Poupados <strong>{hoursSaved} horas/mês</strong> em atendimento manual no WhatsApp.
                  </span>
                </div>
              </div>
            </div>

            {/* Card de Resultado */}
            <div className="lp-calc-result-card">
              <div>
                <span className="lp-mono-code" style={{ color: '#a5b4fc' }}>FATURAMENTO MENSAL POTENCIAL</span>
                <div className="lp-calc-val-glow">
                  R$ {monthlyRevenue.toLocaleString('pt-BR')},00
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#c7d2fe' }}>
                  <span>Mensalidade do Sistema:</span>
                  <strong style={{ color: '#ffffff' }}>R$ 149,00</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#c7d2fe', marginTop: '0.5rem' }}>
                  <span>Retorno do Investimento (ROI):</span>
                  <strong style={{ color: '#86efac' }}>+3.200%</strong>
                </div>
              </div>

              <Link
                href="/cadastro/lojista"
                className="lp-btn lp-btn-primary"
                style={{ width: '100%', background: '#ffffff', color: 'var(--lp-primary) !important', fontWeight: 700 }}
              >
                Garantir este resultado no meu Petshop
                <IconArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. SIMULADOR DO TUTOR (EXPERIÊNCIA DO CLIENTE) ── */}
      <section id="simulador" className="lp-section-wrap">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>[ 03 // PORTAL DE AUTO-AGENDAMENTO ]</span>
            <h2 className="lp-section-h2">Experimente como seu cliente agendará em 3 passos.</h2>
            <p className="lp-section-sub">
              Faça uma simulação agora mesmo para ver a velocidade com que seus clientes marcam horários:
            </p>
          </div>

          <div className="lp-booking-sim-wrap">
            <div className="lp-sim-steps">
              {/* Passo 1 */}
              <div>
                <div className="lp-mono-code" style={{ marginBottom: '0.75rem' }}>PASSO 1: ESCOLHA O PET</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div
                    className={`lp-sim-step-item ${simPet === 'thor' ? 'selected' : ''}`}
                    onClick={() => { setSimPet('thor'); setSimBooked(false) }}
                  >
                    <strong>Thor</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-muted)' }}>Golden Retriever (Grande)</div>
                  </div>
                  <div
                    className={`lp-sim-step-item ${simPet === 'pipoca' ? 'selected' : ''}`}
                    onClick={() => { setSimPet('pipoca'); setSimBooked(false) }}
                  >
                    <strong>Pipoca</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--lp-text-muted)' }}>Spitz Alemão (Pequeno)</div>
                  </div>
                </div>
              </div>

              {/* Passo 2 */}
              <div>
                <div className="lp-mono-code" style={{ marginBottom: '0.75rem' }}>PASSO 2: SERVIÇO</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div
                    className={`lp-sim-step-item ${simService === 'banho' ? 'selected' : ''}`}
                    onClick={() => { setSimService('banho'); setSimBooked(false) }}
                  >
                    <strong>Banho Completo + Hidratação</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--lp-primary)', fontWeight: 700 }}>R$ 110,00</div>
                  </div>
                  <div
                    className={`lp-sim-step-item ${simService === 'tosa' ? 'selected' : ''}`}
                    onClick={() => { setSimService('tosa'); setSimBooked(false) }}
                  >
                    <strong>Tosa Tesoura Especializada</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--lp-primary)', fontWeight: 700 }}>R$ 160,00</div>
                  </div>
                </div>
              </div>

              {/* Passo 3 */}
              <div>
                <div className="lp-mono-code" style={{ marginBottom: '0.75rem' }}>PASSO 3: HORÁRIO LIVRE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div
                    className={`lp-sim-step-item ${simTime === '14:00' ? 'selected' : ''}`}
                    onClick={() => { setSimTime('14:00'); setSimBooked(false) }}
                  >
                    <strong>14:00 com Lucas M.</strong>
                    <div style={{ fontSize: '0.8rem', color: '#047857' }}>Vaga Confirmada</div>
                  </div>
                  <div
                    className={`lp-sim-step-item ${simTime === '16:30' ? 'selected' : ''}`}
                    onClick={() => { setSimTime('16:30'); setSimBooked(false) }}
                  >
                    <strong>16:30 com Beatriz S.</strong>
                    <div style={{ fontSize: '0.8rem', color: '#047857' }}>Vaga Confirmada</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid var(--lp-border)', paddingTop: '1.5rem' }}>
              <button
                type="button"
                className="lp-btn lp-btn-primary"
                onClick={() => setSimBooked(true)}
                style={{ padding: '0.85rem 2rem', fontSize: '0.95rem' }}
              >
                {simBooked ? '✓ Horário Agendado com Sucesso!' : `Agendar ${simPet === 'thor' ? 'Thor' : 'Pipoca'} para às ${simTime}`}
              </button>

              {simBooked && (
                <div style={{ marginTop: '1rem', color: '#047857', fontWeight: 600, fontSize: '0.9rem' }}>
                  🎉 Notificação automática disparada para o WhatsApp do tutor e do tosador!
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. COMPARATIVO DIRETO ── */}
      <section className="lp-section-wrap" style={{ background: '#ffffff' }}>
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>[ 04 // BENCHMARK ]</span>
            <h2 className="lp-section-h2">Caderno vs Sistemas Genéricos vs PetShop Agenda</h2>
          </div>

          <div style={{ border: '1px solid var(--lp-border)', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--lp-bg-subtle)', borderBottom: '1px solid var(--lp-border)' }}>
                  <th style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--lp-font-mono)', fontSize: '0.75rem', color: 'var(--lp-text-muted)' }}>RECURSO</th>
                  <th style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--lp-font-mono)', fontSize: '0.75rem', color: 'var(--lp-text-muted)' }}>CADERNO / WHATSAPP</th>
                  <th style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--lp-font-mono)', fontSize: '0.75rem', color: 'var(--lp-text-muted)' }}>SISTEMA DE SALÃO GENÉRICO</th>
                  <th style={{ padding: '1.25rem 1.5rem', fontFamily: 'var(--lp-font-mono)', fontSize: '0.75rem', color: 'var(--lp-primary)', background: 'var(--lp-primary-soft)' }}>PETSHOP AGENDA V3.0</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--lp-border)' }}>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>Confirmação Automática</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Manual (Horas gastas)</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Apenas E-mail (ignorado)</td>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700, color: 'var(--lp-primary)', background: 'var(--lp-primary-soft)' }}>WhatsApp Ativo 24h</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--lp-border)' }}>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>Tempo Dinâmico por Porte</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Depende da memória</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Tempo fixo (Gera fila)</td>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700, color: 'var(--lp-primary)', background: 'var(--lp-primary-soft)' }}>Diferenciado por peso/pelo</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--lp-border)' }}>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>Ficha Clínica & Alergias</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Fichas de papel que somem</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Apenas nome do humano</td>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700, color: 'var(--lp-primary)', background: 'var(--lp-primary-soft)' }}>Histórico completo do pet</td>
                </tr>
                <tr>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700 }}>Cálculo de Comissões</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Dias fazendo conta no fim do mês</td>
                  <td style={{ padding: '1.25rem 1.5rem', color: 'var(--lp-text-muted)' }}>Complicado e burocrático</td>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 700, color: 'var(--lp-primary)', background: 'var(--lp-primary-soft)' }}>1 clique no extrato</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 7. PLANOS TRANSPARENTES ── */}
      <section id="precos" className="lp-section-wrap">
        <div className="lp-container">
          <div className="lp-section-head" style={{ textAlign: 'center', margin: '0 auto 3.5rem' }}>
            <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>[ 05 // INVESTIMENTO ]</span>
            <h2 className="lp-section-h2">Planos claros sem taxas sobre seus agendamentos.</h2>
            <p className="lp-section-sub" style={{ margin: '0 auto 1.5rem' }}>
              Teste por 14 dias sem compromisso. Se não lotar sua agenda, não pague nada.
            </p>

            <div style={{ display: 'inline-flex', background: 'var(--lp-bg-subtle)', padding: 4, borderRadius: 10, border: '1px solid var(--lp-border)' }}>
              <button
                type="button"
                className={`lp-btn ${pricingCycle === 'mensal' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                onClick={() => setPricingCycle('mensal')}
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
              >
                Mensal
              </button>
              <button
                type="button"
                className={`lp-btn ${pricingCycle === 'anual' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                onClick={() => setPricingCycle('anual')}
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
              >
                Anual (2 Meses Grátis)
              </button>
            </div>
          </div>

          <div className="lp-pricing-deck">
            {/* Plano 1 */}
            <div className="lp-plan-box">
              <span className="lp-mono-code">AUTÔNOMO / START</span>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.5rem', marginBottom: '0.25rem' }}>Essencial</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--lp-text-muted)' }}>Ideal para banhistas autônomos ou petshops com 1 a 2 pessoas.</p>

              <div className="lp-plan-price">
                {pricingCycle === 'mensal' ? 'R$ 89' : 'R$ 74'}
                <span>/mês</span>
              </div>

              <ul className="lp-plan-list">
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Até 2 profissionais</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Agendamentos ilimitados</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Link personalizado da bio</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Prontuário básico do pet</li>
              </ul>

              <Link href="/cadastro/lojista" className="lp-btn lp-btn-secondary" style={{ width: '100%' }}>
                Começar 14 dias grátis
              </Link>
            </div>

            {/* Plano 2 (Destaque) */}
            <div className="lp-plan-box highlight">
              <span className="lp-plan-crown">MAIS ESCOLHIDO</span>
              <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>PROFISSIONAL PRO</span>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.5rem', marginBottom: '0.25rem' }}>Profissional</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--lp-text-muted)' }}>Para petshops estabelecidos com equipe de banho e tosa.</p>

              <div className="lp-plan-price">
                {pricingCycle === 'mensal' ? 'R$ 149' : 'R$ 124'}
                <span>/mês</span>
              </div>

              <ul className="lp-plan-list">
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> <strong>Equipe ilimitada</strong></li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Lembretes e confirmação via WhatsApp</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Gestão automática de comissões</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Prontuário de saúde com fotos</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Suporte prioritário com especialista</li>
              </ul>

              <Link href="/cadastro/lojista" className="lp-btn lp-btn-primary" style={{ width: '100%' }}>
                Iniciar teste grátis
                <IconArrowUpRight />
              </Link>
            </div>

            {/* Plano 3 */}
            <div className="lp-plan-box">
              <span className="lp-mono-code">REDE & FRANQUIA</span>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.5rem', marginBottom: '0.25rem' }}>Multi-Loja</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--lp-text-muted)' }}>Para proprietários com 2 ou mais filiais em operação.</p>

              <div className="lp-plan-price">
                {pricingCycle === 'mensal' ? 'R$ 269' : 'R$ 219'}
                <span>/mês</span>
              </div>

              <ul className="lp-plan-list">
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Painel integrado multi-loja</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Migração assistida do seu sistema atual</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Gerente de sucesso exclusivo</li>
                <li className="lp-plan-check-item"><div className="lp-check-pill"><IconCheck /></div> Treinamento ao vivo para toda a equipe</li>
              </ul>

              <Link href="/cadastro/lojista" className="lp-btn lp-btn-secondary" style={{ width: '100%' }}>
                Falar com consultor
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. FAQ ACCORDION ── */}
      <section id="faq" className="lp-section-wrap" style={{ background: '#ffffff' }}>
        <div className="lp-container">
          <div className="lp-section-head" style={{ textAlign: 'center', margin: '0 auto 3.5rem' }}>
            <span className="lp-mono-code" style={{ color: 'var(--lp-primary)' }}>[ 06 // DÚVIDAS FREQUENTES ]</span>
            <h2 className="lp-section-h2">Tudo explicado sem letras miúdas.</h2>
          </div>

          <div className="lp-faq-container">
            {[
              {
                q: 'Preciso deixar o computador ou celular ligado para o WhatsApp funcionar?',
                a: 'Não. Nossa infraestrutura de disparo opera 100% em nuvem. Os lembretes são disparados automaticamente mesmo que sua loja esteja fechada ou sem energia elétrica.',
              },
              {
                q: 'O sistema entende as diferenças de tempo entre cães de pequeno e grande porte?',
                a: 'Com certeza! Você configura a duração de cada serviço de acordo com o porte ou raça (ex: 45 min para Poodle Toy e 1h40 para Chow Chow), evitando gargalos nas mesas e secadores.',
              },
              {
                q: 'Meus tosadores têm acesso ao faturamento total da empresa?',
                a: 'Não. Cada colaborador possui um login específico onde visualiza estritamente os seus agendamentos e o valor da sua própria comissão, mantendo os dados financeiros do proprietário protegidos.',
              },
              {
                q: 'O cliente precisa baixar algum aplicativo?',
                a: 'Não! O cliente acessa diretamente pelo navegador através do link da sua bio do Instagram ou link enviado no WhatsApp. Em menos de 30 segundos o agendamento é finalizado.',
              },
              {
                q: 'Como funciona o cancelamento? Há período de fidelidade?',
                a: 'Não temos fidelidade nem multas. Você tem total liberdade para cancelar a assinatura quando desejar diretamente pelo seu painel administrativo.',
              },
            ].map((item, index) => {
              const isOpen = openFaq === index
              return (
                <div key={index} className="lp-faq-row">
                  <button
                    type="button"
                    className="lp-faq-btn"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                  >
                    <span>{item.q}</span>
                    <IconChevronDown open={isOpen} />
                  </button>
                  {isOpen && <div className="lp-faq-answer">{item.a}</div>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── 9. FINAL CALL TO ACTION 3D ── */}
      <section className="lp-section-wrap" style={{ padding: '2rem 0 6rem' }}>
        <div className="lp-container">
          <div className="lp-final-cta-chassis">
            <span className="lp-badge-tech" style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)', marginBottom: '1.5rem' }}>
              TRANSFORME SEU PETSHOP HOJE
            </span>
            <h2>Elimine o estresse do balcão e veja sua receita crescer.</h2>
            <p>
              Mais de 180 petshops já aposentaram o caderno de papel. Junte-se a quem tem uma rotina organizada e clientes fiéis.
            </p>

            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/cadastro/lojista"
                className="lp-btn lp-btn-primary"
                style={{ padding: '1rem 2.25rem', fontSize: '1rem', background: 'var(--lp-primary)', color: '#ffffff' }}
              >
                + Começar teste grátis de 14 dias
                <IconArrowRight />
              </Link>
              <Link
                href="/login"
                className="lp-btn lp-btn-secondary"
                style={{ padding: '1rem 1.75rem', fontSize: '1rem', background: 'rgba(255, 255, 255, 0.12)', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.25)' }}
              >
                Acessar meu Petshop
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 10. FOOTER ── */}
      <footer className="lp-footer-chassis">
        <div className="lp-container">
          <div className="lp-footer-nav-grid">
            <div>
              <div className="lp-brand" style={{ marginBottom: '1.25rem' }}>
                <div className="lp-brand-logo">
                  <IconPaw />
                </div>
                <div className="lp-brand-title">
                  PetShop<span>Agenda</span>
                </div>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--lp-text-muted)', lineHeight: 1.6, maxWidth: 320 }}>
                Plataforma de alta precisão para agendamentos, gestão de equipes e fidelização do mercado pet.
              </p>
            </div>

            <div className="lp-footer-col">
              <h5>Navegação</h5>
              <ul className="lp-footer-link-stack">
                <li><a href="#demonstracao">Demonstração 3D</a></li>
                <li><a href="#recursos">Recursos da Grade</a></li>
                <li><a href="#calculadora">Calculadora ROI</a></li>
                <li><a href="#precos">Planos & Preços</a></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h5>Acessos</h5>
              <ul className="lp-footer-link-stack">
                <li><Link href="/cadastro/lojista">Cadastrar Petshop</Link></li>
                <li><Link href="/cadastro">Cadastrar como Tutor</Link></li>
                <li><Link href="/login">Entrar na Plataforma</Link></li>
                <li><Link href="/esqueci-senha">Recuperar Senha</Link></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h5>SLA & Infraestrutura</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.825rem', color: 'var(--lp-text-secondary)' }}>
                <span className="lp-badge-tech" style={{ fontSize: '0.7rem' }}>
                  <span className="lp-dot-pulse" />
                  SISTEMA 100% OPERACIONAL
                </span>
                <span>• Banco de Dados Supabase (PostgreSQL)</span>
                <span>• Criptografia TLS 1.3 / SSL 256-bit</span>
                <span>• SLA Garantido: 99.98%</span>
              </div>
            </div>
          </div>

          <div className="lp-footer-base">
            <span style={{ fontSize: '0.825rem', color: 'var(--lp-text-muted)' }}>
              © {new Date().getFullYear()} PetShop Agenda Tecnologia. Todos os direitos reservados.
            </span>
            <div style={{ display: 'flex', gap: '1.5rem', fontFamily: 'var(--lp-font-mono)', fontSize: '0.75rem', color: 'var(--lp-text-faint)' }}>
              <span>LATÊNCIA: 18ms</span>
              <span>DEPLOY: VERCEL EDGE</span>
              <span>VERSÃO: 3.0.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
