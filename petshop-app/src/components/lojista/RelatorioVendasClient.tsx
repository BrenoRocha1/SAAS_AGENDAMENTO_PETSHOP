'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { exportarRelatorioVendasCsvAction } from '@/lib/actions'
import { PRESETS, variacaoPercentual, type PeriodoPreset, type Periodo } from '@/lib/relatorios'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import { CLASSE_STATUS_PAGAMENTO, ROTULO_STATUS_PAGAMENTO, ehStatusPagamento, rotuloForma } from '@/lib/pagamento'
import type { RelatorioPlanos } from '@/lib/planos'
import {
  IconAlert,
  IconCalendar,
  IconChartBar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconInbox,
  IconMoney,
  IconScissors,
  IconTrendDown,
  IconTrendUp,
  IconUserBadge,
  IconUsers,
  IconRepeat,
} from '@/components/icons'

// ============================================================
// Tipos — espelham exatamente o retorno das RPCs da migration 016
// ============================================================
export interface ResumoPeriodo {
  faturamento: number
  vendas: number
  pendente: number
  atendimentos_total: number
  valor_atendimentos_total: number
  cancelados: number
}

export interface VendaPorDia { dia: string; vendas: number; faturamento: number }
export interface VendaPorServico { id_servico: string; nome_servico: string; qtd_vendas: number; faturamento: number }
export interface VendaPorProfissional {
  id_funcionario: string | null
  nome_funcionario: string
  qtd_atendimentos: number
  faturamento: number
  ticket_medio: number
}
export interface VendaPorCliente { id_cliente: string; nome_cliente: string; qtd_atendimentos: number; valor_total: number }
export interface ClientesResumo { clientes_atendidos: number; clientes_novos: number; clientes_recorrentes: number }

export interface LinhaDetalhamento {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  valor: number
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  nome_pet: string
  nome_servico: string
  nome_cliente: string
  nome_funcionario: string | null
  // Migration 057 — null em agendamento antigo (ou sem a migration).
  forma_pagamento: string | null
  status_pagamento: string | null
}

// fn_relatorio_vendas_por_pagamento (migration 057): pedidos do período
// (sem cancelados) por forma — registrado, recebido (pago) e a receber.
export interface VendaPorPagamento { forma: string; pedidos: number; total: number; recebido: number; pendente: number }

interface Props {
  preset: PeriodoPreset
  periodo: Periodo
  resumo: ResumoPeriodo
  resumoAnterior: ResumoPeriodo | null
  porDia: VendaPorDia[]
  porServico: VendaPorServico[]
  porProfissional: VendaPorProfissional[]
  porCliente: VendaPorCliente[]
  clientesResumo: ClientesResumo | null
  // null = a migration 057 ainda não rodou.
  porPagamento: VendaPorPagamento[] | null
  // Planos recorrentes (migration 060) — null sem ela.
  relatorioPlanos: RelatorioPlanos | null
  funcionarios: { id_funcionario: string; nome: string }[]
  servicos: { id_servico: string; nome: string }[]
  filtroFuncionario: string
  filtroServico: string
  filtroStatus: string
  ordenar: string
  pagina: number
  pageSize: number
  totalDetalhamento: number
  detalhamento: LinhaDetalhamento[]
}

const STATUS_OPCOES = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado'] as const

function moeda(v: number) {
  return `R$ ${v.toFixed(2)}`
}

