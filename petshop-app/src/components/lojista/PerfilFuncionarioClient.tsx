'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, differenceInCalendarDays, startOfWeek, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toggleFuncionarioAction } from '@/lib/actions'
import { PRESETS, type PeriodoPreset, type Periodo } from '@/lib/relatorios'
import { hojeBrasilISO } from '@/lib/agenda'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import CodigoAcessoFuncionarioModal from '@/components/lojista/CodigoAcessoFuncionarioModal'
import FiltroPeriodo from '@/components/lojista/FiltroPeriodo'
import { GradeIndicadores, Indicador, compararComAnterior } from '@/components/relatorio/Indicador'
import { DuasColunas, NotaDaSecao, Pilha, Secao, SecaoVazia } from '@/components/relatorio/Secao'
import { Ranking } from '@/components/relatorio/Ranking'
import { formatarReais } from '@/lib/taxidog'
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconClock,
  IconDog,
  IconInbox,
  IconLock,
  IconMoney,
  IconPencil,
  IconScissors,
  IconUserBadge,
  IconUsers,
} from '@/components/icons'

export interface FuncionarioInfo {
  id_funcionario: string
  nome: string
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
  // Quem está vendo pode gerar o código de acesso rápido deste funcionário?
  // O titular, sempre; um administrador, só de funcionário comum (migration 079).
  podeGerarCodigo?: boolean
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const moeda = formatarReais

function pct(v: number) {
  return `${(v * 100).toFixed(1).replace('.', ',')}%`
}

// O gráfico (Recharts) só é baixado por quem abre esta tela, e só no
// navegador — a biblioteca é pesada pra entrar no pacote das outras.
const GraficoEvolucao = dynamic(() => import('@/components/relatorio/GraficoEvolucao'), {
  ssr: false,
  loading: () => <div style={{ height: '16rem' }} aria-hidden />,
})

// Mesmo truque usado em Kanban/Agenda: meio-dia fixo pra parseISO não
// escorregar de dia por causa de fuso — dt_agendamento é só 'yyyy-MM-dd'.
function parseDia(iso: string) {
  return parseISO(`${iso}T12:00:00`)
}

export default function PerfilFuncionarioClient({ funcionario, preset, periodo, agendamentos, agendamentosAnterior, podeGerarCodigo = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPendingToggle, startToggleTransition] = useTransition()
  const [toggleErro, setToggleErro] = useState<string | null>(null)
  const [codigoAberto, setCodigoAberto] = useState(false)

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
            {funcionario.cargo ?? 'Sem cargo definido'}
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
          {podeGerarCodigo && funcionario.ativo && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCodigoAberto(true)}>
              <IconLock style={{ width: 14, height: 14 }} /> Código de acesso
            </button>
          )}
          <button
            className={`btn btn-sm ${funcionario.ativo ? 'btn-danger' : 'btn-secondary'}`}
            onClick={handleToggle}
            disabled={isPendingToggle}
          >
            {isPendingToggle ? 'Salvando...' : funcionario.ativo ? 'Desativar' : 'Reativar'}
          </button>
          <Link href={`/lojista/equipe?editar=${funcionario.id_funcionario}`} className="btn btn-primary btn-sm">
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

      {codigoAberto && (
        <CodigoAcessoFuncionarioModal
          idFuncionario={funcionario.id_funcionario}
          nome={funcionario.nome}
          onClose={() => setCodigoAberto(false)}
        />
      )}

      {/* ── Filtro de período ── */}
      <div className="relatorio-filtros card">
        <FiltroPeriodo
          opcoes={PRESETS}
          valor={preset}
          onMudar={novo => navegar({ periodo: novo, ini: undefined, fim: undefined })}
          ini={periodo.ini}
          fim={periodo.fim}
          onPersonalizado={(ini, fim) => navegar({ periodo: 'personalizado', ini, fim })}
          dataMax={hojeBrasilISO()}
        />
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
        <Pilha>
          {/* ── Resumo ── */}
          <GradeIndicadores colunas={4}>
            <Indicador rotulo="Atendimentos realizados" valor={resumo.qtdAtendimentos} icone={<IconCalendar />} variacao={compararComAnterior(resumo.qtdAtendimentos, resumoAnterior.qtdAtendimentos)} />
            <Indicador rotulo="Pets atendidos" valor={resumo.petsUnicos} icone={<IconDog />} variacao={compararComAnterior(resumo.petsUnicos, resumoAnterior.petsUnicos)} detalhe="pets diferentes" />
            <Indicador rotulo="Serviços concluídos" valor={resumo.qtdConcluidos} icone={<IconScissors />} />
            <Indicador rotulo="Faturamento associado" valor={moeda(resumo.faturamento)} icone={<IconMoney />} variacao={compararComAnterior(resumo.faturamento, resumoAnterior.faturamento)} />
            <Indicador rotulo="Ticket médio" valor={resumo.qtdConcluidos > 0 ? moeda(resumo.ticketMedio) : '—'} icone={<IconMoney />} detalhe="por atendimento concluído" />
            <Indicador rotulo="Cancelamentos" valor={resumo.qtdCancelados} icone={<IconAlert />} />
            <Indicador rotulo="Dias com atendimento" valor={resumo.diasTrabalhados} icone={<IconClock />} />
            <Indicador rotulo="Média por dia" valor={resumo.diasTrabalhados > 0 ? resumo.mediaPorDia.toFixed(1).replace('.', ',') : '—'} icone={<IconUsers />} detalhe="atendimentos por dia trabalhado" />
          </GradeIndicadores>

          {/* ── Faturamento + Atendimentos ── */}
          <DuasColunas>
            <Secao titulo="Faturamento" icone={<IconMoney />} descricao="Mesma regra do Relatório de Vendas: soma do valor dos atendimentos concluídos">
              <div>
                <div className="dash-detail-row"><span>Faturamento no período</span><span>{moeda(resumo.faturamento)}</span></div>
                <div className="dash-detail-row"><span>Atendimentos concluídos</span><span>{resumo.qtdConcluidos}</span></div>
                <div className="dash-detail-row"><span>Ticket médio</span><span>{resumo.qtdConcluidos > 0 ? moeda(resumo.ticketMedio) : '—'}</span></div>
                {porServico[0] && <div className="dash-detail-row"><span>Maior faturamento por serviço</span><span>{porServico[0].nome} ({moeda(porServico[0].valor)})</span></div>}
              </div>
            </Secao>

            <Secao titulo="Atendimentos" icone={<IconCheck />} descricao="Como terminaram os agendamentos do período">
              <div>
                <div className="dash-detail-row"><span>Total no período</span><span>{agendamentos.length}</span></div>
                <div className="dash-detail-row"><span>Concluídos</span><span>{resumo.qtdConcluidos}</span></div>
                <div className="dash-detail-row"><span>Pendentes</span><span>{resumo.qtdPendente}</span></div>
                <div className="dash-detail-row"><span>Aceitos</span><span>{resumo.qtdConfirmado}</span></div>
                <div className="dash-detail-row"><span>Em andamento</span><span>{resumo.qtdEmAndamento}</span></div>
                <div className="dash-detail-row"><span>Cancelados</span><span>{resumo.qtdCancelados}</span></div>
                <div className="dash-detail-row"><span>Taxa de conclusão</span><span>{pct(resumo.taxaConclusao)}</span></div>
                <div className="dash-detail-row"><span>Taxa de cancelamento</span><span>{pct(resumo.taxaCancelamento)}</span></div>
              </div>
              <NotaDaSecao>Taxas calculadas sobre o total de agendamentos do período (concluídos ou cancelados ÷ total).</NotaDaSecao>
            </Secao>
          </DuasColunas>

          <DuasColunas>
            {/* ── Pets atendidos ── */}
            <Secao
              titulo="Pets atendidos"
              icone={<IconDog />}
              descricao={`${resumo.qtdAtendimentos} atendimento${resumo.qtdAtendimentos !== 1 ? 's' : ''} em ${resumo.petsUnicos} pet${resumo.petsUnicos !== 1 ? 's' : ''} diferente${resumo.petsUnicos !== 1 ? 's' : ''}`}
            >
              {porPet.length === 0 ? (
                <SecaoVazia>Nenhum atendimento no período.</SecaoVazia>
              ) : (
                <Ranking
                  itens={porPet.map(p => ({
                    chave: p.id_pet,
                    titulo: p.nome,
                    href: `/lojista/pets/${p.id_pet}`,
                    valor: `${p.qtd} atendimento${p.qtd !== 1 ? 's' : ''}`,
                    parte: p.qtd / Math.max(1, porPet[0].qtd),
                  }))}
                />
              )}
            </Secao>

            {/* ── Clientes atendidos ── */}
            <Secao
              titulo="Clientes atendidos"
              icone={<IconUsers />}
              descricao={`${resumo.clientesUnicos} cliente${resumo.clientesUnicos !== 1 ? 's' : ''} diferente${resumo.clientesUnicos !== 1 ? 's' : ''}, sendo ${resumo.clientesRecorrentes} recorrente${resumo.clientesRecorrentes !== 1 ? 's' : ''} (mais de 1 atendimento com este profissional no período)`}
            >
              {porCliente.length === 0 ? (
                <SecaoVazia>Nenhum atendimento no período.</SecaoVazia>
              ) : (
                <Ranking
                  comIniciais
                  itens={porCliente.map(c => ({
                    chave: c.id_cliente,
                    titulo: c.nome,
                    valor: `${c.qtd} atendimento${c.qtd !== 1 ? 's' : ''}`,
                    parte: c.qtd / Math.max(1, porCliente[0].qtd),
                  }))}
                />
              )}
            </Secao>
          </DuasColunas>

          {/* ── Serviços realizados ── */}
          <Secao
            titulo="Serviços realizados"
            icone={<IconScissors />}
            descricao={`Só atendimentos concluídos (mesma regra do faturamento), com a parte de cada um no faturamento.${porServico[0] ? ` Mais realizado: ${porServico[0].nome}.` : ''}`}
          >
            {porServico.length === 0 ? (
              <SecaoVazia>Nenhum atendimento concluído no período.</SecaoVazia>
            ) : (
              <Ranking
                itens={porServico.map(s => ({
                  chave: s.id_servico,
                  titulo: s.nome,
                  valor: moeda(s.valor),
                  detalhe: `${s.qtd} atendimento${s.qtd !== 1 ? 's' : ''}`,
                  ...(resumo.faturamento > 0
                    ? { parte: s.valor / resumo.faturamento, rotuloDaParte: pct(s.valor / resumo.faturamento) }
                    : {}),
                }))}
              />
            )}
          </Secao>

          <DuasColunas>
            {/* ── Dias de maior movimento ── */}
            <Secao titulo="Dias de maior movimento" icone={<IconCalendar />}>
              {porDiaSemana.length === 0 ? (
                <SecaoVazia>Sem dados suficientes.</SecaoVazia>
              ) : (
                <Ranking
                  itens={porDiaSemana.map(d => ({
                    chave: d.dia,
                    titulo: d.dia,
                    valor: `${d.qtd} atendimento${d.qtd !== 1 ? 's' : ''}`,
                    parte: d.qtd / Math.max(1, ...porDiaSemana.map(x => x.qtd)),
                  }))}
                />
              )}
            </Secao>

            {/* ── Horários de maior movimento ── */}
            <Secao titulo="Horários de maior movimento" icone={<IconClock />}>
              {porHorario.length === 0 ? (
                <SecaoVazia>Sem dados suficientes.</SecaoVazia>
              ) : (
                <Ranking
                  itens={porHorario.map(h => ({
                    chave: h.label,
                    titulo: h.label,
                    valor: `${h.qtd} atendimento${h.qtd !== 1 ? 's' : ''}`,
                    parte: h.qtd / Math.max(1, ...porHorario.map(x => x.qtd)),
                  }))}
                />
              )}
            </Secao>
          </DuasColunas>

          {/* ── Evolução ── */}
          <Secao titulo="Evolução no período" descricao="Faturamento dos atendimentos concluídos, ao longo do período">
            <GraficoEvolucao
              rotuloDasVendas="Atendimentos"
              pontos={evolucao.map(e => ({ rotulo: e.label, faturamento: e.faturamento, vendas: e.atendimentos }))}
            />
            <details>
              <summary className="text-sm text-muted" style={{ cursor: 'pointer' }}>Ver os números em tabela</summary>
              <div className="table-container" style={{ marginTop: 'var(--space-3)' }}>
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
            </details>
          </Secao>

          {/* ── Dados do funcionário ── */}
          <Secao titulo="Dados do funcionário" icone={<IconUserBadge />}>
            <div className="grid-2">
              <div>
                <div className="dash-detail-row"><span>Nome</span><span>{funcionario.nome}</span></div>
                <div className="dash-detail-row"><span>Acesso</span><span>Código de acesso rápido</span></div>
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
          </Secao>

          {/* ── Histórico ── */}
          <Secao titulo="Histórico de atendimentos" descricao="Todos os agendamentos deste profissional no período">
            <div className="relatorio-tabela-filtros" style={{ marginBottom: 0 }}>
              <select className="form-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                <option value="">Todos os status</option>
                {(['Pendente', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado'] as const).map(s => (
                  <option key={s} value={s}>{rotuloStatus(s)}</option>
                ))}
              </select>
              <select className="form-select" value={filtroServico} onChange={e => setFiltroServico(e.target.value)}>
                <option value="">Todos os serviços</option>
                {servicosDisponiveis.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
            </div>

            {historico.length === 0 ? (
              <SecaoVazia>Nenhum registro com esses filtros.</SecaoVazia>
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
                        <td style={{ whiteSpace: 'nowrap' }}>{moeda(a.valor)}</td>
                        <td><span className={`badge ${classeBadgeStatus(a.status)}`}>{rotuloStatus(a.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        </Pilha>
      )}
    </div>
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
