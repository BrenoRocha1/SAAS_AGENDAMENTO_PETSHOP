import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { diaSemanaBrasil, agoraBrasilHHMM } from '@/lib/agenda'
import {
  IconPaw,
  IconMapPin,
  IconPhone,
  IconClock,
  IconStar,
  IconScissors,
  IconCalendar,
  IconArrowRight,
  IconAlert,
} from '@/components/icons'

// Aceita slug personalizado (migration 024) ou UUID legado
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Rotas estáticas do app — não deve cair aqui
const STATIC_ROUTES = new Set([
  'login', 'cadastro', 'completar-cadastro', 'esqueci-senha',
  'redefinir-senha', 'cliente', 'lojista', 'admin', 'agendamento',
  'api', 'auth', 'funcionario', '_next', 'favicon.ico',
])

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (STATIC_ROUTES.has(slug)) return {}

  const supabase = await createClient()
  let id = slug
  if (!UUID_RE.test(slug)) {
    const { data } = await supabase.from('lojista').select('id_lojista').eq('slug', slug).maybeSingle()
    id = data?.id_lojista ?? ''
  }
  if (!id) return { title: 'Petshop não encontrado' }

  const { data: lj } = await supabase
    .from('lojista')
    .select('nome_loja, descricao, cidade, estado')
    .eq('id_lojista', id)
    .maybeSingle()

  if (!lj) return { title: 'Petshop não encontrado' }
  return {
    title: `${lj.nome_loja} — SAIP`,
    description: lj.descricao ?? `Agende serviços para seu pet em ${lj.nome_loja}${lj.cidade ? `, ${lj.cidade}` : ''}.`,
  }
}

