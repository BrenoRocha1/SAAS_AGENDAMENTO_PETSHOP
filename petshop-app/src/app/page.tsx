'use client'

import { useState } from 'react'
import Link from 'next/link'
import './landing.css'

/* ------------------------------------------------------------------ *
 * ÍCONES DE LINHA MINIMALISTAS (1.75 stroke)
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
        transition: 'transform 0.2s ease',
      }}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * COMPONENTE PRINCIPAL
 * ------------------------------------------------------------------ */
export default function LandingPage() {
  const [perspective, setPerspective] = useState<'lojista' | 'cliente'>('lojista')
  const [pricingCycle, setPricingCycle] = useState<'mensal' | 'anual'>('mensal')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [activeTabPreview, setActiveTabPreview] = useState<'agenda' | 'whatsapp' | 'pet'>('agenda')

  return (
    <div className="lp-wrapper">
      {/* ── 1. NAVBAR REFINADA COM STATUS LIVE ── */}
      <nav className="lp-nav">
        <div className="lp-container">
          <div className="lp-nav-inner">
            <Link href="/" className="lp-brand">
              <div className="lp-brand-logo">
                <IconPaw />
              </div>
              <div className="lp-brand-text">
                PetShop<span>Agenda</span>
              </div>
            </Link>

            <ul className="lp-nav-links">
              <li><a href="#recursos" className="lp-nav-link">Recursos</a></li>
              <li><a href="#demonstracao" className="lp-nav-link">Demonstração</a></li>
              <li><a href="#experiencia" className="lp-nav-link">Para Petshops</a></li>
              <li><a href="#comparativo" className="lp-nav-link">Diferenciais</a></li>
              <li><a href="#precos" className="lp-nav-link">Planos</a></li>
              <li><a href="#faq" className="lp-nav-link">Dúvidas</a></li>
            </ul>

            <div className="lp-nav-actions">
              <Link href="/login" className="lp-btn lp-btn-ghost">
                Entrar
              </Link>
              <Link href="/cadastro/lojista" className="lp-btn lp-btn-primary">
                Começar Grátis
                <IconArrowUpRight />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── 2. HERO SECTION COM IDENTIDADE EDITORIAL ── */}
      <header className="lp-hero">
        <div className="lp-container">
          <div className="lp-hero-header">
            <div className="lp-pill">
              <span className="lp-dot-pulse" />
              <span>SISTEMA DE AGENDAMENTO INTELIGENTE • V2.4</span>
            </div>

            <h1 className="lp-hero-title">
              A agenda que <em>elimina o caos no balcão</em> e lota o banho e tosa.
            </h1>

            <p className="lp-hero-desc">
              Chega de perder agendamentos no WhatsApp ou sofrer com clientes que faltam sem avisar.
              Uma plataforma especializada que confirma horários no automático, organiza tosadores
              e oferece agendamento online 24h para seus tutores.
            </p>

            <div className="lp-hero-actions">
              <Link href="/cadastro/lojista" className="lp-btn lp-btn-primary" style={{ padding: '0.85rem 1.75rem', fontSize: '0.95rem' }}>
                Cadastrar meu Petshop gratuitamente
                <IconArrowRight />
              </Link>
              <Link href="/cadastro" className="lp-btn lp-btn-outline" style={{ padding: '0.85rem 1.5rem', fontSize: '0.95rem' }}>
                Sou Tutor e quero agendar
              </Link>
            </div>

            <div className="lp-hero-microcopy">
              <span>✓ Teste grátis por 14 dias</span>
              <span>✓ Sem necessidade de cartão</span>
              <span>✓ Configuração guiada em 5 min</span>
            </div>
          </div>

          {/* METRICS RIBBON */}
          <div className="lp-metrics-ribbon">
            <div className="lp-metric-item">
              <span className="lp-metric-value">+180</span>
              <span className="lp-metric-label">Petshops operando diariamente</span>
            </div>
            <div className="lp-metric-item">
              <span className="lp-metric-value">85%</span>
              <span className="lp-metric-label">Menos faltas com lembrete WhatsApp</span>
            </div>
            <div className="lp-metric-item">
              <span className="lp-metric-value">3.5h</span>
              <span className="lp-metric-label">Economizadas por dia no balcão</span>
            </div>
            <div className="lp-metric-item">
              <span className="lp-metric-value">4.9 / 5</span>
              <span className="lp-metric-label">Satisfação dos tutores de pets</span>
            </div>
          </div>

          {/* ── 3. HERO CONSOLE INTERATIVO / DEMO REALISTA ── */}
          <section id="demonstracao" className="lp-console">
            <div className="lp-console-topbar">
              <div className="lp-console-dots">
                <span className="lp-console-dot" />
                <span className="lp-console-dot" />
                <span className="lp-console-dot" />
                <span className="lp-mono-tag" style={{ marginLeft: '0.5rem' }}>
                  PAINEL OPERACIONAL // HOJE, 14:00 - 18:00
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTabPreview('agenda')}
                  className={`lp-btn ${activeTabPreview === 'agenda' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
                >
                  Grade de Horários
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabPreview('whatsapp')}
                  className={`lp-btn ${activeTabPreview === 'whatsapp' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
                >
                  Automação WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabPreview('pet')}
                  className={`lp-btn ${activeTabPreview === 'pet' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.775rem' }}
                >
                  Prontuário do Pet
                </button>
              </div>
            </div>

            <div className="lp-console-main">
              {/* Painel Principal de Demonstração */}
              <div className="lp-console-schedule">
                {activeTabPreview === 'agenda' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Quinta-feira, 17 de Setembro</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--lp-ink-faint)', margin: 0 }}>4 profissionais ativos • 18 atendimentos previstos</p>
                      </div>
                      <span className="lp-pill" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
                        ● 92% de ocupação
                      </span>
                    </div>

                    {/* Slot 1 */}
                    <div className="lp-slot-card">
                      <div className="lp-slot-time">14:00 - 15:30</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <strong style={{ fontSize: '0.95rem', color: 'var(--lp-ink)' }}>Thor</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--lp-ink-faint)', marginLeft: '0.5rem' }}>Golden Retriever (32 kg)</span>
                          </div>
                          <span className="lp-status-chip lp-status-active">Em Atendimento 🚿</span>
                        </div>
                        <div style={{ fontSize: '0.825rem', color: 'var(--lp-ink-secondary)', marginTop: '0.35rem' }}>
                          Banho Terapêutico + Tosa Tesoura • Tosador: <strong>Lucas Martins</strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--lp-amber)', marginTop: '0.25rem', background: 'var(--lp-amber-soft)', padding: '0.25rem 0.5rem', borderRadius: 4, display: 'inline-block' }}>
                          ⚠️ Pelo denso nas orelhas — usar shampoo hipoalergênico
                        </div>
                      </div>
                    </div>

                    {/* Slot 2 */}
                    <div className="lp-slot-card">
                      <div className="lp-slot-time">14:30 - 15:15</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <strong style={{ fontSize: '0.95rem', color: 'var(--lp-ink)' }}>Mel</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--lp-ink-faint)', marginLeft: '0.5rem' }}>Shih Tzu (5.2 kg)</span>
                          </div>
                          <span className="lp-status-chip lp-status-done">Finalizado ✨</span>
                        </div>
                        <div style={{ fontSize: '0.825rem', color: 'var(--lp-ink-secondary)', marginTop: '0.35rem' }}>
                          Banho Completo + Hidratação Argan • Banhista: <strong>Beatriz Silva</strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--lp-ink-faint)', marginTop: '0.25rem' }}>
                          Tutor avisado via WhatsApp às 15:12 para retirada
                        </div>
                      </div>
                    </div>

                    {/* Slot 3 */}
                    <div className="lp-slot-card">
                      <div className="lp-slot-time">15:30 - 16:30</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <strong style={{ fontSize: '0.95rem', color: 'var(--lp-ink)' }}>Bob</strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--lp-ink-faint)', marginLeft: '0.5rem' }}>Spitz Alemão (3.8 kg)</span>
                          </div>
                          <span className="lp-status-chip lp-status-wait">Confirmado pelo Tutor ✓</span>
                        </div>
                        <div style={{ fontSize: '0.825rem', color: 'var(--lp-ink-secondary)', marginTop: '0.35rem' }}>
                          Tosa Bebê + Escovação de Dentes • Tosador: <strong>Lucas Martins</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTabPreview === 'whatsapp' && (
                  <div className="lp-chat-box">
                    <div className="lp-chat-msg lp-chat-in">
                      <strong>PetCare Estética Animal</strong><br />
                      Olá, Mariana! Lembrete do agendamento do <strong>Bob</strong> amanhã (18/09) às <strong>15:30</strong> para Tosa Bebê.
                      <div className="lp-chat-btn-group">
                        <button type="button" className="lp-chat-btn">✓ Confirmar presença</button>
                        <button type="button" className="lp-chat-btn" style={{ borderColor: '#ccc', color: '#666' }}>Reagendar horário</button>
                      </div>
                    </div>

                    <div className="lp-chat-msg lp-chat-out">
                      Confirmar presença
                    </div>

                    <div className="lp-chat-msg lp-chat-in">
                      Perfeito! Seu horário está confirmado com o Lucas. Estamos ansiosos para receber o Bob! 🐾
                    </div>
                  </div>
                )}

                {activeTabPreview === 'pet' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ width: 54, height: 54, borderRadius: 12, background: 'var(--lp-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', border: '1px solid var(--lp-border)' }}>
                        🐕
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Thor — Golden Retriever</h4>
                        <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--lp-ink-faint)' }}>Tutor: Marcelo Albuquerque • (11) 98765-4321</p>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                      <div style={{ background: 'var(--lp-bg-subtle)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--lp-border-light)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--lp-ink-faint)' }}>PESO ATUAL</span>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>32.4 kg</div>
                      </div>
                      <div style={{ background: 'var(--lp-bg-subtle)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--lp-border-light)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--lp-ink-faint)' }}>FREQUÊNCIA</span>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Quinzenal</div>
                      </div>
                      <div style={{ background: 'var(--lp-bg-subtle)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--lp-border-light)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--lp-ink-faint)' }}>TOTAL VISITAS</span>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>14 banhos</div>
                      </div>
                    </div>

                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: '0.85rem', fontSize: '0.85rem', color: '#92400e' }}>
                      <strong>Observações do Tosador:</strong> Não gosta do soprador próximo aos olhos. Usar toalha morna e finalizador sem perfume.
                    </div>
                  </div>
                )}
              </div>

              {/* Barra Lateral do Console */}
              <div className="lp-console-sidebar">
                <span className="lp-mono-tag" style={{ display: 'block', marginBottom: '1rem' }}>
                  REGISTRO OPERACIONAL
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.825rem' }}>
                  <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--lp-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--lp-ink-faint)', fontSize: '0.725rem' }}>
                      <span>WHATSAPP BOT</span>
                      <span>14:15</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--lp-ink)' }}>
                      Confirmação recebida de <strong>Mariana F.</strong> (Bob). Grade atualizada.
                    </p>
                  </div>

                  <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--lp-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--lp-ink-faint)', fontSize: '0.725rem' }}>
                      <span>RECEPÇÃO</span>
                      <span>14:02</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--lp-ink)' }}>
                      Check-in efetuado para <strong>Thor</strong>. Encaminhado para banheira 02.
                    </p>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--lp-ink-faint)', fontSize: '0.725rem' }}>
                      <span>AUTOMAÇÃO DE RETORNO</span>
                      <span>13:40</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--lp-ink)' }}>
                      Lembrete de retorno disparado para 3 tutores ausentes há +25 dias.
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--lp-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--lp-ink-faint)' }}>Faturamento Hoje:</span>
                    <strong style={{ fontSize: '1rem', color: 'var(--lp-accent-700)' }}>R$ 1.840,00</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </header>

      {/* ── 4. BENTO GRID: RECURSOS DETALHADOS ── */}
      <section id="recursos" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-heading">
            <span className="lp-mono-tag">[ 01 // ARQUITETURA DO SISTEMA ]</span>
            <h2 className="lp-section-title">Construído com a precisão que seu petshop exige.</h2>
            <p className="lp-section-desc">
              Não somos um sistema genérico de agendamento de barbearia adaptado. Cada detalhe
              foi pensado para o fluxo real de recepção, banheira, mesa de tosa e tutores de pets.
            </p>
          </div>

          <div className="lp-bento-grid">
            {/* Card 1: Grande (Agenda Multiprofissional) */}
            <div className="lp-bento-card col-span-2">
              <div className="lp-bento-header">
                <span className="lp-mono-tag">[ GESTÃO DE CAPACIDADE ]</span>
                <h3>Agenda Multiprofissional sem Sobreposição</h3>
                <p>
                  Configure a capacidade real do seu espaço: quantas banheiras estão livres, quais tosadores
                  são especialistas em tesoura e o tempo específico de secagem por porte de cão. O sistema
                  impede marcações impossíveis e respeita os intervalos de higienização.
                </p>
              </div>

              <div className="lp-bento-preview">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--lp-border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--lp-ink-faint)' }}>MESA 01 (LUCAS)</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-accent-600)', marginTop: 2 }}>Tosa Tesoura</div>
                  </div>
                  <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--lp-border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--lp-ink-faint)' }}>BANHEIRA 01 (BEATRIZ)</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#166534', marginTop: 2 }}>Banho Porte G</div>
                  </div>
                  <div style={{ background: '#fff', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--lp-border)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--lp-ink-faint)' }}>SOPRADOR / SECAGEM</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--lp-ink)', marginTop: 2 }}>Livre (10 min)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: WhatsApp Automation */}
            <div className="lp-bento-card">
              <div className="lp-bento-header">
                <span className="lp-mono-tag">[ ZERO NO-SHOW ]</span>
                <h3>Confirmação Ativa de Presença</h3>
                <p>
                  Disparo automático de lembretes antes do horário agendado. O tutor confirma com 1 toque
                  e seu painel muda de cor na hora. Se ele cancelar, o slot fica imediatamente disponível para encaixe.
                </p>
              </div>
              <div className="lp-bento-preview" style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--lp-accent)' }}>-85%</span>
                <p style={{ fontSize: '0.8rem', color: 'var(--lp-ink-muted)', margin: 0 }}>taxa de ausência reduzida</p>
              </div>
            </div>

            {/* Card 3: Link de Bio / Autoagendamento */}
            <div className="lp-bento-card">
              <div className="lp-bento-header">
                <span className="lp-mono-tag">[ PORTAL DO TUTOR ]</span>
                <h3>Link na Bio do Instagram</h3>
                <p>
                  Seu cliente escolhe o pet cadastrado, seleciona o serviço e vê os horários vagos em tempo real.
                  Sem precisar esperar alguém responder no direct no domingo à noite.
                </p>
              </div>
              <div className="lp-bento-preview" style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '0.8rem', color: 'var(--lp-ink-secondary)' }}>
                petagenda.com.br/@seupetshop
              </div>
            </div>

            {/* Card 4: Comissões e Equipe */}
            <div className="lp-bento-card">
              <div className="lp-bento-header">
                <span className="lp-mono-tag">[ CONTROLE DE EQUIPE ]</span>
                <h3>Comissões Calculadas sem Planilhas</h3>
                <p>
                  Defina porcentagens ou valores fixos por procedimento para cada funcionário.
                  O relatório de comissão fecha automaticamente sem discussões no fim do mês.
                </p>
              </div>
              <div className="lp-bento-preview" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Comissão Quinzenal</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--lp-accent-700)', fontWeight: 700 }}>R$ 1.420,00</span>
              </div>
            </div>

            {/* Card 5: Prontuário & Histórico */}
            <div className="lp-bento-card">
              <div className="lp-bento-header">
                <span className="lp-mono-tag">[ HISTÓRICO VETERINÁRIO ]</span>
                <h3>Ficha de Saúde e Preferências</h3>
                <p>
                  Registre alergias, se o cão morde para cortar as unhas, remédios controlados e fotos de tosas
                  anteriores para repetir o corte exatamente do jeito que a tutora gosta.
                </p>
              </div>
              <div className="lp-bento-preview" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="lp-status-chip lp-status-active">Sem pulgas ✓</span>
                <span className="lp-status-chip" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>Alergia a perfume</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. PERSPECTIVAS: PARA O LOJISTA VS PARA O CLIENTE ── */}
      <section id="experiencia" className="lp-section" style={{ background: 'var(--lp-bg-subtle)' }}>
        <div className="lp-container">
          <div className="lp-section-heading" style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 3rem' }}>
            <span className="lp-mono-tag">[ DUAL EXPERIENCE ]</span>
            <h2 className="lp-section-title">Pensado tanto para quem opera quanto para quem ama seu pet.</h2>
            <p className="lp-section-desc" style={{ margin: '0 auto' }}>
              Uma experiência fluida e sem atritos para os dois lados do balcão.
            </p>

            <div style={{ marginTop: '2rem' }}>
              <div className="lp-toggle-wrap">
                <button
                  type="button"
                  className={`lp-toggle-btn ${perspective === 'lojista' ? 'active' : ''}`}
                  onClick={() => setPerspective('lojista')}
                >
                  Para Donos de Petshop & Equipe
                </button>
                <button
                  type="button"
                  className={`lp-toggle-btn ${perspective === 'cliente' ? 'active' : ''}`}
                  onClick={() => setPerspective('cliente')}
                >
                  Para Tutores & Clientes
                </button>
              </div>
            </div>
          </div>

          <div className="lp-perspective-grid">
            {perspective === 'lojista' ? (
              <>
                <div className="lp-role-card">
                  <div className="lp-role-card-icon"><IconCalendar /></div>
                  <h4>Controle de Grade em Tempo Real</h4>
                  <p>Visualize toda a semana por profissional ou por espaço. Encaixe clientes de última hora sem desorganizar os horários seguintes.</p>
                </div>
                <div className="lp-role-card">
                  <div className="lp-role-card-icon"><IconUsers /></div>
                  <h4>Níveis de Permissão Seguros</h4>
                  <p>Cada tosador vê apenas a sua própria agenda e seus clientes, mantendo o faturamento e os dados sigilosos protegidos.</p>
                </div>
                <div className="lp-role-card">
                  <div className="lp-role-card-icon"><IconTrendingUp /></div>
                  <h4>Recuperação de Clientes Inativos</h4>
                  <p>Notificação automática para cães que não voltam há mais de 25 dias. Reative clientes adormecidos sem esforço manual.</p>
                </div>
              </>
            ) : (
              <>
                <div className="lp-role-card">
                  <div className="lp-role-card-icon"><IconClock /></div>
                  <h4>Agendamento em 30 Segundos</h4>
                  <p>Escolha o pet, o tosador preferido e o horário perfeito direto pelo celular, mesmo fora do horário comercial.</p>
                </div>
                <div className="lp-role-card">
                  <div className="lp-role-card-icon"><IconMessageCircle /></div>
                  <h4>Avisos de Quando Buscar</h4>
                  <p>Receba uma notificação carinhosa no WhatsApp assim que o pet terminar de secar e estiver pronto para ir pra casa.</p>
                </div>
                <div className="lp-role-card">
                  <div className="lp-role-card-icon"><IconShieldCheck /></div>
                  <h4>Histórico Completo do seu Filho de 4 Patas</h4>
                  <p>Acompanhe peso, datas de banho, tosas realizadas e observações veterinárias registradas pelo petshop.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 6. COMPARATIVO DIRETO (DIFERENCIAIS) ── */}
      <section id="comparativo" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-heading">
            <span className="lp-mono-tag">[ COMPARATIVO DE MERCADO ]</span>
            <h2 className="lp-section-title">Por que substituir o caderno ou sistemas genéricos?</h2>
            <p className="lp-section-desc">
              Veja a diferença prática entre ferramentas improvisadas e um sistema feito sob medida para banho e tosa.
            </p>
          </div>

          <div className="lp-compare-table-wrap">
            <table className="lp-compare-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Funcionalidade</th>
                  <th style={{ width: '22%' }}>Caderno & WhatsApp</th>
                  <th style={{ width: '22%' }}>Sistemas Genéricos</th>
                  <th className="highlight" style={{ width: '26%' }}>PetShop Agenda</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Confirmação de Agendamento</strong></td>
                  <td>Manual (1 a 2 horas/dia)</td>
                  <td>E-mail (baixa taxa de abertura)</td>
                  <td className="highlight">WhatsApp Automático com 1 clique</td>
                </tr>
                <tr>
                  <td><strong>Diferenciação por Porte & Raça</strong></td>
                  <td>Depende da memória do atendente</td>
                  <td>Tempo fixo igual para todos</td>
                  <td className="highlight">Tempo dinâmico por peso e pelagem</td>
                </tr>
                <tr>
                  <td><strong>Agendamento pelo Cliente 24/7</strong></td>
                  <td>Não (apenas horário de atendimento)</td>
                  <td>Geralmente exige download de app</td>
                  <td className="highlight">Link direto na bio sem baixar nada</td>
                </tr>
                <tr>
                  <td><strong>Prontuário com Histórico e Alergias</strong></td>
                  <td>Papel solto ou fichas perdidas</td>
                  <td>Apenas nome e telefone</td>
                  <td className="highlight">Fotos, alertas de saúde e histórico</td>
                </tr>
                <tr>
                  <td><strong>Cálculo Automático de Comissões</strong></td>
                  <td>Contas no fim do mês no papel</td>
                  <td>Módulo financeiro complexo</td>
                  <td className="highlight">1 clique por serviço ou tosador</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 7. PLANOS TRANSPARENTES (PRICING) ── */}
      <section id="precos" className="lp-section" style={{ background: 'var(--lp-bg-subtle)' }}>
        <div className="lp-container">
          <div className="lp-section-heading" style={{ textAlign: 'center', maxWidth: 650, margin: '0 auto 3rem' }}>
            <span className="lp-mono-tag">[ INVESTIMENTO TRANSPARENTE ]</span>
            <h2 className="lp-section-title">Planos previsíveis. Sem taxas ocultas por agendamento.</h2>
            <p className="lp-section-desc" style={{ margin: '0 auto 1.5rem' }}>
              Teste por 14 dias sem compromisso. Cancele a qualquer momento com um clique.
            </p>

            <div className="lp-toggle-wrap">
              <button
                type="button"
                className={`lp-toggle-btn ${pricingCycle === 'mensal' ? 'active' : ''}`}
                onClick={() => setPricingCycle('mensal')}
              >
                Cobrança Mensal
              </button>
              <button
                type="button"
                className={`lp-toggle-btn ${pricingCycle === 'anual' ? 'active' : ''}`}
                onClick={() => setPricingCycle('anual')}
              >
                Cobrança Anual (2 meses grátis)
              </button>
            </div>
          </div>

          <div className="lp-pricing-grid">
            {/* Plano Inicial */}
            <div className="lp-price-card">
              <span className="lp-mono-tag">INICIANTE</span>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.5rem', marginBottom: '0.25rem' }}>Essencial</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--lp-ink-muted)' }}>Para petshops individuais ou banhistas autônomos.</p>

              <div className="lp-price-val">
                {pricingCycle === 'mensal' ? 'R$ 89' : 'R$ 74'}
                <span>/mês</span>
              </div>

              <ul className="lp-price-features">
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Até 2 profissionais</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Agendamentos ilimitados</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Link personalizado da bio</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Prontuário básico do pet</li>
              </ul>

              <Link href="/cadastro/lojista" className="lp-btn lp-btn-outline" style={{ width: '100%' }}>
                Começar 14 dias grátis
              </Link>
            </div>

            {/* Plano Pro (Destaque) */}
            <div className="lp-price-card featured">
              <span className="lp-featured-badge">RECOMENDADO</span>
              <span className="lp-mono-tag">CRESCIMENTO</span>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.5rem', marginBottom: '0.25rem' }}>Profissional</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--lp-ink-muted)' }}>O mais escolhido por petshops consolidados.</p>

              <div className="lp-price-val">
                {pricingCycle === 'mensal' ? 'R$ 149' : 'R$ 124'}
                <span>/mês</span>
              </div>

              <ul className="lp-price-features">
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> <strong>Equipe ilimitada</strong></li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Lembretes automáticos via WhatsApp</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Gestão de comissões por funcionário</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Ficha de saúde e histórico completo</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Suporte prioritário via WhatsApp</li>
              </ul>

              <Link href="/cadastro/lojista" className="lp-btn lp-btn-primary" style={{ width: '100%' }}>
                Iniciar teste grátis
                <IconArrowUpRight />
              </Link>
            </div>

            {/* Plano Redes / Multi-loja */}
            <div className="lp-price-card">
              <span className="lp-mono-tag">MULTI-UNIDADES</span>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.5rem', marginBottom: '0.25rem' }}>Franquias & Redes</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--lp-ink-muted)' }}>Para quem gerencia 2 ou mais filiais em conjunto.</p>

              <div className="lp-price-val">
                {pricingCycle === 'mensal' ? 'R$ 269' : 'R$ 219'}
                <span>/mês</span>
              </div>

              <ul className="lp-price-features">
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Múltiplas filiais no mesmo painel</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Painel financeiro consolidado</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Migração assistida dos seus dados</li>
                <li className="lp-price-feature-item"><span className="lp-check-icon"><IconCheck /></span> Gerente de conta dedicado</li>
              </ul>

              <Link href="/cadastro/lojista" className="lp-btn lp-btn-outline" style={{ width: '100%' }}>
                Falar com consultor
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. FAQ ACCORDION INTERATIVO ── */}
      <section id="faq" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-heading" style={{ textAlign: 'center', maxWidth: 650, margin: '0 auto 3rem' }}>
            <span className="lp-mono-tag">[ ESCLARECIMENTOS ]</span>
            <h2 className="lp-section-title">Perguntas frequentes</h2>
            <p className="lp-section-desc" style={{ margin: '0 auto' }}>
              Tudo o que você precisa saber antes de transformar a rotina do seu petshop.
            </p>
          </div>

          <div className="lp-faq-list">
            {[
              {
                q: 'Preciso instalar algum aplicativo no computador da loja?',
                a: 'Não. O PetShop Agenda é 100% online e funciona direto no navegador de qualquer dispositivo: computador, notebook, tablet ou smartphone. Seus dados ficam salvos em nuvem de alta segurança.',
              },
              {
                q: 'Como funciona a confirmação pelo WhatsApp? Meu celular precisa ficar ligado?',
                a: 'O sistema possui integração em nuvem direta com servidores de mensagens. Você não precisa manter celular conectado ou computador ligado para que os lembretes automáticos sejam disparados.',
              },
              {
                q: 'Meus clientes precisam baixar aplicativo para agendar um banho?',
                a: 'Não! O tutor acessa um link leve e rápido (ideal para colocar na bio do Instagram ou enviar pelo WhatsApp). Em menos de 30 segundos ele seleciona o pet, o serviço e confirma.',
              },
              {
                q: 'Consigo controlar comissões de tosadores e banhistas?',
                a: 'Sim. Você pode definir regras individuais de comissão (porcentagem por serviço ou valor fixo por tosa/banho). Ao final da semana ou do mês, o sistema gera o extrato pronto de pagamento.',
              },
              {
                q: 'E se um cliente faltar sem avisar?',
                a: 'Nossa taxa média de no-show é inferior a 3% porque enviamos lembretes com antecedência de 24h e 2h. Caso o cliente responda que não poderá comparecer, o horário fica vago para encaixe imediatamente.',
              },
              {
                q: 'Tenho fidelidade ou multa se quiser cancelar?',
                a: 'Nenhuma fidelidade. Você pode cancelar sua assinatura a qualquer momento com um único clique no painel, sem taxas extras e sem pegadinhas.',
              },
            ].map((faq, i) => {
              const isOpen = openFaq === i
              return (
                <div key={i} className="lp-faq-item">
                  <button
                    type="button"
                    className="lp-faq-trigger"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <IconChevronDown open={isOpen} />
                  </button>
                  {isOpen && <div className="lp-faq-content">{faq.a}</div>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── 9. CTA FINAL EDITORIAL ── */}
      <section className="lp-section" style={{ padding: '0 0 5.5rem' }}>
        <div className="lp-container">
          <div className="lp-cta-box">
            <span className="lp-mono-tag" style={{ marginBottom: '1rem', display: 'inline-block' }}>
              [ INÍCIO IMEDIATO ]
            </span>
            <h2>Eleve a operação do seu petshop hoje mesmo.</h2>
            <p>
              Junte-se a mais de 180 petshops que deixaram o caderno para trás e conquistaram
              uma rotina tranquila e previsível.
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/cadastro/lojista"
                className="lp-btn lp-btn-primary"
                style={{ padding: '0.85rem 2rem', fontSize: '1rem' }}
              >
                Criar conta do meu Petshop
                <IconArrowRight />
              </Link>
              <Link
                href="/login"
                className="lp-btn lp-btn-outline"
                style={{ padding: '0.85rem 1.5rem', fontSize: '1rem' }}
              >
                Acessar conta existente
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 10. FOOTER ESTILO OXISIUS (METADADOS TÉCNICOS) ── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-col">
              <div className="lp-brand" style={{ marginBottom: '1rem' }}>
                <div className="lp-brand-logo">
                  <IconPaw />
                </div>
                <div className="lp-brand-text">
                  PetShop<span>Agenda</span>
                </div>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--lp-ink-muted)', maxWidth: 320, lineHeight: 1.6 }}>
                Tecnologia especializada em agendamento, gestão de equipe e fidelização para o mercado pet.
              </p>
            </div>

            <div className="lp-footer-col">
              <h5>Navegação</h5>
              <ul className="lp-footer-links">
                <li><a href="#recursos" className="lp-footer-link">Recursos</a></li>
                <li><a href="#demonstracao" className="lp-footer-link">Demonstração</a></li>
                <li><a href="#precos" className="lp-footer-link">Planos & Preços</a></li>
                <li><a href="#faq" className="lp-footer-link">Perguntas Frequentes</a></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h5>Acessos</h5>
              <ul className="lp-footer-links">
                <li><Link href="/cadastro/lojista" className="lp-footer-link">Cadastrar Petshop</Link></li>
                <li><Link href="/cadastro" className="lp-footer-link">Cadastro de Tutor</Link></li>
                <li><Link href="/login" className="lp-footer-link">Entrar no Painel</Link></li>
                <li><Link href="/esqueci-senha" className="lp-footer-link">Recuperar Senha</Link></li>
              </ul>
            </div>

            <div className="lp-footer-col">
              <h5>Segurança & SLA</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--lp-ink-secondary)' }}>
                <span className="lp-pill" style={{ fontSize: '0.7rem' }}>
                  <span className="lp-dot-pulse" />
                  SISTEMA 100% OPERACIONAL
                </span>
                <span>• Criptografia SSL ponta a ponta</span>
                <span>• Servidores PostgreSQL / Supabase</span>
                <span>• Conforme diretrizes LGPD</span>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span style={{ fontSize: '0.8rem', color: 'var(--lp-ink-faint)' }}>
              © {new Date().getFullYear()} PetShop Agenda Tecnologia Ltda. Todos os direitos reservados.
            </span>
            <div className="lp-footer-meta">
              <span>LATÊNCIA: 24ms</span>
              <span>SLA: 99.98%</span>
              <span>VERSÃO: 2.4.1</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
