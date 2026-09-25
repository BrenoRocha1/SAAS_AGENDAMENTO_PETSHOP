'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { atualizarStatusAgendamentoAction, cancelarAgendamentoAction } from '@/lib/actions'
import { classeBadgeStatus, corSolidaStatus, PROXIMA_ETAPA, podeAvancarEtapa, rotuloStatus } from '@/lib/status-agendamento'
import BotaoCancelarAgendamento from '@/components/lojista/BotaoCancelarAgendamento'
import ResumoPlanosCard from '@/components/lojista/planos/ResumoPlanosCard'
import type { ResumoPlanos } from '@/lib/planos'
import {
  format,
  parseISO,
  addDays,
  subDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  IconCalendar,
  IconClock,
  IconUsers,
  IconMoney,
  IconSearch,
  IconBell,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconAlert,
  IconInbox,
  IconStore,
} from '@/components/icons'
import NovoAgendamentoModal from './NovoAgendamentoModal'
import BotaoCopiarLinkAgendamento from './BotaoCopiarLinkAgendamento'

// ============================================================
// Tipos — refletem o retorno das RPCs/queries existentes
// (fn_agenda_dia, tabela agendamento com joins, tabela cliente/pet/servico)
// ============================================================
export interface AgendaItem {
  id_agendamento: string
  hr_agendamento: string
  nome_cliente: string
  nome_pet: string
  nome_servico: string
  duracao: number
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  valor: number
}

export interface PendenteItem {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  valor: number
  pet: { nome: string; raca: string } | null
  servico: { nome: string } | null
  cliente: { nome: string } | null
}

export interface ClienteComPets {
  id_cliente: string
  nome: string
  telefone: string
  pets: { id_pet: string; nome: string; raca: string }[]
}

export interface ServicoAtivo {
  id_servico: string
  nome: string
  preco: number
  duracao: number
}

interface Stats {
  agendamentosHoje: number
  faturamentoHoje: number
  petsEmAtendimento: string[]
  horariosLivresHoje: number
  proximoHorarioLivre: string | null
  pendentesTotal: number
}

interface Props {
  nomeLoja: string
  lojistaId: string
  slugLoja: string | null
  hojeISO: string
  selectedDate: string
  stats: Stats
  agendaSelecionada: AgendaItem[]
  pendentes: PendenteItem[]
  clientesComPets: ClienteComPets[]
  servicos: ServicoAtivo[]
  funcionarios: { id_funcionario: string; nome: string }[]
  // Planos recorrentes (migration 060) — null sem a migration.
  resumoPlanos: ResumoPlanos | null
}

type Selecionado =
  | { tipo: 'agenda'; item: AgendaItem }
  | { tipo: 'pendente'; item: PendenteItem }
  | null

function parseDia(iso: string) {
  return parseISO(`${iso}T12:00:00`)
}

