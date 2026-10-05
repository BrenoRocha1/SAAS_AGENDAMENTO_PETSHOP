'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { exportarRelatorioVendasCsvAction } from '@/lib/actions'
import { PRESETS, type PeriodoPreset, type Periodo } from '@/lib/relatorios'
import { hojeBrasilISO } from '@/lib/agenda'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import FiltroPeriodo from '@/components/lojista/FiltroPeriodo'
import { Badge } from '@/components/ui/badge'
import { GradeIndicadores, Indicador, compararComAnterior } from '@/components/relatorio/Indicador'
import { DuasColunas, GrupoDaSecao, NotaDaSecao, Pilha, Secao, SecaoVazia } from '@/components/relatorio/Secao'
import { MiniIndicadores } from '@/components/relatorio/MiniIndicadores'
import { BarraEmPartes, Ranking } from '@/components/relatorio/Ranking'
import { formatarReais } from '@/lib/taxidog'
import { CLASSE_STATUS_PAGAMENTO, ROTULO_STATUS_PAGAMENTO, ehFormaPlano, ehStatusPagamento, rotuloForma } from '@/lib/pagamento'
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
  IconUserBadge,
  IconUsers,
  IconRepeat,
  IconPackage,
} from '@/components/icons'
import { rotuloEstoque } from '@/lib/produto'

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

// fn_relatorio_vendas_produtos (migration 062): itens de atendimentos
// concluídos no período — bruto, CMV (custo da venda) e líquido.
export interface VendasProdutos {
  bruto: number
  cmv: number
  liquido: number
  bruto_com_custo: number
  bruto_sem_custo: number
  itens_sem_custo: number
  pedidos: number
  produtos: {
    id_produto: string
    produto: string
    unidade_venda: string
    quantidade: number
    bruto: number
    cmv: number
    liquido: number
    bruto_com_custo: number
    sem_custo: number
  }[]
}

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
  // Vendas de produtos com CMV (migration 062) — null sem ela.
  vendasProdutos: VendasProdutos | null
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

const moeda = formatarReais