export default function RelatorioVendasClient({
  preset,
  periodo,
  resumo,
  resumoAnterior,
  porDia,
  porServico,
  porProfissional,
  porCliente,
  clientesResumo,
  porPagamento,
  relatorioPlanos,
  funcionarios,
  servicos,
  filtroFuncionario,
  filtroServico,
  filtroStatus,
  ordenar,
  pagina,
  pageSize,
  totalDetalhamento,
  detalhamento,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()
  const [exportErro, setExportErro] = useState<string | null>(null)

  const [customIni, setCustomIni] = useState(periodo.ini)
  const [customFim, setCustomFim] = useState(periodo.fim)
  // Ao trocar de período (outro preset ou "Aplicar"), os campos De/Até
  // passam a mostrar o período que está valendo.
  const chavePeriodo = `${periodo.ini}|${periodo.fim}`
  const [chavePeriodoAnterior, setChavePeriodoAnterior] = useState(chavePeriodo)
  if (chavePeriodoAnterior !== chavePeriodo) {
    setChavePeriodoAnterior(chavePeriodo)
    setCustomIni(periodo.ini)
    setCustomFim(periodo.fim)
  }

  function navegar(overrides: Record<string, string | undefined>) {
    const params: Record<string, string | undefined> = {
      periodo: preset,
      ini: preset === 'personalizado' ? periodo.ini : undefined,
      fim: preset === 'personalizado' ? periodo.fim : undefined,
      funcionario: filtroFuncionario || undefined,
      servico: filtroServico || undefined,
      status: filtroStatus || undefined,
      ordenar: ordenar !== 'data_desc' ? ordenar : undefined,
      pagina: pagina !== 1 ? String(pagina) : undefined,
      ...overrides,
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v)
    }
    const query = qs.toString()
    startTransition(() => router.push(`/lojista/relatorios${query ? `?${query}` : ''}`))
  }

  function mudarPreset(novoPreset: PeriodoPreset) {
    navegar({ periodo: novoPreset, ini: undefined, fim: undefined, pagina: undefined })
  }

  function aplicarPersonalizado() {
    navegar({ periodo: 'personalizado', ini: customIni, fim: customFim, pagina: undefined })
  }

  function mudarFiltro(campo: 'funcionario' | 'servico' | 'status', valor: string) {
    navegar({ [campo]: valor || undefined, pagina: undefined })
  }

  function mudarOrdenacao(valor: string) {
    navegar({ ordenar: valor, pagina: undefined })
  }

  function irParaPagina(novaPagina: number) {
    navegar({ pagina: novaPagina !== 1 ? String(novaPagina) : undefined })
  }

  function handleExportar() {
    setExportErro(null)
    startExportTransition(async () => {
      const result = await exportarRelatorioVendasCsvAction({
        dataIni: periodo.ini,
        dataFim: periodo.fim,
        idFuncionario: filtroFuncionario || undefined,
        idServico: filtroServico || undefined,
        status: filtroStatus || undefined,
      })
      if ('error' in result) {
        setExportErro(result.error)
        return
      }
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vendas_${periodo.ini}_a_${periodo.fim}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    })
  }

  const semDadosNoPeriodo = resumo.atendimentos_total === 0
  const totalPaginas = Math.max(1, Math.ceil(totalDetalhamento / pageSize))

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms', pointerEvents: isPending ? 'none' : 'auto' }}>
      <div className="page-header">
        <h1 className="page-title">Relatórios de Vendas</h1>
        <p className="page-subtitle">
          Desempenho comercial de {format(parseISO(periodo.ini), "dd 'de' MMM", { locale: ptBR })} a{' '}
          {format(parseISO(periodo.fim), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
          {isPending && ' · Atualizando...'}
        </p>
      </div>

      {/* Filtro de período */}
      <div className="relatorio-filtros card">
        <div className="relatorio-presets">
          {PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              className={`btn btn-sm ${preset === p.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => mudarPreset(p.value)}
              disabled={isPending}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'personalizado' && (
          <div className="relatorio-personalizado">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">De</label>
              <input
                type="date"
                className="form-input"
                value={customIni}
                max={customFim}
                onChange={e => setCustomIni(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Até</label>
              <input
                type="date"
                className="form-input"
                value={customFim}
                min={customIni}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={e => setCustomFim(e.target.value)}
                disabled={isPending}
              />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={aplicarPersonalizado} disabled={isPending}>
              Aplicar
            </button>
          </div>
        )}
      </div>

      {semDadosNoPeriodo ? (
        <div className="empty-state card">
          <IconInbox style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhuma venda encontrada para o período selecionado.</div>
          <p>Tente escolher outro período ou verifique se há agendamentos cadastrados.</p>
        </div>
      ) : (
        <>
          {/* ── Cards principais ── */}
          <div className="grid-3" style={{ marginBottom: 'var(--space-6)' }}>
            <CardIndicador
              icon={<IconMoney style={{ width: 20, height: 20 }} />}
              cor="warning"
              label="Faturamento (atendimentos concluídos)"
              valor={moeda(resumo.faturamento)}
              comparacao={resumoAnterior ? { atual: resumo.faturamento, anterior: resumoAnterior.faturamento } : undefined}
            />
            <CardIndicador
              icon={<IconCheck style={{ width: 20, height: 20 }} />}
              cor="success"
              label="Vendas (atendimentos concluídos)"
              valor={String(resumo.vendas)}
              comparacao={resumoAnterior ? { atual: resumo.vendas, anterior: resumoAnterior.vendas } : undefined}
            />
            <CardIndicador
              icon={<IconChartBar style={{ width: 20, height: 20 }} />}
              cor="info"
              label="Ticket médio (por venda)"
              valor={moeda(resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0)}
            />
            <CardIndicador
              icon={<IconCalendar style={{ width: 20, height: 20 }} />}
              cor="primary"
              label="Atendimentos no período"
              valor={String(resumo.atendimentos_total)}
              comparacao={resumoAnterior ? { atual: resumo.atendimentos_total, anterior: resumoAnterior.atendimentos_total } : undefined}
            />
            <CardIndicador
              icon={<IconClock style={{ width: 20, height: 20 }} />}
              cor="info"
              label="Valor médio por atendimento"
              valor={moeda(resumo.atendimentos_total > 0 ? resumo.valor_atendimentos_total / resumo.atendimentos_total : 0)}
            />
            <CardIndicador
              icon={<IconAlert style={{ width: 20, height: 20 }} />}
              cor="danger"
              label="Total pendente (agendado/confirmado)"
              valor={moeda(resumo.pendente)}
            />
          </div>

          {/* ── Evolução do faturamento ── */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 className="relatorio-secao-titulo">Evolução das vendas</h3>
            <GraficoFaturamento dados={porDia} />
          </div>

          {/* ── Vendas por forma de pagamento (migration 057) ── */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 className="relatorio-secao-titulo">
              <IconMoney style={{ width: 15, height: 15 }} /> Vendas por forma de pagamento
            </h3>
            <VendasPorPagamento linhas={porPagamento} />
          </div>

          {/* ── Planos recorrentes (migration 060) ── */}
          {relatorioPlanos?.tem_planos && (
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
              <h3 className="relatorio-secao-titulo">
                <IconRepeat style={{ width: 15, height: 15 }} /> Planos e assinaturas
              </h3>
              <PlanosNoRelatorio r={relatorioPlanos} />
            </div>
          )}

          <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
            {/* ── Vendas por serviço ── */}
            <div className="card">
              <h3 className="relatorio-secao-titulo">
                <IconScissors style={{ width: 15, height: 15 }} /> Vendas por serviço
              </h3>
              {porServico.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma venda concluída neste período.</p>
              ) : (
                <div className="relatorio-lista">
                  {porServico.map(s => (
                    <div key={s.id_servico} className="relatorio-lista-item">
                      <div className="relatorio-lista-info">
                        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome_servico}</div>
                        <div className="text-xs text-muted">{s.qtd_vendas} atendimento{s.qtd_vendas !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="font-semibold text-success">{moeda(s.faturamento)}</div>
                        <div className="text-xs text-muted">{((s.faturamento / resumo.faturamento) * 100 || 0).toFixed(1)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Vendas por profissional ── */}
            <div className="card">
              <h3 className="relatorio-secao-titulo">
                <IconUserBadge style={{ width: 15, height: 15 }} /> Vendas por profissional
              </h3>
              {porProfissional.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma venda concluída neste período.</p>
              ) : (
                <div className="relatorio-lista">
                  {porProfissional.map(p => (
                    <div key={p.id_funcionario ?? 'sem-profissional'} className="relatorio-lista-item">
                      <div className="relatorio-lista-info">
                        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome_funcionario}</div>
                        <div className="text-xs text-muted">{p.qtd_atendimentos} atendimento{p.qtd_atendimentos !== 1 ? 's' : ''} · ticket médio {moeda(p.ticket_medio)}</div>
                      </div>
                      <div className="font-semibold text-success">{moeda(p.faturamento)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-6)' }}>
            {/* ── Clientes ── */}
            <div className="card">
              <h3 className="relatorio-secao-titulo">
                <IconUsers style={{ width: 15, height: 15 }} /> Clientes
              </h3>
              {clientesResumo && (
                <div className="relatorio-mini-stats">
                  <div><span>{clientesResumo.clientes_atendidos}</span>atendidos</div>
                  <div><span>{clientesResumo.clientes_novos}</span>novos</div>
                  <div><span>{clientesResumo.clientes_recorrentes}</span>recorrentes</div>
                </div>
              )}
              {porCliente.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma venda concluída neste período.</p>
              ) : (
                <div className="relatorio-lista">
                  {porCliente.map(c => (
                    <div key={c.id_cliente} className="relatorio-lista-item">
                      <div className="relatorio-lista-info">
                        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{c.nome_cliente}</div>
                        <div className="text-xs text-muted">{c.qtd_atendimentos} atendimento{c.qtd_atendimentos !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="font-semibold text-success">{moeda(c.valor_total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Detalhamento ── */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <h3 className="relatorio-secao-titulo" style={{ marginBottom: 0 }}>Detalhamento das vendas</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportar} disabled={isExporting}>
                <IconDownload style={{ width: 14, height: 14 }} /> {isExporting ? 'Exportando...' : 'Exportar CSV'}
              </button>
            </div>

            {exportErro && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>{exportErro}</span>
              </div>
            )}

            <div className="relatorio-tabela-filtros">
              <select className="form-select" value={filtroFuncionario} onChange={e => mudarFiltro('funcionario', e.target.value)} disabled={isPending}>
                <option value="">Todos os profissionais</option>
                {funcionarios.map(f => <option key={f.id_funcionario} value={f.id_funcionario}>{f.nome}</option>)}
              </select>
              <select className="form-select" value={filtroServico} onChange={e => mudarFiltro('servico', e.target.value)} disabled={isPending}>
                <option value="">Todos os serviços</option>
                {servicos.map(s => <option key={s.id_servico} value={s.id_servico}>{s.nome}</option>)}
              </select>
              <select className="form-select" value={filtroStatus} onChange={e => mudarFiltro('status', e.target.value)} disabled={isPending}>
                <option value="">Todos os status</option>
                {STATUS_OPCOES.map(s => <option key={s} value={s}>{rotuloStatus(s)}</option>)}
              </select>
              <select className="form-select" value={ordenar} onChange={e => mudarOrdenacao(e.target.value)} disabled={isPending}>
                <option value="data_desc">Mais recentes primeiro</option>
                <option value="data_asc">Mais antigos primeiro</option>
                <option value="valor_desc">Maior valor primeiro</option>
                <option value="valor_asc">Menor valor primeiro</option>
              </select>
            </div>

            {detalhamento.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
                <IconInbox style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-3)' }} />
                <p className="text-sm text-muted">Nenhum registro com esses filtros.</p>
              </div>
            ) : (
              <>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Horário</th>
                        <th>Cliente</th>
                        <th>Pet</th>
                        <th>Serviço</th>
                        <th>Profissional</th>
                        <th>Valor</th>
                        <th>Pagamento</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhamento.map(row => (
                        <tr key={row.id_agendamento}>
                          <td>{format(parseISO(row.dt_agendamento), 'dd/MM/yyyy')}</td>
                          <td>{row.hr_agendamento.slice(0, 5)}</td>
                          <td>{row.nome_cliente}</td>
                          <td>{row.nome_pet}</td>
                          <td>{row.nome_servico}</td>
                          <td>{row.nome_funcionario ?? '—'}</td>
                          <td>{moeda(row.valor)}</td>
                          <td>
                            <span className="text-sm">{rotuloForma(row.forma_pagamento)}</span>
                            {ehStatusPagamento(row.status_pagamento) && (
                              <span className={`badge ${CLASSE_STATUS_PAGAMENTO[row.status_pagamento]}`} style={{ marginLeft: 6 }}>{ROTULO_STATUS_PAGAMENTO[row.status_pagamento]}</span>
                            )}
                          </td>
                          <td><span className={`badge ${classeBadgeStatus(row.status)}`}>{rotuloStatus(row.status)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="relatorio-paginacao">
                  <span className="text-sm text-muted">
                    {totalDetalhamento} registro{totalDetalhamento !== 1 ? 's' : ''} · página {pagina} de {totalPaginas}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => irParaPagina(pagina - 1)} disabled={pagina <= 1 || isPending}>
                      <IconChevronLeft style={{ width: 14, height: 14 }} /> Anterior
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => irParaPagina(pagina + 1)} disabled={pagina >= totalPaginas || isPending}>
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

// ============================================================
// Planos: receita paga no período, cobranças pelo vencimento, os planos
// e os serviços mais usados pelos benefícios.
// ============================================================
function PlanosNoRelatorio({ r }: { r: RelatorioPlanos }) {
  const maiorUso = Math.max(1, ...r.servicos.map(s => Number(s.usos)))
  return (
    <>
      <div className="relatorio-mini-stats">
        <div><span className="text-success">{moeda(Number(r.receita_periodo))}</span>receita de planos (pagamentos no período)</div>
        <div><span>{r.ativas}</span>planos ativos · {moeda(Number(r.receita_mensal))}/mês recorrente</div>
      </div>
      <div className="relatorio-mini-stats">
        <div><span className="text-success">{r.pagas_qtd}</span>pagas · {moeda(Number(r.pagas_valor))}</div>
        <div><span style={{ color: 'var(--warning-400)' }}>{r.pendentes_qtd}</span>pendentes · {moeda(Number(r.pendentes_valor))}</div>
        <div><span style={{ color: 'var(--danger-400)' }}>{r.vencidas_qtd}</span>vencidas · {moeda(Number(r.vencidas_valor))}</div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start', marginTop: 'var(--space-4)' }}>
        <div>
          <div className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>Planos mais vendidos</div>
          <div className="relatorio-lista">
            {r.planos.map(p => (
              <div key={p.plano} className="relatorio-lista-item">
                <div className="relatorio-lista-info">
                  <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.plano}</div>
                  <div className="text-xs text-muted">{p.ativas} ativa{p.ativas !== 1 ? 's' : ''} · {p.novas} nova{p.novas !== 1 ? 's' : ''} no período</div>
                </div>
                <div className="font-semibold text-success">{moeda(Number(p.receita))}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>Serviços mais usados pelos planos</div>
          {r.servicos.length === 0 ? (
            <p className="text-sm text-muted" style={{ margin: 0 }}>Nenhum benefício usado neste período.</p>
          ) : (
            <div className="relatorio-lista">
              {r.servicos.map(s => (
                <div key={s.servico} className="relatorio-lista-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-1)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.servico}</span>
                    <span className="text-sm">{s.usos} uso{Number(s.usos) !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="pag-rel-barra" aria-hidden>
                    <span className="pag-rel-barra-pago" style={{ width: `${(Number(s.usos) / maiorUso) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-muted" style={{ margin: 'var(--space-3) 0 0' }}>
        Pagas/pendentes/vencidas: cobranças com vencimento no período. Receita: cobranças marcadas como pagas no período. Serviço usado pelo plano não entra no faturamento dos atendimentos (a receita vem da cobrança do plano).
      </p>
    </>
  )
}

// ============================================================
// Vendas por forma de pagamento: registrado, recebido e a receber no
// período, e cada forma com quantos pedidos e quanto.
// ============================================================
function VendasPorPagamento({ linhas }: { linhas: VendaPorPagamento[] | null }) {
  if (linhas === null) {
    return <p className="text-sm text-muted">Execute a migration 057_formas_pagamento.sql para ver as vendas por forma de pagamento.</p>
  }
  if (linhas.length === 0) {
    return <p className="text-sm text-muted">Nenhum pedido neste período.</p>
  }
  const total = linhas.reduce((s, l) => s + l.total, 0)
  const recebido = linhas.reduce((s, l) => s + l.recebido, 0)
  const pendente = linhas.reduce((s, l) => s + l.pendente, 0)
  const pedidos = linhas.reduce((s, l) => s + l.pedidos, 0)

  return (
    <>
      <div className="relatorio-mini-stats">
        <div><span>{moeda(total)}</span>registrado em {pedidos} pedido{pedidos !== 1 ? 's' : ''}</div>
        <div><span className="text-success">{moeda(recebido)}</span>recebido</div>
        <div><span style={{ color: 'var(--warning-400)' }}>{moeda(pendente)}</span>a receber</div>
      </div>
      <div className="relatorio-lista">
        {linhas.map(l => (
          <div key={l.forma} className="relatorio-lista-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="relatorio-lista-info">
                <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{rotuloForma(l.forma === 'nao_informada' ? null : l.forma)}</div>
                <div className="text-xs text-muted">
                  {l.pedidos} pedido{l.pedidos !== 1 ? 's' : ''} · {l.forma === 'nao_informada'
                    ? 'de antes das formas de pagamento'
                    : `recebido ${moeda(l.recebido)} · a receber ${moeda(l.pendente)}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-semibold text-success">{moeda(l.total)}</div>
                <div className="text-xs text-muted">{((l.total / total) * 100 || 0).toFixed(1)}%</div>
              </div>
            </div>
            <div className="pag-rel-barra" aria-hidden>
              <span className="pag-rel-barra-pago" style={{ width: `${(l.recebido / (total || 1)) * 100}%` }} />
              <span className="pag-rel-barra-pendente" style={{ width: `${(l.pendente / (total || 1)) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted" style={{ margin: 'var(--space-3) 0 0' }}>
        Pedidos com data no período, sem os cancelados. &quot;Recebido&quot; é o que a loja marcou como pago; &quot;Não informada&quot; são agendamentos de antes das formas de pagamento.
      </p>
    </>
  )
}

// ============================================================
// Card de indicador — reaproveita .stat-card (o mesmo do Dashboard);
// a "comparação com período anterior" fica aqui dentro, calculada a
// partir de dois números reais (nunca uma porcentagem inventada).
// ============================================================
function CardIndicador({
  icon,
  cor,
  label,
  valor,
  comparacao,
}: {
  icon: React.ReactNode
  cor: 'primary' | 'success' | 'warning' | 'info' | 'danger'
  label: string
  valor: string
  comparacao?: { atual: number; anterior: number }
}) {

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <div className={`stat-card-icon tone-${cor}`}>
          {icon}
        </div>
        {comparacao && <ComparacaoBadge {...comparacao} />}
      </div>
      <div className="stat-card-value">{valor}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  )
}

function ComparacaoBadge({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0) {
    if (atual === 0) return null
    return <span className="badge badge-ativo">Novo</span>
  }
  const pct = variacaoPercentual(atual, anterior)
  if (pct === null || Math.abs(pct) < 0.05) return <span className="badge badge-inativo">= período anterior</span>
  const positivo = pct > 0
  return (
    <span className={`badge ${positivo ? 'badge-ativo' : 'badge-cancelado'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {positivo ? <IconTrendUp style={{ width: 11, height: 11 }} /> : <IconTrendDown style={{ width: 11, height: 11 }} />}
      {positivo ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

// ============================================================
// Gráfico de evolução — barras simples em CSS/HTML puro (sem lib),
// como pedido: "não adicionar biblioteca pesada pra um gráfico simples".
// ============================================================
function GraficoFaturamento({ dados }: { dados: VendaPorDia[] }) {
  if (dados.length === 0) {
    return <p className="text-sm text-muted">Sem dados para exibir.</p>
  }

  const maxFaturamento = Math.max(...dados.map(d => d.faturamento), 1)
  const melhorDia = dados.reduce((melhor, d) => (d.faturamento > melhor.faturamento ? d : melhor), dados[0])
  const diasComVenda = dados.filter(d => d.faturamento > 0)
  const piorDia = diasComVenda.length > 0
    ? diasComVenda.reduce((pior, d) => (d.faturamento < pior.faturamento ? d : pior), diasComVenda[0])
    : null

  // Mostra rótulo de data só de tempos em tempos, senão os dias somem
  // uns em cima dos outros num período de 30/90 dias.
  const passoRotulo = Math.max(1, Math.ceil(dados.length / 10))

  return (
    <div>
      <div className="relatorio-grafico">
        {dados.map((d, i) => {
          const altura = Math.max(2, (d.faturamento / maxFaturamento) * 100)
          const ehMelhor = d.dia === melhorDia.dia && d.faturamento > 0
          return (
            <div key={d.dia} className="relatorio-grafico-col">
              <div className="relatorio-grafico-barra-wrap" title={`${format(parseISO(d.dia), 'dd/MM')}: ${moeda(d.faturamento)} · ${d.vendas} venda${d.vendas !== 1 ? 's' : ''}`}>
                <div
                  className={`relatorio-grafico-barra ${ehMelhor ? 'is-melhor' : ''}`}
                  style={{ height: `${altura}%` }}
                />
              </div>
              {i % passoRotulo === 0 && (
                <span className="relatorio-grafico-label">{format(parseISO(d.dia), 'dd/MM')}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="relatorio-grafico-legenda">
        <span>
          <strong className="text-success">Maior faturamento:</strong> {format(parseISO(melhorDia.dia), 'dd/MM')} ({moeda(melhorDia.faturamento)})
        </span>
        {piorDia && (
          <span>
            <strong className="text-muted">Menor faturamento (com venda):</strong> {format(parseISO(piorDia.dia), 'dd/MM')} ({moeda(piorDia.faturamento)})
          </span>
        )}
      </div>
    </div>
  )
}
