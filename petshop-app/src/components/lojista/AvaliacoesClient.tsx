'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PRESETS, type PeriodoPreset, type Periodo } from '@/lib/relatorios'
import { IconChevronLeft, IconChevronRight, IconInbox, IconStar } from '@/components/icons'
import { Estrelas, formatarMedia } from '@/components/cliente/Estrelas'

// Espelha o retorno de fn_avaliacoes_lojista (migration 034).
export interface LinhaAvaliacao {
  id_avaliacao: string
  nota: number
  comentario: string | null
  created_at: string
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  nome_cliente: string
  id_cliente: string
  nome_pet: string
  nome_servico: string
  nome_funcionario: string | null
}

// "geral" nunca leva filtro; "periodo" leva todos os filtros da tela.
// Ficam separados de propósito pra não misturar as duas médias.
export interface ResumoAvaliacoes {
  geral: { media: number | null; total: number }
  periodo: { media: number | null; total: number; porNota: Record<1 | 2 | 3 | 4 | 5, number> }
}

interface Props {
  resumo: ResumoAvaliacoes
  avaliacoes: LinhaAvaliacao[]
  totalLista: number
  pagina: number
  pageSize: number
  preset: PeriodoPreset | null
  periodo: Periodo | null
  filtroNota: number | null
  filtroServico: string
  filtroFuncionario: string
  servicos: { id_servico: string; nome: string }[]
  funcionarios: { id_funcionario: string; nome: string }[]
}

const NOTAS = [5, 4, 3, 2, 1] as const