// O gráfico (Recharts) só é baixado por quem abre o relatório, e só no
// navegador — a biblioteca é pesada pra entrar no pacote das outras telas.
const GraficoEvolucao = dynamic(() => import('@/components/relatorio/GraficoEvolucao'), {
  ssr: false,
  loading: () => <div style={{ height: '16rem' }} aria-hidden />,
})

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
  vendasProdutos,
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

  function aplicarPersonalizado(ini: string, fim: string) {
    navegar({ periodo: 'personalizado', ini, fim, pagina: undefined })
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
        <FiltroPeriodo
          opcoes={PRESETS}
          valor={preset}
          onMudar={mudarPreset}
          ini={periodo.ini}
          fim={periodo.fim}
          onPersonalizado={aplicarPersonalizado}
          dataMax={hojeBrasilISO()}
        />
      </div>

      {semDadosNoPeriodo ? (
        <div className="empty-state card">
          <IconInbox style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhuma venda encontrada para o período selecionado.</div>
          <p>Tente escolher outro período ou verifique se há agendamentos cadastrados.</p>
        </div>
      ) : (
        <Pilha>
          {/* ── Indicadores ── */}
          <GradeIndicadores>
            <Indicador
              rotulo="Faturamento"
              valor={moeda(resumo.faturamento)}
              icone={<IconMoney />}
              variacao={resumoAnterior && compararComAnterior(resumo.faturamento, resumoAnterior.faturamento)}
              detalhe="atendimentos concluídos"
            />
            <Indicador
              rotulo="Vendas"
              valor={String(resumo.vendas)}
              icone={<IconCheck />}
              variacao={resumoAnterior && compararComAnterior(resumo.vendas, resumoAnterior.vendas)}
              detalhe="atendimentos concluídos"
            />
            <Indicador
              rotulo="Ticket médio"
              valor={moeda(resumo.vendas > 0 ? resumo.faturamento / resumo.vendas : 0)}
              icone={<IconChartBar />}
              detalhe="por venda"
            />
            <Indicador
              rotulo="Atendimentos no período"
              valor={String(resumo.atendimentos_total)}
              icone={<IconCalendar />}
              variacao={resumoAnterior && compararComAnterior(resumo.atendimentos_total, resumoAnterior.atendimentos_total)}
            />
            <Indicador
              rotulo="Valor médio por atendimento"
              valor={moeda(resumo.atendimentos_total > 0 ? resumo.valor_atendimentos_total / resumo.atendimentos_total : 0)}
              icone={<IconClock />}
            />
            <Indicador
              rotulo="Total pendente"
              valor={moeda(resumo.pendente)}
              icone={<IconAlert />}
              detalhe="agendado ou confirmado"
            />
          </GradeIndicadores>

          {/* ── Evolução do faturamento ── */}
          <Secao titulo="Evolução das vendas" descricao="Faturamento por dia dos atendimentos concluídos">
            <EvolucaoDasVendas dados={porDia} />
          </Secao>

          {/* ── Vendas por forma de pagamento (migration 057) ── */}
          <Secao titulo="Vendas por forma de pagamento" icone={<IconMoney />} descricao="Pedidos com data no período, sem os cancelados">
            <VendasPorPagamento linhas={porPagamento} />
          </Secao>

          {/* ── Vendas de produtos: bruto, CMV e líquido (migration 062) ── */}
          {vendasProdutos && (
            <Secao titulo="Vendas de produtos" icone={<IconPackage />} descricao="Produtos vendidos junto de atendimentos concluídos">
              <VendasDeProdutos v={vendasProdutos} />
            </Secao>
          )}

          {/* ── Planos recorrentes (migration 060) ── */}
          {relatorioPlanos?.tem_planos && (
            <Secao titulo="Planos e assinaturas" icone={<IconRepeat />} descricao="Receita e cobranças dos planos no período">
              <PlanosNoRelatorio r={relatorioPlanos} />
            </Secao>
          )}

          <DuasColunas>
            {/* ── Vendas por serviço ── */}
            <Secao titulo="Vendas por serviço" icone={<IconScissors />} descricao="Parte de cada serviço no faturamento">
              {porServico.length === 0 ? (
                <SecaoVazia>Nenhuma venda concluída neste período.</SecaoVazia>
              ) : (
                <Ranking
                  itens={porServico.map(s => ({
                    chave: s.id_servico,
                    titulo: s.nome_servico,
                    valor: moeda(s.faturamento),
                    detalhe: `${s.qtd_vendas} atendimento${s.qtd_vendas !== 1 ? 's' : ''}`,
                    ...parteDe(s.faturamento, resumo.faturamento),
                  }))}
                />
              )}
            </Secao>

            {/* ── Vendas por profissional ── */}
            <Secao titulo="Vendas por profissional" icone={<IconUserBadge />} descricao="Parte de cada profissional no faturamento">
              {porProfissional.length === 0 ? (
                <SecaoVazia>Nenhuma venda concluída neste período.</SecaoVazia>
              ) : (
                <Ranking
                  comIniciais
                  itens={porProfissional.map(p => ({
                    chave: p.id_funcionario ?? 'sem-profissional',
                    titulo: p.nome_funcionario,
                    // Atendimentos sem profissional não são uma pessoa: sem iniciais.
                    sigla: p.id_funcionario ? undefined : '—',
                    valor: moeda(p.faturamento),
                    detalhe: `${p.qtd_atendimentos} atendimento${p.qtd_atendimentos !== 1 ? 's' : ''} · ticket médio ${moeda(p.ticket_medio)}`,
                    ...parteDe(p.faturamento, resumo.faturamento),
                  }))}
                />
              )}
            </Secao>
          </DuasColunas>

          {/* ── Clientes ── */}
          <Secao titulo="Clientes" icone={<IconUsers />} descricao="Quem mais comprou no período">
            {clientesResumo && (
              <MiniIndicadores
                itens={[
                  { valor: clientesResumo.clientes_atendidos, rotulo: 'atendidos' },
                  { valor: clientesResumo.clientes_novos, rotulo: 'novos' },
                  { valor: clientesResumo.clientes_recorrentes, rotulo: 'recorrentes' },
                ]}
              />
            )}
            {porCliente.length === 0 ? (
              <SecaoVazia>Nenhuma venda concluída neste período.</SecaoVazia>
            ) : (
              <Ranking
                comIniciais
                itens={porCliente.map(c => ({
                  chave: c.id_cliente,
                  titulo: c.nome_cliente,
                  valor: moeda(c.valor_total),
                  detalhe: `${c.qtd_atendimentos} atendimento${c.qtd_atendimentos !== 1 ? 's' : ''}`,
                  ...parteDe(c.valor_total, resumo.faturamento),
                }))}
              />
            )}
          </Secao>

          {/* ── Detalhamento ── */}
          <Secao
            titulo="Detalhamento das vendas"
            descricao="Todos os agendamentos do período, um por linha"
            acao={
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportar} disabled={isExporting}>
                <IconDownload style={{ width: 14, height: 14 }} /> {isExporting ? 'Exportando...' : 'Exportar CSV'}
              </button>
            }
          >
            {exportErro && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>{exportErro}</span>
              </div>
            )}

            <div className="relatorio-tabela-filtros" style={{ marginBottom: 0 }}>
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
                          <td style={{ whiteSpace: 'nowrap' }}>{moeda(row.valor)}</td>
                          <td>
                            <span className="text-sm">{rotuloForma(row.forma_pagamento)}</span>
                            {!ehFormaPlano(row.forma_pagamento) && ehStatusPagamento(row.status_pagamento) && (
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
          </Secao>
        </Pilha>
      )}
    </div>
  )
}

