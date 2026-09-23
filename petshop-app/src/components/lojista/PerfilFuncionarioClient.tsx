'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, differenceInCalendarDays, startOfWeek, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toggleFuncionarioAction } from '@/lib/actions'
import { formatarTelefone } from '@/lib/format'
import { PRESETS, variacaoPercentual, type PeriodoPreset, type Periodo } from '@/lib/relatorios'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconClock,
  IconDog,
  IconInbox,
  IconMoney,
  IconPencil,
  IconScissors,
  IconTrendDown,
  IconTrendUp,
  IconUserBadge,
  IconUsers,
} from '@/components/icons'

export interface FuncionarioInfo {
  id_funcionario: string
  nome: string
  email: string
  telefone: string
  cargo: string | null
  pode_gerenciar_agenda: boolean
  pode_gerenciar_servicos: boolean
  pode_gerenciar_produtos: boolean
  pode_gerenciar_clientes_pets: boolean
  pode_taxidog?: boolean
  acesso_total: boolean
  ativo: boolean
  created_at: string
}

export interface AgendamentoFuncionario {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  valor: number
  id_pet: string
  nome_pet: string
  id_servico: string
  nome_servico: string
  id_cliente: string
  nome_cliente: string
}

interface Props {
  funcionario: FuncionarioInfo
  preset: PeriodoPreset
  periodo: Periodo
  agendamentos: AgendamentoFuncionario[]
  agendamentosAnterior: AgendamentoFuncionario[]
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function moeda(v: number) {
  return `R$ ${v.toFixed(2)}`
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

// Mesmo truque usado em Kanban/Agenda: meio-dia fixo pra parseISO não
// escorregar de dia por causa de fuso — dt_agendamento é só 'yyyy-MM-dd'.
function parseDia(iso: string) {
  return parseISO(`${iso}T12:00:00`)
}

export default function PerfilFuncionarioClient({ funcionario, preset, periodo, agendamentos, agendamentosAnterior }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPendingToggle, startToggleTransition] = useTransition()
  const [toggleErro, setToggleErro] = useState<string | null>(null)

  const [customIni, setCustomIni] = useState(periodo.ini)
  const [customFim, setCustomFim] = useState(periodo.fim)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroServico, setFiltroServico] = useState('')

