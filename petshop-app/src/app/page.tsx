'use client'

import Link from 'next/link'
import './landing.css'

/* ------------------------------------------------------------------ *
 * SAIP — LANDING PAGE EDITORIAL (OXISIUS-INSPIRED)
 * Sistema de Agendamento Inteligente para Petshop
 * ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="lp">
      {/* ── NAVBAR ── */}
      <nav className="lp-nav">
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
              <Link href="/login" className="lp-bracket-btn">
                Entrar
              </Link>
              <Link href="/cadastro/lojista" className="lp-cta-btn" style={{ padding: '0.65rem 1.5rem', fontSize: '0.75rem' }}>
                Começar agora ↗
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="lp-hero">
        <div className="lp-container">
          <div className="lp-hero-layout">
            {/* Left — Typography */}
            <div className="lp-hero-content">
              <span className="lp-tag lp-tag--primary">Sistema de Agendamento Inteligente</span>

              <h1 className="lp-hero-title">
                Agendamento inteligente para petshops que levam
                <em> o ofício a sério.</em>
              </h1>

              <p className="lp-lead">
                <strong>Automatize 100% da sua recepção</strong>, elimine faltas com
                confirmações no WhatsApp e dê aos tutores o poder de agendar
                em 30 segundos — sem instalar nada.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <Link href="/cadastro/lojista" className="lp-cta-btn">
                  Iniciar teste grátis ↗
                </Link>
                <a href="#capacidades" className="lp-cta-btn lp-cta-btn--outline">
                  Explorar capacidades
                </a>
              </div>
            </div>

            {/* Right — App Preview */}
            <div className="lp-hero-visual lp-animate lp-animate-d2">
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
                    <span className="lp-app-status lp-app-status--active">● 3 em andamento</span>
                  </div>

                  <div className="lp-schedule-item">
                    <span className="lp-schedule-time">14:00</span>
                    <div className="lp-schedule-info">
                      <div className="lp-schedule-name">Thor — Golden Retriever</div>
                      <div className="lp-schedule-detail">Banho Terapêutico + Tosa Higiênica • Lucas M.</div>
                      <span className="lp-schedule-alert">⚠ Alergia a perfumes cítricos</span>
                    </div>
                  </div>

                  <div className="lp-schedule-item">
                    <span className="lp-schedule-time">14:30</span>
                    <div className="lp-schedule-info">
                      <div className="lp-schedule-name">Mel — Shih Tzu</div>
                      <div className="lp-schedule-detail">Tosa Bebê Tesoura + Hidratação • Beatriz S.</div>
                    </div>
                  </div>

                  <div className="lp-schedule-item">
                    <span className="lp-schedule-time">15:30</span>
                    <div className="lp-schedule-info">
                      <div className="lp-schedule-name">Pipoca — Spitz Alemão</div>
                      <div className="lp-schedule-detail">Desembolo + Banho de Hidratação • Lucas M.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="lp-hero-stats lp-animate lp-animate-d3">
            <div className="lp-stat">
              <span className="lp-stat-value">180+</span>
              <span className="lp-stat-label">Petshops ativos</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">85%</span>
              <span className="lp-stat-label">Redução de faltas</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">3.5h</span>
              <span className="lp-stat-label">Economizadas / dia</span>
            </div>
            <div className="lp-stat">
              <span className="lp-stat-value">4.9★</span>
              <span className="lp-stat-label">Avaliação dos tutores</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── HAIRLINE ── */}
      <hr className="lp-hairline" />

      {/* ── S/01 — CAPACIDADES ── */}
      <section id="capacidades" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index">S / 01</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary">Capacidades</span>
                <h2 className="lp-display lp-display--section">
                  Desenhado para a física real de um petshop.
                </h2>
                <p className="lp-lead">
                  Sistemas genéricos não entendem que um <strong>Golden Retriever leva 1h40 de secador</strong> enquanto
                  um Shih Tzu leva 40min. Nossa inteligência de grade calcula banheiras, mesas e tosadores
                  para evitar filas.
                </p>
              </div>

              <div className="lp-capabilities">
                <div className="lp-capability">
                  <span className="lp-capability-num">[01]</span>
                  <div className="lp-capability-content">
                    <h3 className="lp-capability-title">Automação de Agenda</h3>
                    <p className="lp-capability-desc">
                      O sistema <strong>bloqueia automaticamente</strong> novas reservas caso todas as banheiras estejam
                      ocupadas ou se o único tosador especialista em corte na tesoura já estiver com horário preenchido.
                      Zero atrasos no balcão.
                    </p>
                    <div className="lp-capability-tags">
                      <span className="lp-pill">Anti-overbooking</span>
                      <span className="lp-pill">Banheiras</span>
                      <span className="lp-pill">Mesas</span>
                      <span className="lp-pill">Sopradores</span>
                    </div>
                  </div>
                </div>

                <div className="lp-capability">
                  <span className="lp-capability-num">[02]</span>
                  <div className="lp-capability-content">
                    <h3 className="lp-capability-title">Confirmação via WhatsApp</h3>
                    <p className="lp-capability-desc">
                      Chega de passar <strong>2 horas da manhã ligando</strong> para tutores. O sistema dispara lembretes
                      automáticos com botão de confirmação. Se o cliente cancelar, a vaga é liberada na hora
                      e preenchida por lista de espera.
                    </p>
                    <div className="lp-capability-tags">
                      <span className="lp-pill">Cloud API</span>
                      <span className="lp-pill">Confirmação 1-clique</span>
                      <span className="lp-pill">Lista de espera</span>
                    </div>
                  </div>
                </div>

                <div className="lp-capability">
                  <span className="lp-capability-num">[03]</span>
                  <div className="lp-capability-content">
                    <h3 className="lp-capability-title">Portal do Tutor</h3>
                    <p className="lp-capability-desc">
                      Link exclusivo para a bio do Instagram: <strong>o cliente escolhe o pet</strong>, o pacote de serviços
                      e marca em menos de 30 segundos. Sem instalar app, sem mandar direct, sem ligar.
                    </p>
                    <div className="lp-capability-tags">
                      <span className="lp-pill">Link na bio</span>
                      <span className="lp-pill">PWA</span>
                      <span className="lp-pill">Sem download</span>
                    </div>
                  </div>
                </div>

                <div className="lp-capability">
                  <span className="lp-capability-num">[04]</span>
                  <div className="lp-capability-content">
                    <h3 className="lp-capability-title">Gestão de Equipe e Comissões</h3>
                    <p className="lp-capability-desc">
                      Regras flexíveis: porcentagem por serviço, bônus por hidratação vendida ou valor fixo
                      por procedimento. <strong>Relatório transparente</strong> para o colaborador auditar no próprio celular,
                      sem precisar de Excel.
                    </p>
                    <div className="lp-capability-tags">
                      <span className="lp-pill">Comissões</span>
                      <span className="lp-pill">Fechamento de caixa</span>
                      <span className="lp-pill">Relatório</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERSTITIAL STATEMENT ── */}
      <div className="lp-statement">
        <div className="lp-container">
          <p className="lp-statement-text">
            Não somos mais um app de agenda genérico. <em>Somos a infraestrutura operacional
            que faltava entre a primeira ligação e o pet sair impecável pela porta.</em>
          </p>
        </div>
      </div>

      {/* ── P/02 — DEMONSTRAÇÃO BENTO GRID ── */}
      <section id="plataforma" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index">P / 02</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary">Plataforma</span>
                <h2 className="lp-display lp-display--section">
                  Cada detalhe foi projetado para o seu dia a dia.
                </h2>
              </div>

              <div className="lp-bento">
                {/* Card 1 — Light, span 2 */}
                <div className="lp-bento-card lp-bento-card--span2">
                  <div>
                    <span className="lp-tag">Grade inteligente</span>
                    <h3>Motor Anti-Conflito de Banheiras &amp; Mesas</h3>
                    <p>
                      Visualize banheiras, mesas de tosa e sopradores em uma única timeline.
                      O sistema cruza porte do animal, especialidade do tosador e tempo estimado
                      para evitar gargalos automaticamente.
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <div style={{ background: 'var(--lp-canvas)', border: '1px solid var(--lp-hairline)', padding: '0.85rem', textAlign: 'center' }}>
                      <span className="lp-tag" style={{ fontSize: '0.6rem' }}>Mesa 01</span>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--lp-primary)', marginTop: '0.3rem' }}>Ocupada</div>
                    </div>
                    <div style={{ background: 'var(--lp-canvas)', border: '1px solid var(--lp-hairline)', padding: '0.85rem', textAlign: 'center' }}>
                      <span className="lp-tag" style={{ fontSize: '0.6rem' }}>Banheira 01</span>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#047857', marginTop: '0.3rem' }}>Disponível</div>
                    </div>
                    <div style={{ background: 'var(--lp-canvas)', border: '1px solid var(--lp-hairline)', padding: '0.85rem', textAlign: 'center' }}>
                      <span className="lp-tag" style={{ fontSize: '0.6rem' }}>Soprador</span>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--lp-text-main)', marginTop: '0.3rem' }}>Em uso</div>
                    </div>
                  </div>
                </div>

                {/* Card 2 — Dark */}
                <div className="lp-bento-card lp-bento-card--dark">
                  <div>
                    <span className="lp-tag">WhatsApp Cloud</span>
                    <h3>Confirmação Autônoma</h3>
                    <p>
                      Lembretes automáticos com botão de confirmação.
                      Cancelou? A vaga volta para lista de espera instantaneamente.
                    </p>
                  </div>
                  <div className="lp-bento-metric lp-bento-metric--dark">
                    −85%
                  </div>
                </div>

                {/* Card 3 — Light */}
                <div className="lp-bento-card">
                  <div>
                    <span className="lp-tag">Prontuário</span>
                    <h3>Ficha Clínica &amp; Fotos</h3>
                    <p>
                      Anotações sobre alergias, lesões de pele, fotos do corte anterior
                      e preferências específicas de cada tutor.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="lp-pill">Vacinas em dia ✓</span>
                    <span className="lp-pill">Pelo duplo</span>
                    <span className="lp-pill">Microchip</span>
                  </div>
                </div>

                {/* Card 4 — Dark */}
                <div className="lp-bento-card lp-bento-card--dark">
                  <div>
                    <span className="lp-tag">Financeiro</span>
                    <h3>Comissões em 1 Clique</h3>
                    <p>
                      Sem Excel. Regras flexíveis por serviço, bônus
                      e valor fixo com relatório auditável.
                    </p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '0.7rem', color: '#a5b4fc', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      Extrato mensal
                    </span>
                    <span className="lp-bento-metric lp-bento-metric--dark" style={{ fontSize: '1.8rem' }}>
                      R$ 1.840
                    </span>
                  </div>
                </div>

                {/* Card 5 — Light, span 2 */}
                <div className="lp-bento-card lp-bento-card--span2">
                  <div>
                    <span className="lp-tag">Portal do tutor</span>
                    <h3>Link Exclusivo para Bio do Instagram</h3>
                    <p>
                      O cliente entra, escolhe o pet, seleciona o pacote de serviços e marca
                      em menos de 30 segundos. Sem download, sem cadastro complicado.
                    </p>
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

      {/* ── HAIRLINE ── */}
      <hr className="lp-hairline" />

      {/* ── S/03 — COMO FUNCIONA ── */}
      <section id="processo" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index">S / 03</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary">Processo</span>
                <h2 className="lp-display lp-display--section">
                  Do cadastro ao primeiro agendamento em 4 minutos.
                </h2>
              </div>

              <div className="lp-steps">
                <div className="lp-step">
                  <span className="lp-step-num">01.</span>
                  <h4>Configure sua loja</h4>
                  <p>
                    Cadastre suas banheiras, mesas de tosa, sopradores
                    e cada colaborador com suas especialidades. O assistente
                    guiado configura tudo em poucos cliques.
                  </p>
                </div>

                <div className="lp-step">
                  <span className="lp-step-num">02.</span>
                  <h4>Compartilhe seu link</h4>
                  <p>
                    Cole o link personalizado na bio do Instagram, no
                    status do WhatsApp ou no Google Meu Negócio. Seus
                    clientes começam a agendar sozinhos.
                  </p>
                </div>

                <div className="lp-step">
                  <span className="lp-step-num">03.</span>
                  <h4>Opere com eficiência</h4>
                  <p>
                    Acompanhe agendamentos, confirmações automáticas,
                    prontuários e comissões em um único painel. O sistema
                    trabalha enquanto você cuida dos pets.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HAIRLINE ── */}
      <hr className="lp-hairline" />

      {/* ── T/04 — STACK TÉCNICO ── */}
      <section id="tecnologia" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-indexed">
            <div className="lp-section-index">
              <span className="lp-index">T / 04</span>
            </div>

            <div className="lp-section-body">
              <div className="lp-section-header">
                <span className="lp-tag lp-tag--primary">Tecnologia</span>
                <h2 className="lp-display lp-display--section">
                  Stack de engenharia moderna.
                </h2>
                <p className="lp-lead">
                  Construído com as <strong>mesmas ferramentas usadas por empresas como Vercel,
                  Supabase e Stripe</strong> para garantir velocidade, segurança e escalabilidade.
                </p>
              </div>

              <div className="lp-tech-grid">
                <div className="lp-tech-item">
                  <div className="lp-tech-icon">⚡</div>
                  <div>
                    <div className="lp-tech-name">Next.js 16</div>
                    <div className="lp-tech-role">Framework</div>
                  </div>
                </div>

                <div className="lp-tech-item">
                  <div className="lp-tech-icon">🔐</div>
                  <div>
                    <div className="lp-tech-name">Supabase</div>
                    <div className="lp-tech-role">Auth &amp; Database</div>
                  </div>
                </div>

                <div className="lp-tech-item">
                  <div className="lp-tech-icon">🐘</div>
                  <div>
                    <div className="lp-tech-name">PostgreSQL</div>
                    <div className="lp-tech-role">Data Layer</div>
                  </div>
                </div>

                <div className="lp-tech-item">
                  <div className="lp-tech-icon">▲</div>
                  <div>
                    <div className="lp-tech-name">Vercel</div>
                    <div className="lp-tech-role">Edge Deploy</div>
                  </div>
                </div>

                <div className="lp-tech-item">
                  <div className="lp-tech-icon">🔷</div>
                  <div>
                    <div className="lp-tech-name">TypeScript</div>
                    <div className="lp-tech-role">Type Safety</div>
                  </div>
                </div>

                <div className="lp-tech-item">
                  <div className="lp-tech-icon">💬</div>
                  <div>
                    <div className="lp-tech-name">WhatsApp API</div>
                    <div className="lp-tech-role">Messaging</div>
                  </div>
                </div>

                <div className="lp-tech-item">
                  <div className="lp-tech-icon">🔒</div>
                  <div>
                    <div className="lp-tech-name">RLS Policies</div>
                    <div className="lp-tech-role">Row-Level Security</div>
                  </div>
                </div>

                <div className="lp-tech-item">
                  <div className="lp-tech-icon">⚛️</div>
                  <div>
                    <div className="lp-tech-name">React 19</div>
                    <div className="lp-tech-role">UI Runtime</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="lp-cta-section">
        <div className="lp-container">
          <div className="lp-cta-inner">
            <span className="lp-tag" style={{ color: '#a5b4fc' }}>Pronto para começar?</span>
            <h2 className="lp-cta-title">
              Seu petshop merece operar com a precisão de um software de verdade.
            </h2>
            <p className="lp-cta-desc">
              Teste grátis por 14 dias. Sem cartão de crédito. Sem compromisso.
              Configure em 4 minutos e comece a receber agendamentos hoje.
            </p>
            <div className="lp-cta-actions">
              <Link
                href="/cadastro/lojista"
                className="lp-cta-btn"
                style={{ background: '#ffffff', color: 'var(--lp-primary)' }}
              >
                Iniciar teste grátis ↗
              </Link>
              <Link
                href="/login"
                className="lp-cta-btn"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff' }}
              >
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
            <div className="lp-footer-meta-item">
              <span className="lp-footer-meta-label">SLA</span>
              <span className="lp-footer-meta-value">99.9%</span>
            </div>
            <div className="lp-footer-meta-item">
              <span className="lp-footer-meta-label">Versão</span>
              <span className="lp-footer-meta-value">v3.1.0</span>
            </div>
            <div className="lp-footer-meta-item">
              <span className="lp-footer-meta-label">Latência</span>
              <span className="lp-footer-meta-value">&lt;120ms</span>
            </div>
            <div className="lp-footer-meta-item">
              <span className="lp-footer-meta-label">Deploy</span>
              <span className="lp-footer-meta-value">Edge (GRU)</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