// Peso de `valor` em `total`, pra barra e pro texto ao lado ("42,5%").
// Sem total, a linha fica sem barra.
function parteDe(valor: number, total: number): { parte?: number; rotuloDaParte?: string } {
  if (!(total > 0)) return {}
  const parte = valor / total
  return { parte, rotuloDaParte: `${(parte * 100).toFixed(1).replace('.', ',')}%` }
}

// ============================================================
// Evolução: faturamento por dia em gráfico de área e, embaixo, o melhor e
// o pior dia (com venda) do período.
// ============================================================
function EvolucaoDasVendas({ dados }: { dados: VendaPorDia[] }) {
  if (dados.length === 0) {
    return <SecaoVazia>Sem dados para exibir.</SecaoVazia>
  }

  const melhorDia = dados.reduce((melhor, d) => (d.faturamento > melhor.faturamento ? d : melhor), dados[0])
  const diasComVenda = dados.filter(d => d.faturamento > 0)
  const piorDia = diasComVenda.length > 0
    ? diasComVenda.reduce((pior, d) => (d.faturamento < pior.faturamento ? d : pior), diasComVenda[0])
    : null
  const dia = (iso: string) => format(parseISO(iso), 'dd/MM')

  return (
    <>
      <GraficoEvolucao pontos={dados.map(d => ({ rotulo: dia(d.dia), faturamento: Number(d.faturamento), vendas: Number(d.vendas) }))} />
      <MiniIndicadores
        itens={[
          { valor: moeda(melhorDia.faturamento), rotulo: `maior faturamento · ${dia(melhorDia.dia)}`, tom: 'sucesso' },
          ...(piorDia ? [{ valor: moeda(piorDia.faturamento), rotulo: `menor faturamento (com venda) · ${dia(piorDia.dia)}` }] : []),
          { valor: `${diasComVenda.length} de ${dados.length}`, rotulo: 'dias com venda' },
        ]}
      />
    </>
  )
}

// ============================================================
// Vendas de produtos: faturamento bruto, CMV e faturamento líquido
// (bruto − CMV), no total e por produto.
// ============================================================
function margem(liquidoComCusto: number, brutoComCusto: number): string {
  return brutoComCusto > 0 ? `${((liquidoComCusto / brutoComCusto) * 100).toFixed(1).replace('.', ',')}%` : '—'
}

