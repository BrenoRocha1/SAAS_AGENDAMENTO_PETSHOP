import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Metadata } from 'next'
import { diaSemanaBrasil, agoraBrasilHHMM } from '@/lib/agenda'
import {
  IconStore,
  IconSearch,
  IconMapPin,
  IconStar,
  IconPaw,
  IconCalendar,
  IconArrowRight,
  IconScissors,
} from '@/components/icons'

export const metadata: Metadata = { title: 'Petshops — SAIP' }

interface Lojista {
  id_lojista: string
  nome_loja: string
  logo_url: string | null
  descricao: string | null
  cidade: string | null
  estado: string | null
  slug: string | null
  aceita_agendamento_online: boolean
  telefone: string
}

interface HorarioPorLoja {
  id_lojista: string
  dia_semana: string
  hr_inicio: string
  hr_fim: string
  ativo: boolean
}

// Calcula status aberto/fechado a partir do horário de hoje
function calcStatusHoje(horarios: HorarioPorLoja[], idLojista: string) {
  const diaSemana = diaSemanaBrasil()
  const agora = agoraBrasilHHMM()
  const h = horarios.find(
    x => x.id_lojista === idLojista && x.dia_semana === diaSemana && x.ativo
  )
  if (!h) return { label: 'Fechado hoje', cls: 'badge-danger' }
  if (agora < h.hr_inicio.slice(0, 5)) return { label: `Abre às ${h.hr_inicio.slice(0, 5)}`, cls: 'badge-warning' }
  if (agora < h.hr_fim.slice(0, 5))   return { label: `Aberto`, cls: 'badge-success' }
  return { label: 'Fechado', cls: 'badge-danger' }
}

export default async function MarketplacePage() {
  const supabase = await createClient()

  // Busca todos os petshops ativos com agendamento online habilitado
  // A policy "lojista: clientes podem ver lojas ativas" (migration 002) cobre usuários autenticados
  const [
    { data: lojistasRaw },
    { data: horariosRaw },
  ] = await Promise.all([
    supabase
      .from('lojista')
      .select('id_lojista, nome_loja, logo_url, descricao, cidade, estado, slug, aceita_agendamento_online, telefone')
      .eq('ativo', true)
      .eq('aceita_agendamento_online', true)
      .order('nome_loja'),
    supabase
      .from('horario')
      .select('id_lojista, dia_semana, hr_inicio, hr_fim, ativo'),
  ])

  const lojistas = (lojistasRaw ?? []) as Lojista[]
  const horarios = (horariosRaw ?? []) as HorarioPorLoja[]

  // Monta os dados dos cards
  const cards = lojistas.map(lj => {
    const status = calcStatusHoje(horarios, lj.id_lojista)
    const linkVitrine = `/${lj.slug ?? lj.id_lojista}`
    const linkAgendar = `/agendamento/${lj.slug ?? lj.id_lojista}`
    return { lj, status, linkVitrine, linkAgendar }
  })

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="stat-card-icon tone-primary" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)' }}>
            <IconStore style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 0 }}>Petshops</h1>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>
              Encontre o petshop ideal para o seu pet
            </p>
          </div>
        </div>
        <div className="page-header-actions">
          <span className="badge badge-info">
            {cards.length} {cards.length === 1 ? 'petshop' : 'petshops'} disponíveis
          </span>
        </div>
      </div>

      {/* Barra de busca e filtros — client-side via formulário nativo */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
        <form
          id="form-busca-petshops"
          method="GET"
          className="flex gap-3"
          style={{ flexWrap: 'wrap' }}
        >
          <div className="input-group" style={{ flex: 1, minWidth: 220 }}>
            <span className="input-icon">
              <IconSearch style={{ width: 16, height: 16 }} />
            </span>
            <input
              id="busca-petshop-nome"
              type="search"
              name="q"
              placeholder="Buscar por nome ou cidade…"
              className="input input-with-icon"
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Buscar
          </button>
        </form>
      </div>

      {/* Grid de cards */}
      {cards.length === 0 ? (
        <div className="empty-state">
          <IconStore style={{ width: 36, height: 36, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum petshop disponível</div>
          <p>Em breve novos petshops estarão disponíveis na plataforma.</p>
        </div>
      ) : (
        <div className="marketplace-grid">
          {cards.map(({ lj, status, linkVitrine, linkAgendar }) => (
            <article key={lj.id_lojista} className="marketplace-card animate-slide-up">
              {/* Cabeçalho do card */}
              <Link href={linkVitrine} className="marketplace-card-header" tabIndex={-1}>
                <div className="marketplace-logo-wrap">
                  {lj.logo_url ? (
                    <img
                      src={lj.logo_url}
                      alt={lj.nome_loja}
                      className="marketplace-logo-img"
                    />
                  ) : (
                    <div className="marketplace-logo-placeholder">
                      <IconPaw style={{ width: 28, height: 28, color: 'var(--primary-400)' }} />
                    </div>
                  )}
                </div>
                <div className="marketplace-card-overlay" />
              </Link>

              {/* Corpo */}
              <div className="marketplace-card-body">
                <div className="flex items-start justify-between gap-2" style={{ marginBottom: 'var(--space-2)' }}>
                  <Link href={linkVitrine} className="marketplace-nome">
                    {lj.nome_loja}
                  </Link>
                  <span className={`badge ${status.cls}`} style={{ flexShrink: 0, fontSize: '0.7rem' }}>
                    {status.label}
                  </span>
                </div>

                {(lj.cidade || lj.estado) && (
                  <div className="marketplace-meta">
                    <IconMapPin style={{ width: 13, height: 13 }} />
                    <span>{[lj.cidade, lj.estado].filter(Boolean).join(', ')}</span>
                  </div>
                )}

                {lj.descricao && (
                  <p className="marketplace-descricao">{lj.descricao}</p>
                )}
              </div>

              {/* Ações */}
              <div className="marketplace-card-footer">
                <Link
                  href={linkVitrine}
                  id={`btn-ver-loja-${lj.id_lojista}`}
                  className="btn btn-ghost btn-sm"
                >
                  Ver loja
                  <IconArrowRight style={{ width: 14, height: 14 }} />
                </Link>
                <Link
                  href={linkAgendar}
                  id={`btn-agendar-${lj.id_lojista}`}
                  className="btn btn-primary btn-sm"
                >
                  <IconCalendar style={{ width: 14, height: 14 }} />
                  Agendar
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Dica — quando não tem petshop, sugere link direto */}
      <div className="card" style={{ marginTop: 'var(--space-6)', background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)', textAlign: 'center', padding: 'var(--space-6)' }}>
        <IconScissors style={{ width: 24, height: 24, color: 'var(--primary-400)', margin: '0 auto var(--space-3)' }} />
        <div className="font-semibold" style={{ marginBottom: 'var(--space-1)', color: 'var(--gray-100)' }}>
          Tem o link de um petshop?
        </div>
        <p className="text-sm text-muted">
          Se o seu petshop te enviou um link direto (ex: <code>saip.com/petshop-do-pedro</code>), acesse diretamente pelo link para agendar.
        </p>
      </div>
    </>
  )
}