function StarRating({ media, total }: { media: number | null; total: number }) {
  if (!media || total === 0) return null
  const full = Math.floor(media)
  const half = media - full >= 0.5
  return (
    <div className="vitrine-stars" aria-label={`${media.toFixed(1)} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <IconStar
          key={i}
          style={{
            width: 16, height: 16,
            color: i < full || (i === full && half) ? 'var(--accent-500)' : 'var(--gray-700)',
            fill: i < full || (i === full && half) ? 'currentColor' : 'none',
          }}
        />
      ))}
      <span className="vitrine-stars-label">{media.toFixed(1)} ({total} {total === 1 ? 'avaliação' : 'avaliações'})</span>
    </div>
  )
}

const CATEGORIA_LABELS: Record<string, string> = {
  banho_tosa:  'Banho & Tosa',
  estetica:    'Estética',
  veterinario: 'Veterinário',
  hotel:       'Hotel & Creche',
  outros:      'Outros',
}

const DIAS_LABEL: Record<string, string> = {
  Segunda: 'Seg', Terça: 'Ter', Quarta: 'Qua',
  Quinta: 'Qui', Sexta: 'Sex', Sábado: 'Sáb', Domingo: 'Dom',
}

export default async function VitrineLojaPage({ params }: Props) {
  const { slug } = await params

  // Guardrail: se for uma rota estática conhecida, 404 imediatamente
  if (STATIC_ROUTES.has(slug)) notFound()

  const supabase = await createClient()

  // Resolve slug → UUID (tolerante: se a coluna não existir, cai em notFound)
  let idLojista = slug
  if (!UUID_RE.test(slug)) {
    const { data: porSlug } = await supabase
      .from('lojista')
      .select('id_lojista')
      .eq('slug', slug)
      .maybeSingle()
    idLojista = porSlug?.id_lojista ?? ''
  }

  if (!idLojista) notFound()

  const { data: lj } = await supabase
    .from('lojista')
    .select('id_lojista, nome_loja, logo_url, descricao, endereco, cidade, estado, telefone, ativo, aceita_agendamento_online, slug')
    .eq('id_lojista', idLojista)
    .maybeSingle()

  if (!lj || !lj.ativo) notFound()

  // Busca paralela — serviços, horários, avaliações
  // Nota: `categoria` é adicionada pela migration 042 — pode não existir
  // no banco de produção ainda. Por isso tentamos buscar e ignoramos o erro.
  const [
    { data: servicosRaw },
    { data: horarios },
    { data: resumoRaw },
    { data: avaliacoesRaw },
  ] = await Promise.all([
    supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao, categoria')
      .eq('id_lojista', lj.id_lojista)
      .eq('status', 'Ativo')
      .order('nome')
      .then(r => {
        // Se categoria ainda não existe, recarrega sem ela
        if (r.error?.message?.includes('categoria')) {
          return supabase
            .from('servico')
            .select('id_servico, nome, descricao, preco, duracao')
            .eq('id_lojista', lj.id_lojista)
            .eq('status', 'Ativo')
            .order('nome')
        }
        return r
      }),
    supabase
      .from('horario')
      .select('dia_semana, hr_inicio, hr_fim, ativo')
      .eq('id_lojista', lj.id_lojista),
    supabase.rpc('fn_avaliacoes_resumo_publico', { p_id_lojista: lj.id_lojista }),
    supabase.rpc('fn_avaliacoes_publicas', { p_id_lojista: lj.id_lojista, p_limit: 6 }),
  ])

  const servicos = (servicosRaw ?? []) as {
    id_servico: string; nome: string; descricao: string | null
    preco: number; duracao: number; categoria: string | null
  }[]

  // Agrupa serviços por categoria
  const servicosPorCategoria = servicos.reduce<Record<string, typeof servicos>>((acc, s) => {
    const cat = s.categoria ?? 'outros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  const resumo = resumoRaw as { media: number | null; total: number } | null
  const media = resumo?.media != null ? Number(resumo.media) : null
  const totalAvaliacoes = Number(resumo?.total ?? 0)
  const avaliacoes = ((avaliacoesRaw ?? []) as Array<{
    nota: number; comentario: string; primeiro_nome: string; created_at: string
  }>)

  // Status hoje
  const diaSemana = diaSemanaBrasil()
  const agora = agoraBrasilHHMM()
  const horarioHoje = (horarios ?? []).find(h => h.dia_semana === diaSemana && h.ativo) ?? null
  let statusHoje = 'Fechado hoje'
  let statusClass = 'badge-danger'
  if (horarioHoje) {
    if (agora < horarioHoje.hr_inicio.slice(0, 5)) {
      statusHoje = `Abre às ${horarioHoje.hr_inicio.slice(0, 5)}`
      statusClass = 'badge-warning'
    } else if (agora < horarioHoje.hr_fim.slice(0, 5)) {
      statusHoje = `Aberto até ${horarioHoje.hr_fim.slice(0, 5)}`
      statusClass = 'badge-success'
    }
  }

  const linkAgendar = `/agendamento/${lj.slug ?? lj.id_lojista}`
  const enderecoCompleto = [lj.endereco, lj.cidade, lj.estado].filter(Boolean).join(', ')

  return (
    <div className="vitrine-shell">
      {/* ── HEADER / HERO ───────────────────────────────────────────── */}
      <header className="vitrine-hero">
        <div className="vitrine-hero-bg" aria-hidden />
        <div className="vitrine-hero-content">
          {/* Logo */}
          <div className="vitrine-logo-wrap">
            {lj.logo_url ? (
              <img src={lj.logo_url} alt={lj.nome_loja} className="vitrine-logo-img" />
            ) : (
              <div className="vitrine-logo-placeholder">
                <IconPaw style={{ width: 36, height: 36, color: 'var(--primary-400)' }} />
              </div>
            )}
          </div>

          <div className="vitrine-hero-info">
            <h1 className="vitrine-nome">{lj.nome_loja}</h1>

            <div className="vitrine-meta">
              <span className={`badge ${statusClass}`}>{statusHoje}</span>
              {media !== null && <StarRating media={media} total={totalAvaliacoes} />}
            </div>

            {lj.descricao && (
              <p className="vitrine-descricao">{lj.descricao}</p>
            )}

            <div className="vitrine-contatos">
              {enderecoCompleto && (
                <span className="vitrine-contato-item">
                  <IconMapPin style={{ width: 14, height: 14 }} />
                  {enderecoCompleto}
                </span>
              )}
              {lj.telefone && (
                <a
                  href={`tel:${lj.telefone}`}
                  className="vitrine-contato-item vitrine-contato-link"
                >
                  <IconPhone style={{ width: 14, height: 14 }} />
                  {lj.telefone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')}
                </a>
              )}
            </div>
          </div>

          {lj.aceita_agendamento_online && (
            <Link href={linkAgendar} className="btn btn-primary vitrine-cta">
              <IconCalendar style={{ width: 18, height: 18 }} />
              Agendar agora
              <IconArrowRight style={{ width: 16, height: 16 }} />
            </Link>
          )}
        </div>
      </header>

      <main className="vitrine-main">
        {/* ── SERVIÇOS ─────────────────────────────────────────────── */}
        {servicos.length > 0 && (
          <section className="vitrine-section" aria-labelledby="servicos-heading">
            <h2 id="servicos-heading" className="vitrine-section-title">
              <IconScissors style={{ width: 22, height: 22, color: 'var(--primary-400)' }} />
              Serviços
            </h2>

            {Object.entries(servicosPorCategoria).map(([cat, lista]) => (
              <div key={cat} className="vitrine-categoria">
                <h3 className="vitrine-categoria-label">
                  {CATEGORIA_LABELS[cat] ?? cat}
                </h3>
                <div className="vitrine-servicos-grid">
                  {lista.map(s => (
                    <div key={s.id_servico} className="vitrine-servico-card">
                      <div className="vitrine-servico-header">
                        <span className="vitrine-servico-nome">{s.nome}</span>
                        <span className="vitrine-servico-preco">
                          {Number(s.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      {s.descricao && (
                        <p className="vitrine-servico-desc">{s.descricao}</p>
                      )}
                      <div className="vitrine-servico-duracao">
                        <IconClock style={{ width: 12, height: 12 }} />
                        {s.duracao >= 60
                          ? `${Math.floor(s.duracao / 60)}h${s.duracao % 60 > 0 ? ` ${s.duracao % 60}min` : ''}`
                          : `${s.duracao} min`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── HORÁRIOS ─────────────────────────────────────────────── */}
        {(horarios ?? []).some(h => h.ativo) && (
          <section className="vitrine-section" aria-labelledby="horarios-heading">
            <h2 id="horarios-heading" className="vitrine-section-title">
              <IconClock style={{ width: 22, height: 22, color: 'var(--primary-400)' }} />
              Horários de funcionamento
            </h2>
            <div className="vitrine-horarios-grid">
              {(horarios ?? []).filter(h => h.ativo).map(h => (
                <div
                  key={h.dia_semana}
                  className={`vitrine-horario-row${h.dia_semana === diaSemana ? ' vitrine-horario-hoje' : ''}`}
                >
                  <span className="vitrine-horario-dia">
                    {DIAS_LABEL[h.dia_semana] ?? h.dia_semana}
                    {h.dia_semana === diaSemana && <span className="vitrine-hoje-badge">hoje</span>}
                  </span>
                  <span className="vitrine-horario-horas">
                    {h.hr_inicio.slice(0, 5)} – {h.hr_fim.slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── AVALIAÇÕES ───────────────────────────────────────────── */}
        {avaliacoes.length > 0 && (
          <section className="vitrine-section" aria-labelledby="avaliacoes-heading">
            <h2 id="avaliacoes-heading" className="vitrine-section-title">
              <IconStar style={{ width: 22, height: 22, color: 'var(--accent-500)', fill: 'currentColor' }} />
              Avaliações dos clientes
              {media !== null && (
                <span className="vitrine-media-badge">
                  {media.toFixed(1)} · {totalAvaliacoes} {totalAvaliacoes === 1 ? 'avaliação' : 'avaliações'}
                </span>
              )}
            </h2>
            <div className="vitrine-avaliacoes-grid">
              {avaliacoes.map((av, i) => (
                <div key={i} className="vitrine-avaliacao-card">
                  <div className="vitrine-avaliacao-header">
                    <div className="vitrine-avaliacao-avatar">
                      {av.primeiro_nome[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="vitrine-avaliacao-nome">{av.primeiro_nome}</div>
                      <div className="vitrine-avaliacao-data">
                        {new Date(av.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className="vitrine-avaliacao-stars">
                      {Array.from({ length: 5 }, (_, j) => (
                        <IconStar
                          key={j}
                          style={{
                            width: 13, height: 13,
                            color: j < av.nota ? 'var(--accent-500)' : 'var(--gray-700)',
                            fill: j < av.nota ? 'currentColor' : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  {av.comentario && (
                    <p className="vitrine-avaliacao-texto">{av.comentario}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA FINAL ────────────────────────────────────────────── */}
        {lj.aceita_agendamento_online && (
          <div className="vitrine-cta-bottom">
            <div className="vitrine-cta-card">
              <IconPaw style={{ width: 28, height: 28, color: 'var(--primary-400)' }} />
              <div>
                <div className="vitrine-cta-title">Pronto para agendar?</div>
                <div className="vitrine-cta-sub">Escolha o serviço e horário ideal para o seu pet</div>
              </div>
              <Link href={linkAgendar} className="btn btn-primary">
                <IconCalendar style={{ width: 17, height: 17 }} />
                Agendar agora
              </Link>
            </div>
          </div>
        )}

        {!lj.aceita_agendamento_online && (
          <div className="vitrine-cta-bottom">
            <div className="vitrine-cta-card vitrine-cta-card-offline">
              <IconAlert style={{ width: 24, height: 24, color: 'var(--warning-400)' }} />
              <div>
                <div className="vitrine-cta-title">Agendamento online indisponível</div>
                <div className="vitrine-cta-sub">Entre em contato diretamente com a loja para agendar.</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="vitrine-footer">
        <IconPaw style={{ width: 16, height: 16, opacity: 0.5 }} />
        <span>Agendamento pelo SAIP</span>
      </footer>
    </div>
  )
}