function VendasDeProdutos({ v }: { v: VendasProdutos }) {
  const bruto = Number(v.bruto)
  const cmv = Number(v.cmv)
  const brutoComCusto = Number(v.bruto_com_custo)
  if (bruto === 0) {
    return <SecaoVazia>Nenhum produto vendido em atendimentos concluídos neste período.</SecaoVazia>
  }
  return (
    <>
      <MiniIndicadores
        itens={[
          { valor: moeda(bruto), rotulo: 'faturamento bruto' },
          { valor: moeda(cmv), rotulo: 'CMV (custo das mercadorias)', tom: 'perigo' },
          { valor: moeda(Number(v.liquido)), rotulo: 'faturamento líquido (bruto − CMV)', tom: 'sucesso' },
          { valor: margem(brutoComCusto - cmv, brutoComCusto), rotulo: 'margem' },
        ]}
      />
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd.</th>
              <th>Bruto</th>
              <th>CMV</th>
              <th>Líquido</th>
              <th>Margem</th>
            </tr>
          </thead>
          <tbody>
            {v.produtos.map(p => (
              <tr key={p.id_produto}>
                <td className="font-semibold">{p.produto}</td>
                <td>{rotuloEstoque(Number(p.quantidade), p.unidade_venda)}</td>
                <td>{moeda(Number(p.bruto))}</td>
                <td>
                  {Number(p.bruto_com_custo) > 0 ? moeda(Number(p.cmv)) : <span className="text-muted">sem custo</span>}
                  {Number(p.sem_custo) > 0 && Number(p.bruto_com_custo) > 0 && <div className="text-xs text-muted">{p.sem_custo} sem custo</div>}
                </td>
                <td className="text-success font-semibold">{moeda(Number(p.liquido))}</td>
                <td>{margem(Number(p.bruto_com_custo) - Number(p.cmv), Number(p.bruto_com_custo))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NotaDaSecao>
        Mesma regra do faturamento: só entram atendimentos concluídos no período. O CMV usa o custo registrado no momento de cada venda.
        {Number(v.itens_sem_custo) > 0 && (
          <> <strong>{moeda(Number(v.bruto_sem_custo))}</strong> em {v.itens_sem_custo} venda{Number(v.itens_sem_custo) !== 1 ? 's' : ''} sem custo registrado (feitas antes de cadastrar o custo): entram no bruto e no líquido sem descontar CMV, e ficam fora da margem. Cadastre o custo em Produtos para as próximas vendas.</>
        )}
      </NotaDaSecao>
    </>
  )
}

// ============================================================
// Planos: receita paga no período, cobranças pelo vencimento, os planos
// e os serviços mais usados pelos benefícios.
// ============================================================
function PlanosNoRelatorio({ r }: { r: RelatorioPlanos }) {
  const maiorUso = Math.max(1, ...r.servicos.map(s => Number(s.usos)))
  const receitaDosPlanos = r.planos.reduce((soma, p) => soma + Number(p.receita), 0)
  return (
    <>
      <MiniIndicadores
        itens={[
          { valor: moeda(Number(r.receita_periodo)), rotulo: 'receita de planos (pagamentos no período)', tom: 'sucesso' },
          { valor: r.ativas, rotulo: `planos ativos · ${moeda(Number(r.receita_mensal))}/mês recorrente` },
          { valor: r.pagas_qtd, rotulo: `cobranças pagas · ${moeda(Number(r.pagas_valor))}`, tom: 'sucesso' },
          { valor: r.pendentes_qtd, rotulo: `pendentes · ${moeda(Number(r.pendentes_valor))}`, tom: 'alerta' },
          { valor: r.vencidas_qtd, rotulo: `vencidas · ${moeda(Number(r.vencidas_valor))}`, tom: 'perigo' },
        ]}
      />
      <DuasColunas>
        <GrupoDaSecao titulo="Planos mais vendidos">
          <Ranking
            itens={r.planos.map(p => ({
              chave: p.plano,
              titulo: p.plano,
              valor: moeda(Number(p.receita)),
              detalhe: `${p.ativas} ativa${p.ativas !== 1 ? 's' : ''} · ${p.novas} nova${p.novas !== 1 ? 's' : ''} no período`,
              ...parteDe(Number(p.receita), receitaDosPlanos),
            }))}
          />
        </GrupoDaSecao>
        <GrupoDaSecao titulo="Serviços mais usados pelos planos">
          {r.servicos.length === 0 ? (
            <SecaoVazia>Nenhum benefício usado neste período.</SecaoVazia>
          ) : (
            <Ranking
              itens={r.servicos.map(s => ({
                chave: s.servico,
                titulo: s.servico,
                valor: `${s.usos} uso${Number(s.usos) !== 1 ? 's' : ''}`,
                parte: Number(s.usos) / maiorUso,
              }))}
            />
          )}
        </GrupoDaSecao>
      </DuasColunas>
      <NotaDaSecao>
        Pagas/pendentes/vencidas: cobranças com vencimento no período. Receita: cobranças marcadas como pagas no período. Serviço usado pelo plano não entra no faturamento dos atendimentos (a receita vem da cobrança do plano).
      </NotaDaSecao>
    </>
  )
}

// ============================================================
// Vendas por forma de pagamento: registrado, recebido e a receber no
// período, e cada forma com quantos pedidos e quanto.
// ============================================================
function VendasPorPagamento({ linhas }: { linhas: VendaPorPagamento[] | null }) {
  if (linhas === null) {
    return <SecaoVazia>Execute a migration 057_formas_pagamento.sql para ver as vendas por forma de pagamento.</SecaoVazia>
  }
  if (linhas.length === 0) {
    return <SecaoVazia>Nenhum pedido neste período.</SecaoVazia>
  }
  const total = linhas.reduce((s, l) => s + l.total, 0)
  const recebido = linhas.reduce((s, l) => s + l.recebido, 0)
  const pendente = linhas.reduce((s, l) => s + l.pendente, 0)
  const pedidos = linhas.reduce((s, l) => s + l.pedidos, 0)

  return (
    <>
      <MiniIndicadores
        itens={[
          { valor: moeda(total), rotulo: `registrado em ${pedidos} pedido${pedidos !== 1 ? 's' : ''}` },
          { valor: moeda(recebido), rotulo: 'recebido', tom: 'sucesso' },
          { valor: moeda(pendente), rotulo: 'a receber', tom: 'alerta' },
        ]}
      />
      <Ranking
        itens={linhas.map(l => ({
          chave: l.forma,
          titulo: rotuloForma(l.forma === 'nao_informada' ? null : l.forma),
          etiqueta: <Badge variant="secondary">{l.pedidos} pedido{l.pedidos !== 1 ? 's' : ''}</Badge>,
          valor: moeda(l.total),
          detalhe: l.forma === 'nao_informada'
            ? 'sem forma de pagamento registrada'
            : ehFormaPlano(l.forma)
              ? 'pelo plano, sem cobrança no agendamento'
              : `recebido ${moeda(l.recebido)} · a receber ${moeda(l.pendente)}`,
          // A barra é a fatia da forma no total: verde o recebido, âmbar o que falta.
          barra: (
            <BarraEmPartes
              total={total}
              partes={[
                { valor: l.recebido, tom: 'sucesso' },
                { valor: l.pendente, tom: 'alerta' },
                { valor: Math.max(0, l.total - l.recebido - l.pendente), tom: 'neutro' },
              ]}
              rotulo={`${rotuloForma(l.forma === 'nao_informada' ? null : l.forma)}: recebido e a receber`}
            />
          ),
          rotuloDaParte: parteDe(l.total, total).rotuloDaParte,
        }))}
      />
      <NotaDaSecao>
        Na barra, verde é o recebido, âmbar o que falta receber e cinza o que não tem situação de pagamento. &quot;Recebido&quot; é o que a loja marcou como pago; &quot;Não informada&quot; são agendamentos de antes das formas de pagamento.
      </NotaDaSecao>
    </>
  )
}