export default function AvaliacoesClient({
  resumo, avaliacoes, totalLista, pagina, pageSize, preset, periodo,
  filtroNota, filtroServico, filtroFuncionario, servicos, funcionarios,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [customIni, setCustomIni] = useState(periodo?.ini ?? '')
  const [customFim, setCustomFim] = useState(periodo?.fim ?? '')

  // Filtros moram na URL (mesmo padrão dos Relatórios de Vendas): o
  // servidor faz a agregação e a paginação, o navegador só re-renderiza.
  function navegar(overrides: Record<string, string | undefined>) {
    const atual: Record<string, string | undefined> = {
      periodo: preset ?? undefined,
      ini: preset === 'personalizado' ? periodo?.ini : undefined,
      fim: preset === 'personalizado' ? periodo?.fim : undefined,
      nota: filtroNota ? String(filtroNota) : undefined,
      servico: filtroServico || undefined,
      funcionario: filtroFuncionario || undefined,
      pagina: pagina !== 1 ? String(pagina) : undefined,
      ...overrides,
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(atual)) if (v) qs.set(k, v)
    const query = qs.toString()
    startTransition(() => router.push(`/lojista/configuracoes/avaliacoes${query ? `?${query}` : ''}`))
  }

  function mudarPreset(novo: PeriodoPreset | null) {
    navegar({ periodo: novo ?? undefined, ini: undefined, fim: undefined, pagina: undefined })
  }

  const totalPaginas = Math.max(1, Math.ceil(totalLista / pageSize))
  const temFiltro = !!(preset || filtroNota || filtroServico || filtroFuncionario)
  const maiorContagem = Math.max(1, ...NOTAS.map(n => resumo.periodo.porNota[n]))

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms', pointerEvents: isPending ? 'none' : 'auto' }}>
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">Avaliações</h1>
        <p className="page-subtitle">
          Avaliações dos clientes da sua loja.
          {isPending && ' · Atualizando...'}
        </p>
      </div>

      {resumo.geral.total === 0 ? (
        <div className="empty-state card">
          <IconStar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Ainda não há avaliações para esta loja.</div>
          <p>Assim que um cliente avaliar um atendimento finalizado, ela aparece aqui.</p>
        </div>
      ) : (
        <>
          {/* ── Visão geral da loja (sem filtro nenhum) ── */}
          <div className="grid-2" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="stat-card">
              <div className="stat-card-label" style={{ marginBottom: 'var(--space-3)' }}>Média geral da loja</div>
              <div className="avaliacao-media">
                <span className="avaliacao-media-valor" style={{ fontSize: '2rem' }}>{formatarMedia(resumo.geral.media ?? 0)}</span>
                <Estrelas nota={resumo.geral.media ?? 0} tamanho={20} />
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Considera todas as avaliações, sem filtro</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label" style={{ marginBottom: 'var(--space-3)' }}>Total de avaliações</div>
              <div className="stat-card-value">{resumo.geral.total}</div>
              <div className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Desde a primeira avaliação recebida</div>
            </div>
          </div>

          {/* ── Filtros ── */}
          <div className="relatorio-filtros card">
            <div className="relatorio-presets">
              <button
                type="button"
                className={`btn btn-sm ${preset === null ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => mudarPreset(null)}
              >
                Todo o período
              </button>
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  className={`btn btn-sm ${preset === p.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => mudarPreset(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {preset === 'personalizado' && (() => {
              // O estado local só existe depois que a pessoa mexe no campo;
              // até lá mostra o intervalo que o servidor já aplicou (ao
              // entrar em "Personalizado" sem datas, ele usa os últimos 30 dias).
              const ini = customIni || periodo?.ini || ''
              const fim = customFim || periodo?.fim || ''
              return (
                <div className="relatorio-personalizado">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">De</label>
                    <input type="date" className="form-input" value={ini} max={fim || undefined} onChange={e => setCustomIni(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Até</label>
                    <input type="date" className="form-input" value={fim} min={ini || undefined} onChange={e => setCustomFim(e.target.value)} />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navegar({ periodo: 'personalizado', ini, fim, pagina: undefined })}
                  >
                    Aplicar
                  </button>
                </div>
              )
            })()}

            <div className="relatorio-tabela-filtros" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
              <select className="form-select" value={filtroNota ?? ''} onChange={e => navegar({ nota: e.target.value || undefined, pagina: undefined })}>
                <option value="">Todas as notas</option>
                {NOTAS.map(n => <option key={n} value={n}>{n} {n === 1 ? 'estrela' : 'estrelas'}</option>)}
              </select>
              <select className="form-select" value={filtroServico} onChange={e => navegar({ servico: e.target.value || undefined, pagina: undefined })}>
                <option value="">Todos os serviços</option>
                {servicos.map(s => <option key={s.id_servico} value={s.id_servico}>{s.nome}</option>)}
              </select>
              {funcionarios.length > 0 && (
                <select className="form-select" value={filtroFuncionario} onChange={e => navegar({ funcionario: e.target.value || undefined, pagina: undefined })}>
                  <option value="">Todos os profissionais</option>
                  {funcionarios.map(f => <option key={f.id_funcionario} value={f.id_funcionario}>{f.nome}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* ── Recorte filtrado: média e distribuição ── */}
          <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
            <div className="card">
              <h3 className="relatorio-secao-titulo">
                {temFiltro ? 'Média no período / filtro selecionado' : 'Média de todas as avaliações'}
              </h3>
              {resumo.periodo.total === 0 || resumo.periodo.media == null ? (
                <p className="text-sm text-muted">Nenhuma avaliação com esses filtros.</p>
              ) : (
                <>
                  <div className="avaliacao-media">
                    <span className="avaliacao-media-valor" style={{ fontSize: '2rem' }}>{formatarMedia(resumo.periodo.media)}</span>
                    <Estrelas nota={resumo.periodo.media} tamanho={20} />
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: 'var(--space-2)' }}>
                    {resumo.periodo.total} {resumo.periodo.total === 1 ? 'avaliação' : 'avaliações'}
                    {periodo && ` entre ${format(parseISO(periodo.ini), 'dd/MM/yyyy')} e ${format(parseISO(periodo.fim), 'dd/MM/yyyy')}`}
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <h3 className="relatorio-secao-titulo">Distribuição das notas</h3>
              <div className="avaliacao-dist">
                {NOTAS.map(n => {
                  const qtd = resumo.periodo.porNota[n]
                  return (
                    <div key={n} className="avaliacao-dist-linha">
                      <span>{n} {n === 1 ? 'estrela' : 'estrelas'}</span>
                      <span className="avaliacao-dist-barra"><span style={{ width: `${(qtd / maiorContagem) * 100}%` }} /></span>
                      <span className="avaliacao-dist-num">{qtd}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Lista ── */}
          <div className="card">
            <h3 className="relatorio-secao-titulo">Avaliações recebidas</h3>
            {avaliacoes.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
                <IconInbox style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-3)' }} />
                <p className="text-sm text-muted">Nenhuma avaliação com esses filtros.</p>
              </div>
            ) : (
              <>
                {avaliacoes.map(a => (
                  <div key={a.id_avaliacao} className="avaliacao-item">
                    <div className="avaliacao-item-topo">
                      <Estrelas nota={a.nota} />
                      <span className="text-xs text-muted">{format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                    <p className={`avaliacao-item-comentario ${a.comentario ? '' : 'is-vazio'}`}>
                      {a.comentario ? <>&ldquo;{a.comentario}&rdquo;</> : 'Sem comentário'}
                    </p>
                    <div className="avaliacao-item-meta">
                      <span>Cliente: <Link href={`/lojista/clientes/${a.id_cliente}`}><strong>{a.nome_cliente}</strong></Link></span>
                      <span>Pet: <strong>{a.nome_pet}</strong></span>
                      <span>Serviço: <strong>{a.nome_servico}</strong></span>
                      {a.nome_funcionario && <span>Profissional: <strong>{a.nome_funcionario}</strong></span>}
                      <span>Atendimento: <strong>{format(parseISO(a.dt_agendamento), 'dd/MM/yyyy')}</strong></span>
                    </div>
                  </div>
                ))}

                <div className="relatorio-paginacao">
                  <span className="text-sm text-muted">
                    {totalLista} avaliaç{totalLista !== 1 ? 'ões' : 'ão'} · página {pagina} de {totalPaginas}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => navegar({ pagina: String(pagina - 1) })} disabled={pagina <= 1}>
                      <IconChevronLeft style={{ width: 14, height: 14 }} /> Anterior
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => navegar({ pagina: String(pagina + 1) })} disabled={pagina >= totalPaginas}>
                      Próxima <IconChevronRight style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