  function navegar(overrides: Record<string, string | undefined>) {
    const params: Record<string, string | undefined> = {
      periodo: preset,
      ini: preset === 'personalizado' ? periodo.ini : undefined,
      fim: preset === 'personalizado' ? periodo.fim : undefined,
      ...overrides,
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v)
    }
    const query = qs.toString()
    startTransition(() => router.push(`/lojista/equipe/${funcionario.id_funcionario}${query ? `?${query}` : ''}`))
  }

  function handleToggle() {
    setToggleErro(null)
    startToggleTransition(async () => {
      const result = await toggleFuncionarioAction(funcionario.id_funcionario, !funcionario.ativo)
      if (result?.error) { setToggleErro(result.error); return }
      router.refresh()
    })
  }

  // ============================================================
  // Todo o resumo, ranking, evolução etc. é derivado AQUI, em cima do
  // array que o servidor já trouxe filtrado pelo período — nenhuma
  // consulta nova por seção (nada de N+1). O conjunto é inerentemente
  // pequeno (agendamentos de UM funcionário num período), então agregar
  // em JS é mais simples e mais barato que várias RPCs separadas.
  // ============================================================
  const resumo = useMemo(() => calcularResumo(agendamentos), [agendamentos])
  const resumoAnterior = useMemo(() => calcularResumo(agendamentosAnterior), [agendamentosAnterior])
  const porServico = useMemo(() => calcularPorServico(agendamentos), [agendamentos])
  const porPet = useMemo(() => calcularPorPet(agendamentos), [agendamentos])
  const porCliente = useMemo(() => calcularPorCliente(agendamentos), [agendamentos])
  const evolucao = useMemo(() => calcularEvolucao(agendamentos, periodo), [agendamentos, periodo])
  const porDiaSemana = useMemo(() => calcularDiasSemana(agendamentos), [agendamentos])
  const porHorario = useMemo(() => calcularHorarios(agendamentos), [agendamentos])

  const servicosDisponiveis = useMemo(
    () => Array.from(new Map(agendamentos.map(a => [a.id_servico, a.nome_servico])).entries()),
    [agendamentos]
  )
  const historico = useMemo(() => {
    return agendamentos.filter(a => {
      if (filtroStatus && a.status !== filtroStatus) return false
      if (filtroServico && a.id_servico !== filtroServico) return false
      return true
    })
  }, [agendamentos, filtroStatus, filtroServico])

  const semDados = agendamentos.length === 0

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms' }}>
      {/* ── Cabeçalho ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {funcionario.nome}
            {!funcionario.ativo && <span className="badge badge-cancelado">Inativo</span>}
          </h1>
          <p className="page-subtitle">
            {funcionario.cargo ?? 'Sem cargo definido'} · {funcionario.email}
            {isPending && ' · Atualizando...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Link href="/lojista/agendamentos" className="btn btn-secondary btn-sm">
            <IconCalendar style={{ width: 14, height: 14 }} /> Ver Agenda
          </Link>
          <Link href="/lojista/servicos" className="btn btn-secondary btn-sm">
            <IconScissors style={{ width: 14, height: 14 }} /> Ver Serviços
          </Link>
          <Link
            href={`/lojista/agendamentos?novoAgendamentoProfissional=${funcionario.id_funcionario}`}
            className="btn btn-secondary btn-sm"
          >
            <IconCalendar style={{ width: 14, height: 14 }} /> Novo Agendamento
          </Link>
          <button
            className={`btn btn-sm ${funcionario.ativo ? 'btn-danger' : 'btn-secondary'}`}
            onClick={handleToggle}
            disabled={isPendingToggle}
          >
            {isPendingToggle ? 'Salvando...' : funcionario.ativo ? 'Desativar' : 'Reativar'}
          </button>
          <Link href="/lojista/equipe" className="btn btn-primary btn-sm">
            <IconPencil style={{ width: 14, height: 14 }} /> Editar
          </Link>
        </div>
      </div>

      {toggleErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{toggleErro}</span>
        </div>
      )}

      {/* ── Filtro de período ── */}
      <div className="relatorio-filtros card">
        <div className="relatorio-presets">
          {PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              className={`btn btn-sm ${preset === p.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => navegar({ periodo: p.value, ini: undefined, fim: undefined })}
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
              <input type="date" className="form-input" value={customIni} max={customFim} onChange={e => setCustomIni(e.target.value)} disabled={isPending} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Até</label>
              <input type="date" className="form-input" value={customFim} min={customIni} max={format(new Date(), 'yyyy-MM-dd')} onChange={e => setCustomFim(e.target.value)} disabled={isPending} />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navegar({ periodo: 'personalizado', ini: customIni, fim: customFim })} disabled={isPending}>
              Aplicar
            </button>
          </div>
        )}
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Período: {format(parseDia(periodo.ini), 'dd/MM/yyyy')} a {format(parseDia(periodo.fim), 'dd/MM/yyyy')} — todos os números desta página são deste intervalo.
        </p>
      </div>

      {semDados ? (
        <div className="empty-state card">
          <IconInbox style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum atendimento encontrado para o período selecionado.</div>
          <p>Tente escolher outro período.</p>
        </div>
      ) : (
        <>
          {/* ── Resumo ── */}
          <div className="grid-4" style={{ marginBottom: 'var(--space-6)' }}>
            <Card icon={<IconCalendar style={{ width: 20, height: 20 }} />} cor="primary" label="Atendimentos realizados" valor={String(resumo.qtdAtendimentos)} comparacao={{ atual: resumo.qtdAtendimentos, anterior: resumoAnterior.qtdAtendimentos }} />
            <Card icon={<IconDog style={{ width: 20, height: 20 }} />} cor="success" label="Pets atendidos (diferentes)" valor={String(resumo.petsUnicos)} comparacao={{ atual: resumo.petsUnicos, anterior: resumoAnterior.petsUnicos }} />
            <Card icon={<IconScissors style={{ width: 20, height: 20 }} />} cor="info" label="Serviços concluídos" valor={String(resumo.qtdConcluidos)} />
            <Card icon={<IconMoney style={{ width: 20, height: 20 }} />} cor="warning" label="Faturamento associado" valor={moeda(resumo.faturamento)} comparacao={{ atual: resumo.faturamento, anterior: resumoAnterior.faturamento }} />
            <Card icon={<IconMoney style={{ width: 20, height: 20 }} />} cor="info" label="Ticket médio" valor={resumo.qtdConcluidos > 0 ? moeda(resumo.ticketMedio) : '—'} />
            <Card icon={<IconAlert style={{ width: 20, height: 20 }} />} cor="danger" label="Cancelamentos" valor={String(resumo.qtdCancelados)} />
            <Card icon={<IconClock style={{ width: 20, height: 20 }} />} cor="primary" label="Dias com atendimento" valor={String(resumo.diasTrabalhados)} />
            <Card icon={<IconUsers style={{ width: 20, height: 20 }} />} cor="success" label="Média por dia" valor={resumo.diasTrabalhados > 0 ? resumo.mediaPorDia.toFixed(1) : '—'} />
          </div>

          {/* ── Faturamento + Atendimentos ── */}
          <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
            <div className="card">
              <h3 className="relatorio-secao-titulo">
                <IconMoney style={{ width: 15, height: 15 }} /> Faturamento
              </h3>
              <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                Mesma regra do Relatório de Vendas: soma do valor dos atendimentos com status Concluído.
              </p>
              <div className="dash-detail-row"><span>Faturamento no período</span><span>{moeda(resumo.faturamento)}</span></div>
              <div className="dash-detail-row"><span>Atendimentos concluídos</span><span>{resumo.qtdConcluidos}</span></div>
              <div className="dash-detail-row"><span>Ticket médio</span><span>{resumo.qtdConcluidos > 0 ? moeda(resumo.ticketMedio) : '—'}</span></div>
              {porServico[0] && <div className="dash-detail-row"><span>Maior faturamento por serviço</span><span>{porServico[0].nome} ({moeda(porServico[0].valor)})</span></div>}
            </div>

            <div className="card">
              <h3 className="relatorio-secao-titulo">
                <IconCheck style={{ width: 15, height: 15 }} /> Atendimentos
              </h3>
              <div className="dash-detail-row"><span>Total no período</span><span>{agendamentos.length}</span></div>
              <div className="dash-detail-row"><span>Concluídos</span><span>{resumo.qtdConcluidos}</span></div>
              <div className="dash-detail-row"><span>Pendentes</span><span>{resumo.qtdPendente}</span></div>
              <div className="dash-detail-row"><span>Aceitos</span><span>{resumo.qtdConfirmado}</span></div>
              <div className="dash-detail-row"><span>Em andamento</span><span>{resumo.qtdEmAndamento}</span></div>
              <div className="dash-detail-row"><span>Cancelados</span><span>{resumo.qtdCancelados}</span></div>
              <div className="dash-detail-row"><span>Taxa de conclusão</span><span>{pct(resumo.taxaConclusao)}</span></div>
              <div className="dash-detail-row"><span>Taxa de cancelamento</span><span>{pct(resumo.taxaCancelamento)}</span></div>
              <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                Taxas calculadas sobre o total de agendamentos do período (concluídos ou cancelados ÷ total).
              </p>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
            {/* ── Pets atendidos ── */}
            <div className="card">
              <h3 className="relatorio-secao-titulo">
                <IconDog style={{ width: 15, height: 15 }} /> Pets atendidos
              </h3>
              <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                {resumo.qtdAtendimentos} atendimento{resumo.qtdAtendimentos !== 1 ? 's' : ''} em {resumo.petsUnicos} pet{resumo.petsUnicos !== 1 ? 's' : ''} diferente{resumo.petsUnicos !== 1 ? 's' : ''}.
              </p>
              {porPet.length === 0 ? (
                <p className="text-sm text-muted">Nenhum atendimento no período.</p>
              ) : (
                <div className="relatorio-lista">
                  {porPet.map(p => (
                    <Link key={p.id_pet} href={`/lojista/pets/${p.id_pet}`} className="relatorio-lista-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div className="relatorio-lista-info">
                        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</div>
                      </div>
                      <div className="text-sm text-muted">{p.qtd} atendimento{p.qtd !== 1 ? 's' : ''}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* ── Clientes atendidos ── */}
            <div className="card">
              <h3 className="relatorio-secao-titulo">
                <IconUsers style={{ width: 15, height: 15 }} /> Clientes atendidos
              </h3>
              <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-3)' }}>
                {resumo.clientesUnicos} cliente{resumo.clientesUnicos !== 1 ? 's' : ''} diferente{resumo.clientesUnicos !== 1 ? 's' : ''}, sendo {resumo.clientesRecorrentes} recorrente{resumo.clientesRecorrentes !== 1 ? 's' : ''} (mais de 1 atendimento com este profissional no período).
              </p>
              {porCliente.length === 0 ? (
                <p className="text-sm text-muted">Nenhum atendimento no período.</p>
              ) : (
                <div className="relatorio-lista">
                  {porCliente.map(c => (
                    <div key={c.id_cliente} className="relatorio-lista-item">
                      <div className="relatorio-lista-info">
                        <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{c.nome}</div>
                      </div>
                      <div className="text-sm text-muted">{c.qtd} atendimento{c.qtd !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Serviços realizados ── */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 className="relatorio-secao-titulo">
              <IconScissors style={{ width: 15, height: 15 }} /> Serviços realizados
            </h3>
            <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-3)' }}>
              Só atendimentos concluídos (mesma regra do faturamento) — ordenado por quantidade de atendimentos.
              {porServico[0] && ` Mais realizado: ${porServico[0].nome}.`}
            </p>
            {porServico.length === 0 ? (
              <p className="text-sm text-muted">Nenhum atendimento concluído no período.</p>
            ) : (
              <div className="relatorio-lista">
                {porServico.map(s => (
                  <div key={s.id_servico} className="relatorio-lista-item">
                    <div className="relatorio-lista-info">
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                      <div className="text-xs text-muted">{s.qtd} atendimento{s.qtd !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="font-semibold text-success">{moeda(s.valor)}</div>
                      <div className="text-xs text-muted">{((s.valor / resumo.faturamento) * 100 || 0).toFixed(1)}% do faturamento</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
            {/* ── Dias de maior movimento ── */}
            <div className="card">
              <h3 className="relatorio-secao-titulo">Dias de maior movimento</h3>
              {porDiaSemana.length === 0 ? (
                <p className="text-sm text-muted">Sem dados suficientes.</p>
              ) : (
                <div className="relatorio-lista">
                  {porDiaSemana.map(d => (
                    <div key={d.dia} className="relatorio-lista-item">
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{d.dia}</div>
                      <div className="text-sm text-muted">{d.qtd} atendimento{d.qtd !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Horários de maior movimento ── */}
            <div className="card">
              <h3 className="relatorio-secao-titulo">Horários de maior movimento</h3>
              {porHorario.length === 0 ? (
                <p className="text-sm text-muted">Sem dados suficientes.</p>
              ) : (
                <div className="relatorio-lista">
                  {porHorario.map(h => (
                    <div key={h.label} className="relatorio-lista-item">
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{h.label}</div>
                      <div className="text-sm text-muted">{h.qtd} atendimento{h.qtd !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Evolução ── */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 className="relatorio-secao-titulo">Evolução no período</h3>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Data</th><th>Atendimentos</th><th>Faturamento</th></tr>
                </thead>
                <tbody>
                  {evolucao.map(e => (
                    <tr key={e.ordem}>
                      <td>{e.label}</td>
                      <td>{e.atendimentos}</td>
                      <td>{moeda(e.faturamento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Dados do funcionário ── */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h3 className="relatorio-secao-titulo">
              <IconUserBadge style={{ width: 15, height: 15 }} /> Dados do funcionário
            </h3>
            <div className="grid-2">
              <div>
                <div className="dash-detail-row"><span>Nome</span><span>{funcionario.nome}</span></div>
                <div className="dash-detail-row"><span>E-mail</span><span>{funcionario.email}</span></div>
                <div className="dash-detail-row"><span>Telefone</span><span>{formatarTelefone(funcionario.telefone)}</span></div>
                <div className="dash-detail-row"><span>Cargo</span><span>{funcionario.cargo ?? '—'}</span></div>
              </div>
              <div>
                <div className="dash-detail-row"><span>Status</span><span><span className={`badge ${funcionario.ativo ? 'badge-ativo' : 'badge-cancelado'}`}>{funcionario.ativo ? 'Ativo' : 'Inativo'}</span></span></div>
                <div className="dash-detail-row"><span>TaxiDog</span><span>{funcionario.pode_taxidog ? 'Sim — recebe corridas' : 'Não'}</span></div>
                {funcionario.acesso_total ? (
                  <div className="dash-detail-row"><span>Acesso</span><span>Administrador (acesso total)</span></div>
                ) : (
                  <>
                    <div className="dash-detail-row"><span>Gerencia agenda</span><span>{funcionario.pode_gerenciar_agenda ? 'Sim' : 'Não'}</span></div>
                    <div className="dash-detail-row"><span>Gerencia serviços</span><span>{funcionario.pode_gerenciar_servicos ? 'Sim' : 'Não'}</span></div>
                    <div className="dash-detail-row"><span>Gerencia produtos</span><span>{funcionario.pode_gerenciar_produtos ? 'Sim' : 'Não'}</span></div>
                    <div className="dash-detail-row"><span>Gerencia clientes e pets</span><span>{funcionario.pode_gerenciar_clientes_pets ? 'Sim' : 'Não'}</span></div>
                  </>
                )}
                <div className="dash-detail-row"><span>Cadastro</span><span>{format(parseISO(funcionario.created_at), 'dd/MM/yyyy')}</span></div>
              </div>
            </div>
          </div>

          {/* ── Histórico ── */}
          <div className="card">
            <h3 className="relatorio-secao-titulo">Histórico de atendimentos</h3>
            <div className="relatorio-tabela-filtros">
              <select className="form-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                <option value="">Todos os status</option>
                <option value="Pendente">Pendente</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Concluído">Concluído</option>
                <option value="Cancelado">Cancelado</option>
              </select>
              <select className="form-select" value={filtroServico} onChange={e => setFiltroServico(e.target.value)}>
                <option value="">Todos os serviços</option>
                {servicosDisponiveis.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
            </div>

            {historico.length === 0 ? (
              <p className="text-sm text-muted">Nenhum registro com esses filtros.</p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th><th>Horário</th><th>Pet</th><th>Tutor</th><th>Serviço</th><th>Valor</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map(a => (
                      <tr key={a.id_agendamento}>
                        <td>{format(parseDia(a.dt_agendamento), 'dd/MM/yyyy')}</td>
                        <td>{a.hr_agendamento.slice(0, 5)}</td>
                        <td>{a.nome_pet}</td>
                        <td>{a.nome_cliente}</td>
                        <td>{a.nome_servico}</td>
                        <td>{moeda(a.valor)}</td>
                        <td><span className={`badge ${classeBadgeStatus(a.status)}`}>{rotuloStatus(a.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Card de indicador com comparação opcional vs período anterior
// ============================================================
function Card({
  icon, cor, label, valor, comparacao,
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
        <div className={`stat-card-icon tone-${cor}`}>{icon}</div>
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
  const v = variacaoPercentual(atual, anterior)
  if (v === null || Math.abs(v) < 0.05) return <span className="badge badge-inativo">= período anterior</span>
  const positivo = v > 0
  return (
    <span className={`badge ${positivo ? 'badge-ativo' : 'badge-cancelado'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {positivo ? <IconTrendUp style={{ width: 11, height: 11 }} /> : <IconTrendDown style={{ width: 11, height: 11 }} />}
      {positivo ? '+' : ''}{v.toFixed(1)}%
    </span>
  )
}

// ============================================================
// Agregações — todas em cima do array já filtrado pelo período (ver
// comentário no topo do componente)
// ============================================================
function calcularResumo(ags: AgendamentoFuncionario[]) {
  const naoCancelados = ags.filter(a => a.status !== 'Cancelado')
  const concluidos = ags.filter(a => a.status === 'Concluído')
  const faturamento = concluidos.reduce((acc, a) => acc + a.valor, 0)
  const qtdConcluidos = concluidos.length
  const qtdCancelados = ags.filter(a => a.status === 'Cancelado').length
  const qtdPendente = ags.filter(a => a.status === 'Pendente').length
  const qtdConfirmado = ags.filter(a => a.status === 'Confirmado').length
  const qtdEmAndamento = ags.filter(a => a.status === 'Em andamento').length
  const diasTrabalhados = new Set(naoCancelados.map(a => a.dt_agendamento)).size
  const petsUnicos = new Set(naoCancelados.map(a => a.id_pet)).size
  const clientesPorId = new Map<string, number>()
  for (const a of naoCancelados) clientesPorId.set(a.id_cliente, (clientesPorId.get(a.id_cliente) ?? 0) + 1)

  return {
    qtdAtendimentos: naoCancelados.length,
    qtdConcluidos,
    qtdCancelados,
    qtdPendente,
    qtdConfirmado,
    qtdEmAndamento,
    faturamento,
    ticketMedio: qtdConcluidos > 0 ? faturamento / qtdConcluidos : 0,
    // Denominador = todos os agendamentos do período (concluídos + pendentes +
    // confirmados + cancelados) — mede, de tudo que foi agendado pra este
    // profissional, que fração terminou concluída/cancelada.
    taxaConclusao: ags.length > 0 ? qtdConcluidos / ags.length : 0,
    taxaCancelamento: ags.length > 0 ? qtdCancelados / ags.length : 0,
    diasTrabalhados,
    mediaPorDia: diasTrabalhados > 0 ? naoCancelados.length / diasTrabalhados : 0,
    petsUnicos,
    clientesUnicos: clientesPorId.size,
    clientesRecorrentes: Array.from(clientesPorId.values()).filter(q => q > 1).length,
  }
}

function calcularPorServico(ags: AgendamentoFuncionario[]) {
  const mapa = new Map<string, { nome: string; qtd: number; valor: number }>()
  for (const a of ags) {
    if (a.status !== 'Concluído') continue
    const atual = mapa.get(a.id_servico) ?? { nome: a.nome_servico, qtd: 0, valor: 0 }
    atual.qtd += 1
    atual.valor += a.valor
    mapa.set(a.id_servico, atual)
  }
  return Array.from(mapa.entries())
    .map(([id_servico, v]) => ({ id_servico, ...v }))
    .sort((a, b) => b.qtd - a.qtd)
}

function calcularPorPet(ags: AgendamentoFuncionario[]) {
  const mapa = new Map<string, { nome: string; qtd: number }>()
  for (const a of ags) {
    if (a.status === 'Cancelado') continue
    const atual = mapa.get(a.id_pet) ?? { nome: a.nome_pet, qtd: 0 }
    atual.qtd += 1
    mapa.set(a.id_pet, atual)
  }
  return Array.from(mapa.entries())
    .map(([id_pet, v]) => ({ id_pet, ...v }))
    .sort((a, b) => b.qtd - a.qtd)
}

function calcularPorCliente(ags: AgendamentoFuncionario[]) {
  const mapa = new Map<string, { nome: string; qtd: number }>()
  for (const a of ags) {
    if (a.status === 'Cancelado') continue
    const atual = mapa.get(a.id_cliente) ?? { nome: a.nome_cliente, qtd: 0 }
    atual.qtd += 1
    mapa.set(a.id_cliente, atual)
  }
  return Array.from(mapa.entries())
    .map(([id_cliente, v]) => ({ id_cliente, ...v }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 10)
}

function calcularDiasSemana(ags: AgendamentoFuncionario[]) {
  const mapa = new Map<number, number>()
  for (const a of ags) {
    if (a.status === 'Cancelado') continue
    const dow = parseDia(a.dt_agendamento).getDay()
    mapa.set(dow, (mapa.get(dow) ?? 0) + 1)
  }
  return Array.from(mapa.entries())
    .map(([dow, qtd]) => ({ dia: DIAS_SEMANA[dow], qtd }))
    .sort((a, b) => b.qtd - a.qtd)
}

function calcularHorarios(ags: AgendamentoFuncionario[]) {
  const mapa = new Map<number, number>()
  for (const a of ags) {
    if (a.status === 'Cancelado') continue
    const hora = Number(a.hr_agendamento.slice(0, 2))
    const bucket = Math.floor(hora / 2) * 2
    mapa.set(bucket, (mapa.get(bucket) ?? 0) + 1)
  }
  return Array.from(mapa.entries())
    .map(([h, qtd]) => ({ label: `${String(h).padStart(2, '0')}:00–${String(h + 2).padStart(2, '0')}:00`, qtd }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function calcularEvolucao(ags: AgendamentoFuncionario[], periodo: Periodo) {
  const diasNoPeriodo = differenceInCalendarDays(parseDia(periodo.fim), parseDia(periodo.ini)) + 1
  const granularidade: 'dia' | 'semana' | 'mes' = diasNoPeriodo <= 31 ? 'dia' : diasNoPeriodo <= 120 ? 'semana' : 'mes'

  function chave(dt: string) {
    const d = parseDia(dt)
    if (granularidade === 'dia') return { key: dt, label: format(d, 'dd/MM') }
    if (granularidade === 'semana') {
      const inicio = startOfWeek(d, { weekStartsOn: 0 })
      const key = format(inicio, 'yyyy-MM-dd')
      return { key, label: `Semana de ${format(inicio, 'dd/MM')}` }
    }
    return { key: format(d, 'yyyy-MM'), label: format(d, 'MMM/yy', { locale: ptBR }) }
  }

  const mapa = new Map<string, { label: string; atendimentos: number; faturamento: number }>()

  // Só preenche todo dia com zero na granularidade "dia" — em "semana"/"mes"
  // mostra só os períodos que realmente tiveram atendimento.
  if (granularidade === 'dia') {
    let cursor = parseDia(periodo.ini)
    const fim = parseDia(periodo.fim)
    while (cursor <= fim) {
      const iso = format(cursor, 'yyyy-MM-dd')
      mapa.set(iso, { label: format(cursor, 'dd/MM'), atendimentos: 0, faturamento: 0 })
      cursor = addDays(cursor, 1)
    }
  }

  for (const a of ags) {
    if (a.status === 'Cancelado') continue
    const { key, label } = chave(a.dt_agendamento)
    const atual = mapa.get(key) ?? { label, atendimentos: 0, faturamento: 0 }
    atual.atendimentos += 1
    if (a.status === 'Concluído') atual.faturamento += a.valor
    mapa.set(key, atual)
  }

  return Array.from(mapa.entries())
    .map(([ordem, v]) => ({ ordem, ...v }))
    .sort((a, b) => a.ordem.localeCompare(b.ordem))
}