function normaliza(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export default function DashboardClient({
  nomeLoja,
  lojistaId,
  slugLoja,
  hojeISO,
  selectedDate,
  stats,
  agendaSelecionada,
  pendentes: pendentesIniciais,
  clientesComPets,
  servicos,
  funcionarios,
  resumoPlanos,
}: Props) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()

  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [selecionado, setSelecionado] = useState<Selecionado>(null)
  const [agenda, setAgenda] = useState(agendaSelecionada)
  const [pendentes, setPendentes] = useState(pendentesIniciais)
  const [viewMode, setViewMode] = useState<'dia' | 'semana' | 'mes'>('dia')
  const [acaoErro, setAcaoErro] = useState<string | null>(null)

  // Re-sincroniza quando a navegação de dia troca as props vindas do servidor.
  // Ajuste de estado durante a renderização (em vez de useEffect) — evita o
  // re-render extra de espelhar uma prop em state dentro de um efeito.
  const [agendaAnterior, setAgendaAnterior] = useState(agendaSelecionada)
  if (agendaSelecionada !== agendaAnterior) {
    setAgendaAnterior(agendaSelecionada)
    setAgenda(agendaSelecionada)
    setSelecionado(null)
  }

  const [pendentesAnterior, setPendentesAnterior] = useState(pendentesIniciais)
  if (pendentesIniciais !== pendentesAnterior) {
    setPendentesAnterior(pendentesIniciais)
    setPendentes(pendentesIniciais)
  }

  const selectedDateObj = parseDia(selectedDate)
  const isSelectedToday = selectedDate === hojeISO

  // ── filtro de busca (cliente / pet / serviço) ─────────────────────
  const termo = normaliza(busca.trim())
  const agendaFiltrada = termo
    ? agenda.filter(a =>
        normaliza(a.nome_cliente).includes(termo) ||
        normaliza(a.nome_pet).includes(termo) ||
        normaliza(a.nome_servico).includes(termo)
      )
    : agenda

  const pendentesFiltrados = termo
    ? pendentes.filter(p =>
        normaliza(p.cliente?.nome ?? '').includes(termo) ||
        normaliza(p.pet?.nome ?? '').includes(termo) ||
        normaliza(p.servico?.nome ?? '').includes(termo)
      )
    : pendentes

  // ── semana / mês: agregado carregado sob demanda no cliente ──────
  const [aggDias, setAggDias] = useState<{ date: string; count: number; total: number }[]>([])
  const [aggLoadedKey, setAggLoadedKey] = useState<string | null>(null)
  const [aggBase, setAggBase] = useState(selectedDate)

  // aggBase acompanha selectedDate por padrão (ajuste durante a renderização)
  const [selectedDateAnteriorAgg, setSelectedDateAnteriorAgg] = useState(selectedDate)
  if (selectedDate !== selectedDateAnteriorAgg) {
    setSelectedDateAnteriorAgg(selectedDate)
    setAggBase(selectedDate)
  }

  const aggKey = `${viewMode}|${aggBase}`
  const aggLoading = viewMode !== 'dia' && aggLoadedKey !== aggKey

  useEffect(() => {
    if (viewMode === 'dia') return
    let cancelado = false
    const base = parseDia(aggBase)
    const start = viewMode === 'semana' ? startOfWeek(base, { weekStartsOn: 1 }) : startOfMonth(base)
    const end = viewMode === 'semana' ? addDays(start, 6) : endOfMonth(base)
    const key = `${viewMode}|${aggBase}`

    supabase
      .from('agendamento')
      .select('dt_agendamento, valor, status')
      .eq('id_lojista', lojistaId)
      .gte('dt_agendamento', format(start, 'yyyy-MM-dd'))
      .lte('dt_agendamento', format(end, 'yyyy-MM-dd'))
      .neq('status', 'Cancelado')
      .then(({ data }) => {
        if (cancelado) return
        const rows = (data ?? []) as { dt_agendamento: string; valor: number }[]
        const dias = eachDayOfInterval({ start, end }).map(d => {
          const iso = format(d, 'yyyy-MM-dd')
          const doDia = rows.filter(r => r.dt_agendamento === iso)
          return { date: iso, count: doDia.length, total: doDia.reduce((acc, r) => acc + Number(r.valor), 0) }
        })
        setAggDias(dias)
        setAggLoadedKey(key)
      })

    return () => { cancelado = true }
    // agendaSelecionada: muda a cada router.refresh() (AtualizacaoAoVivo,
    // agendamento novo) — assim a visão semana/mês também se atualiza.
  }, [viewMode, aggBase, lojistaId, agendaSelecionada]) // eslint-disable-line react-hooks/exhaustive-deps

  function irParaDia(iso: string) {
    setViewMode('dia')
    router.push(`/lojista/dashboard?data=${iso}`)
  }

  // ── ações da agenda (aceitar / iniciar / finalizar / cancelar) ────
  function mudarStatus(id: string, novoStatus: 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado') {
    setAcaoErro(null)
    startTransition(async () => {
      const result = novoStatus === 'Cancelado'
        ? await cancelarAgendamentoAction(id)
        : await atualizarStatusAgendamentoAction(id, novoStatus)

      if (result?.error) {
        setAcaoErro(result.error)
        return
      }

      setAgenda(prev => prev.map(a => a.id_agendamento === id ? { ...a, status: novoStatus } : a))
      setPendentes(prev => prev.filter(p => p.id_agendamento !== id))
      setSelecionado(sel => {
        if (!sel || sel.item.id_agendamento !== id) return sel
        // Item da agenda: atualiza o status in-place para refletir na hora.
        if (sel.tipo === 'agenda') {
          return { tipo: 'agenda', item: { ...sel.item, status: novoStatus } }
        }
        // Item vindo da fila de espera: ele acabou de sair da fila, então
        // não faz mais sentido manter o painel de detalhes apontando pra ele.
        return null
      })
      router.refresh()
    })
  }

  function handleCriado(item: {
    id_agendamento: string
    hr_agendamento: string
    nome_cliente: string
    nome_pet: string
    nome_servico: string
    duracao: number
    status: 'Confirmado'
    valor: number
  }, dataISO: string) {
    if (dataISO === selectedDate) {
      setAgenda(prev => [...prev, item].sort((a, b) => a.hr_agendamento.localeCompare(b.hr_agendamento)))
    }
    router.refresh()
  }

  const diasSemana = useMemo(() => {
    if (viewMode === 'dia') return []
    const base = parseDia(aggBase)
    const start = viewMode === 'semana' ? startOfWeek(base, { weekStartsOn: 1 }) : startOfMonth(base)
    const end = viewMode === 'semana' ? addDays(start, 6) : endOfMonth(base)
    return eachDayOfInterval({ start, end })
  }, [viewMode, aggBase])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Bem-vindo, {nomeLoja}</h1>
        <p className="page-subtitle">
          {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* Barra superior: busca, loja, notificações, novo agendamento */}
      <div className="dash-topbar">
        <div className="dash-search">
          <IconSearch />
          <input
            placeholder="Buscar cliente, pet ou agendamento..."
            value={busca}
            // A busca filtra a lista do dia — em Semana/Mês não haveria o que filtrar.
            onChange={e => { setBusca(e.target.value); if (e.target.value) setViewMode('dia') }}
          />
        </div>
        <div className="dash-topbar-right">
          <Link href="/lojista/perfil" className="dash-store-badge">
            <IconStore />
            {nomeLoja}
          </Link>
          <BotaoCopiarLinkAgendamento idLojista={lojistaId} slug={slugLoja} />
          <Link href="/lojista/agendamentos" className="dash-icon-btn" title="Agendamentos pendentes">
            <IconBell />
            {stats.pendentesTotal > 0 && (
              <span className="dash-badge-dot">{stats.pendentesTotal > 9 ? '9+' : stats.pendentesTotal}</span>
            )}
          </Link>
          <button className="btn btn-primary" onClick={() => setModalAberto(true)}>
            <IconPlus style={{ width: 16, height: 16 }} />
            Novo Agendamento
          </button>
        </div>
      </div>

      {acaoErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-6)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{acaoErro}</span>
        </div>
      )}

      {/* Cards de métricas — sempre referentes a hoje */}
      <div className="grid-4" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="stat-card-icon tone-primary">
              <IconCalendar style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="stat-card-value">{stats.agendamentosHoje}</div>
          <div className="stat-card-label">Agendamentos hoje</div>
        </div>

        <div className="stat-card animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="stat-card-icon tone-primary">
              <IconUsers style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="stat-card-value">{stats.petsEmAtendimento.length}</div>
          <div className="stat-card-label">Pets em atendimento</div>
          <div className="text-xs text-muted truncate">
            {stats.petsEmAtendimento.length > 0 ? stats.petsEmAtendimento.join(', ') : 'Nenhum agora'}
          </div>
        </div>

        <div className="stat-card animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="stat-card-icon tone-primary">
              <IconMoney style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="stat-card-value">R$ {stats.faturamentoHoje.toFixed(0)}</div>
          <div className="stat-card-label">Faturamento do dia</div>
        </div>

        <div className="stat-card animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="stat-card-icon tone-primary">
              <IconClock style={{ width: 20, height: 20 }} />
            </div>
          </div>
          <div className="stat-card-value">{stats.horariosLivresHoje}</div>
          <div className="stat-card-label">Horários livres hoje</div>
          <div className="text-xs text-muted">
            {stats.proximoHorarioLivre ? `Próx: ${stats.proximoHorarioLivre.slice(0, 5)}` : 'Sem vagas hoje'}
          </div>
        </div>
      </div>

      {/* Agenda + painel lateral */}
      {resumoPlanos?.tem_planos && <ResumoPlanosCard resumo={resumoPlanos} />}

      <div className="dash-grid">
        <div className="card">
          <div className="dash-schedule-header">
            <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
              {viewMode === 'dia' ? (
                <div className="dash-day-nav">
                  <button onClick={() => irParaDia(format(subDays(selectedDateObj, 1), 'yyyy-MM-dd'))} aria-label="Dia anterior">
                    <IconChevronLeft />
                  </button>
                  <span className="dash-day-label">
                    {format(selectedDateObj, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </span>
                  <button onClick={() => irParaDia(format(addDays(selectedDateObj, 1), 'yyyy-MM-dd'))} aria-label="Próximo dia">
                    <IconChevronRight />
                  </button>
                  {!isSelectedToday && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => irParaDia(hojeISO)}
                      style={{ marginLeft: 'var(--space-2)' }}
                    >
                      Hoje
                    </button>
                  )}
                </div>
              ) : (
                <div className="dash-day-nav">
                  <button
                    onClick={() => setAggBase(format(viewMode === 'semana' ? subDays(parseDia(aggBase), 7) : subDays(startOfMonth(parseDia(aggBase)), 1), 'yyyy-MM-dd'))}
                    aria-label="Anterior"
                  >
                    <IconChevronLeft />
                  </button>
                  <span className="dash-day-label">
                    {diasSemana[0] && diasSemana[diasSemana.length - 1]
                      ? `${format(diasSemana[0], 'dd/MM')} – ${format(diasSemana[diasSemana.length - 1], 'dd/MM')}`
                      : ''}
                  </span>
                  <button
                    onClick={() => setAggBase(format(viewMode === 'semana' ? addDays(parseDia(aggBase), 7) : addDays(endOfMonth(parseDia(aggBase)), 1), 'yyyy-MM-dd'))}
                    aria-label="Próximo"
                  >
                    <IconChevronRight />
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {(['dia', 'semana', 'mes'] as const).map(v => (
                <button
                  key={v}
                  className={`btn btn-sm ${viewMode === v ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setViewMode(v)}
                >
                  {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>

          {viewMode === 'dia' ? (
            agendaFiltrada.length === 0 ? (
              <div className="empty-state">
                <IconCalendar style={{ width: 40, height: 40, color: 'var(--gray-700)', margin: '0 auto var(--space-4)' }} />
                <div className="empty-state-title">
                  {busca ? 'Nenhum resultado para essa busca' : 'Sem agendamentos neste dia'}
                </div>
                <p>{busca ? 'Tente outro termo.' : 'Use "Novo Agendamento" para adicionar um horário.'}</p>
              </div>
            ) : (
              <div className="timeline">
                {agendaFiltrada.map(item => {
                  const itemSelecionado = selecionado?.tipo === 'agenda' && selecionado.item.id_agendamento === item.id_agendamento
                  return (
                  <div
                    key={item.id_agendamento}
                    className={`timeline-item ${itemSelecionado ? 'is-selected' : ''}`}
                    style={{ borderLeftColor: itemSelecionado ? 'var(--primary-500)' : corSolidaStatus(item.status) }}
                    onClick={() => setSelecionado({ tipo: 'agenda', item })}
                  >
                    <div className="timeline-time">{item.hr_agendamento.slice(0, 5)}</div>
                    <div className="timeline-body">
                      <div className="timeline-title">{item.nome_pet} · {item.nome_cliente}</div>
                      <div className="timeline-sub">{item.nome_servico} · {item.duracao} min</div>
                    </div>
                    <div className="timeline-meta">
                      <span className={`badge ${classeBadgeStatus(item.status)}`}>{rotuloStatus(item.status)}</span>
                      <span className="text-sm text-success font-semibold">R$ {Number(item.valor).toFixed(2)}</span>
                    </div>
                  </div>
                  )
                })}
              </div>
            )
          ) : aggLoading ? (
            <p className="text-sm text-muted">Carregando...</p>
          ) : (
            <div className="agg-grid">
              {diasSemana.map(d => {
                const iso = format(d, 'yyyy-MM-dd')
                const info = aggDias.find(a => a.date === iso)
                return (
                  <button
                    type="button"
                    key={iso}
                    className={`agg-day ${isToday(d) ? 'is-today' : ''}`}
                    onClick={() => irParaDia(iso)}
                  >
                    <div className="agg-day-label">{format(d, 'EEE', { locale: ptBR })}</div>
                    <div className="agg-day-num">{format(d, 'dd')}</div>
                    <div className={`agg-day-count ${!info?.count ? 'is-zero' : ''}`}>
                      {info?.count ?? 0} agend.
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Painel lateral: detalhes + fila de espera */}
        <div className="dash-side">
          <div className="card">
            <h3 style={{ marginBottom: 'var(--space-4)', fontSize: '0.9375rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-400)' }}>
              Detalhes
            </h3>
            {!selecionado ? (
              <div className="dash-detail-empty">
                <IconInbox />
                <span className="text-sm">Clique em um agendamento para ver os detalhes</span>
              </div>
            ) : (
              <DetalheAgendamento
                selecionado={selecionado}
                isPending={isPending}
                onMudarStatus={mudarStatus}
                dataAgenda={selectedDate}
                hojeISO={hojeISO}
              />
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: '0.9375rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-400)' }}>
                Fila de espera
              </h3>
              {pendentesFiltrados.length > 0 && (
                <span className="badge badge-pendente">{pendentesFiltrados.length}</span>
              )}
            </div>
            {pendentesFiltrados.length === 0 ? (
              <p className="text-sm text-muted">Nenhum agendamento pendente de confirmação.</p>
            ) : (
              pendentesFiltrados.map(p => (
                <div
                  key={p.id_agendamento}
                  className="queue-item"
                  onClick={() => setSelecionado({ tipo: 'pendente', item: p })}
                >
                  <span className="queue-icon"><IconClock /></span>
                  <div className="queue-body">
                    <div className="queue-name">{p.pet?.nome ?? 'Pet'} · {p.servico?.nome ?? 'Serviço'}</div>
                    <div className="queue-sub">{p.cliente?.nome}</div>
                  </div>
                  <span className="queue-time">{p.hr_agendamento.slice(0, 5)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {modalAberto && (
        <NovoAgendamentoModal
          lojistaId={lojistaId}
          defaultDate={selectedDate}
          clientes={clientesComPets}
          servicos={servicos}
          funcionarios={funcionarios}
          onClose={() => setModalAberto(false)}
          onCreated={handleCriado}
        />
      )}
    </>
  )
}

function DetalheAgendamento({
  selecionado,
  isPending,
  onMudarStatus,
  dataAgenda,
  hojeISO,
}: {
  selecionado: NonNullable<Selecionado>
  isPending: boolean
  onMudarStatus: (id: string, status: 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado') => void
  // Dia da agenda aberta (os itens da agenda são desse dia).
  dataAgenda: string
  hojeISO: string
}) {
  const isAgenda = selecionado.tipo === 'agenda'
  const item = selecionado.item

  const cliente = isAgenda ? (item as AgendaItem).nome_cliente : (item as PendenteItem).cliente?.nome ?? '—'
  const pet = isAgenda ? (item as AgendaItem).nome_pet : (item as PendenteItem).pet?.nome ?? '—'
  const raca = isAgenda ? undefined : (item as PendenteItem).pet?.raca
  const servico = isAgenda ? (item as AgendaItem).nome_servico : (item as PendenteItem).servico?.nome ?? '—'
  const hora = item.hr_agendamento.slice(0, 5)
  const valor = Number(item.valor)
  const status = isAgenda ? (item as AgendaItem).status : 'Pendente'
  const id = item.id_agendamento
  const dataItem = isAgenda ? dataAgenda : (item as PendenteItem).dt_agendamento

  return (
    <div>
      <div className="dash-detail-row"><span>Cliente</span><span>{cliente}</span></div>
      <div className="dash-detail-row"><span>Pet</span><span>{pet}{raca ? ` — ${raca}` : ''}</span></div>
      <div className="dash-detail-row"><span>Serviço</span><span>{servico}</span></div>
      <div className="dash-detail-row"><span>Horário</span><span>{hora}</span></div>
      <div className="dash-detail-row"><span>Valor</span><span>R$ {valor.toFixed(2)}</span></div>
      <div className="dash-detail-row"><span>Status</span><span><span className={`badge ${classeBadgeStatus(status)}`}>{rotuloStatus(status)}</span></span></div>

      {(status === 'Pendente' || status === 'Confirmado' || status === 'Em andamento') && (
        <div className="dash-detail-actions">
          {podeAvancarEtapa(status, dataItem, hojeISO) ? (
            <button
              className="btn btn-success btn-sm"
              style={{ flex: 1 }}
              disabled={isPending}
              onClick={() => onMudarStatus(id, PROXIMA_ETAPA[status]!.status)}
            >
              <IconCheck style={{ width: 14, height: 14 }} /> {PROXIMA_ETAPA[status]!.acao}
            </button>
          ) : (
            <span className="text-xs text-muted" style={{ flex: 1, alignSelf: 'center' }}>
              Iniciar e finalizar a partir do dia do agendamento.
            </span>
          )}
          <BotaoCancelarAgendamento key={id} disabled={isPending} onConfirmar={() => onMudarStatus(id, 'Cancelado')} />
        </div>
      )}
    </div>
  )
}
