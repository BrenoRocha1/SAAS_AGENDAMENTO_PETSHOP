import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PetShop Agenda — Plataforma de Agendamento para Pet Shops',
  description:
    'Gerencie agendamentos de banho e tosa com facilidade. Plataforma completa para pet shops e clientes.',
}

const features = [
  {
    icon: '📅',
    title: 'Agendamento Online',
    desc: 'Clientes agendam serviços 24h por dia, escolhendo pet, serviço e horário disponível.',
  },
  {
    icon: '🔒',
    title: 'Segurança Máxima',
    desc: 'Dados protegidos com criptografia e controle de acesso por nível (cliente/lojista).',
  },
  {
    icon: '🐕',
    title: 'Gestão de Pets',
    desc: 'Cadastre múltiplos pets com raça, peso, histórico e observações importantes.',
  },
  {
    icon: '📊',
    title: 'Dashboard do Lojista',
    desc: 'Acompanhe agendamentos, receita e clientes em tempo real com métricas detalhadas.',
  },
  {
    icon: '⏰',
    title: 'Controle de Horários',
    desc: 'Configure dias e horários de funcionamento. O sistema bloqueia slots automaticamente.',
  },
  {
    icon: '📱',
    title: 'Multi-lojista',
    desc: 'Plataforma para múltiplos petshops. Clientes escolhem o estabelecimento de preferência.',
  },
]

export default function LandingPage() {
  return (
    <>
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="flex items-center gap-3">
          <div className="sidebar-logo-icon" style={{ width: 32, height: 32, fontSize: '1rem' }}>
            🐾
          </div>
          <span className="sidebar-logo-text">
            Pet<span>Agenda</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost btn-sm">
            Entrar
          </Link>
          <Link href="/cadastro" className="btn btn-primary btn-sm">
            Criar Conta
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero" style={{ paddingTop: '80px' }}>
        <div className="hero-bg" />
        <div className="hero-content" style={{ width: '100%' }}>
          <div className="hero-badge">
            <span>✨</span>
            <span>Plataforma SaaS para Pet Shops</span>
          </div>

          <h1 className="hero-title">
            Agendamentos para<br />
            <span className="gradient-text">Pet Shops modernos</span>
          </h1>

          <p className="hero-desc">
            Gerencie banho e tosa de forma profissional. Controle de horários,
            gestão de pets, histórico completo e painel administrativo robusto.
            Tudo em um só lugar.
          </p>

          <div className="hero-actions">
            <Link href="/cadastro/lojista" className="btn btn-primary btn-xl">
              🏪 Cadastrar meu Petshop
            </Link>
            <Link href="/cadastro" className="btn btn-secondary btn-xl">
              🐕 Sou Cliente
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section
        style={{
          background: 'var(--gray-950)',
          padding: 'var(--space-20) var(--space-6)',
          borderTop: '1px solid var(--gray-800)',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-12)' }}>
            <h2>Tudo que seu petshop precisa</h2>
            <p
              style={{
                color: 'var(--gray-500)',
                fontSize: '1.125rem',
                marginTop: 'var(--space-3)',
              }}
            >
              Sistema completo desenvolvido especialmente para petshops
            </p>
          </div>

          <div className="features-grid">
            {features.map((f, i) => (
              <div key={i} className="feature-card animate-slide-up">
                <div className="feature-icon">{f.icon}</div>
                <h4 style={{ marginBottom: 'var(--space-2)' }}>{f.title}</h4>
                <p style={{ fontSize: '0.9375rem', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section
        style={{
          background: 'var(--gray-900)',
          padding: 'var(--space-20) var(--space-6)',
          textAlign: 'center',
          borderTop: '1px solid var(--gray-800)',
        }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ marginBottom: 'var(--space-4)' }}>
            Pronto para começar?
          </h2>
          <p
            style={{
              color: 'var(--gray-500)',
              fontSize: '1.0625rem',
              marginBottom: 'var(--space-8)',
            }}
          >
            Cadastre seu petshop agora e comece a receber agendamentos online
            em minutos.
          </p>
          <Link href="/cadastro/lojista" className="btn btn-primary btn-xl">
            Começar gratuitamente →
          </Link>
        </div>
      </section>
    </>
  )
}
