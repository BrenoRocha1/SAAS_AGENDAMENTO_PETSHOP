'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  format,
  parseISO,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconClose,
  IconCheck,
  IconAlert,
  IconStore,
  IconLink,
  IconCar,
} from '@/components/icons'
import { atribuirFuncionarioAction, atualizarStatusAgendamentoAction, cancelarAgendamentoAction } from '@/lib/actions'
import { classeBadgeStatus, PROXIMA_ETAPA, rotuloStatus } from '@/lib/status-agendamento'
import NovoAgendamentoModal from './NovoAgendamentoModal'
import { ROTULO_MODALIDADE, formatarReais, type ModalidadeTaxiDog } from '@/lib/taxidog'
import type { ClienteComPets, ServicoAtivo } from './DashboardClient'

export interface AgendamentoCalendario {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  duracao: number
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  valor: number
  nome_pet: string
  nome_cliente: string
  nome_servico: string
  id_funcionario: string | null
  nome_funcionario: string | null
  obs: string | null
  // De onde veio (migration 049): lançado pela loja ou feito pelo cliente
  // online. null = agendamento antigo, de antes de o banco guardar isso.
  origem: 'loja' | 'online' | null
  // TaxiDog pedido na visita (mesmo pet, mesmo dia) — null = sem.
  taxidog: ModalidadeTaxiDog | null
}

export interface FuncionarioFiltro {
  id_funcionario: string
  nome: string
}

interface Props {
  lojistaId: string
  inicioSemana: string
  agendamentosIniciais: AgendamentoCalendario[]
  funcionarios: FuncionarioFiltro[]
  clientesComPets: ClienteComPets[]
  servicos: ServicoAtivo[]
  // ?novoAgendamentoTutor=<id> (vem de "Novo agendamento" no perfil do
  // cliente) — abre o modal já com esse cliente fixado.
  clienteFixoInicial?: { id_cliente: string; nome: string; telefone: string } | null
  // ?novoAgendamentoProfissional=<id> (vem de "Novo Agendamento" no
  // perfil do funcionário) — abre o modal com esse profissional já
  // pré-selecionado (não travado, o campo já era opcional).
  funcionarioIdPadraoInicial?: string | null
  // Só o responsável pela conta ou um administrador pode atribuir/trocar
  // o profissional responsável — ver atribuirFuncionarioAction.
  podeAtribuirProfissional: boolean
  // Intervalo de horas mostrado na grade — calculado no servidor a partir
  // do horário de funcionamento da loja (tabela horario), não fixo.
  horaInicioGrade: number
  horaFimGrade: number
}

const CORES = ['#4f46e5', '#0891b2', '#db2777', '#d97706', '#16a34a', '#7c3aed', '#2563eb']
const SEM_PROFISSIONAL = '__sem_profissional__'
const ALTURA_HORA = 56 // px

function parseDia(iso: string) {
  return parseISO(`${iso}T12:00:00`)
}

function minutosDoDia(hhmmss: string) {
  const [h, m] = hhmmss.split(':').map(Number)
  return h * 60 + m
}

function corDoFuncionario(id: string | null, funcionarios: FuncionarioFiltro[]) {
  if (!id) return '#6b7280'
  const idx = funcionarios.findIndex(f => f.id_funcionario === id)
  return CORES[idx % CORES.length] ?? '#6b7280'
}

interface EventoPosicionado extends AgendamentoCalendario {
  top: number
  height: number
  lane: number
  totalLanes: number
}

function posicionarDia(eventos: AgendamentoCalendario[], horaInicioGrade: number, horaFimGrade: number): EventoPosicionado[] {
  const comMinutos = eventos
    .map(e => {
      const inicio = minutosDoDia(e.hr_agendamento)
      return { ...e, inicioMin: inicio, fimMin: inicio + e.duracao }
    })
    .sort((a, b) => a.inicioMin - b.inicioMin)

  const resultado: EventoPosicionado[] = []
  let cluster: typeof comMinutos = []
  let fimCluster = -Infinity

  function flush() {
    if (cluster.length === 0) return
    const lanesFim: number[] = []
    const comLane = cluster.map(ev => {
      let lane = lanesFim.findIndex(fim => fim <= ev.inicioMin)
      if (lane === -1) {
        lane = lanesFim.length
        lanesFim.push(ev.fimMin)
      } else {
        lanesFim[lane] = ev.fimMin
      }
      return { ev, lane }
    })
    const totalLanes = lanesFim.length
    for (const { ev, lane } of comLane) {
      const inicioClamp = Math.max(ev.inicioMin, horaInicioGrade * 60)
      const fimClamp = Math.min(ev.fimMin, horaFimGrade * 60)
      resultado.push({
        ...ev,
        top: ((inicioClamp - horaInicioGrade * 60) / 60) * ALTURA_HORA,
        height: Math.max(((fimClamp - inicioClamp) / 60) * ALTURA_HORA, 18),
        lane,
        totalLanes,
      })
    }
    cluster = []
  }

  // Um agendamento fora do intervalo da grade (ex.: horário antigo, de
  // antes de mudar o funcionamento da loja) não entra — só a grade em si
  // já reflete o horário de funcionamento; deixar ele passar faria a
  // altura/posição estourar pra fora do quadro em vez de simplesmente
  // não aparecer (ele continua visível na Agenda do dia, no Kanban etc.,
  // só não cabe nesta grade semanal).
  const dentroDaGrade = comMinutos.filter(ev => ev.fimMin > horaInicioGrade * 60 && ev.inicioMin < horaFimGrade * 60)

  for (const ev of dentroDaGrade) {
    if (ev.inicioMin >= fimCluster) {
      flush()
      fimCluster = ev.fimMin
    } else {
      fimCluster = Math.max(fimCluster, ev.fimMin)
    }
    cluster.push(ev)
  }
  flush()

  return resultado
}

const ROTULO_ORIGEM: Record<'loja' | 'online', string> = {
  loja: 'Lançado pela loja',
  online: 'Agendamento online',
}

// Ícones do bloco da agenda: de onde veio o pedido e se tem TaxiDog.
function IconesAgendamento({ origem, taxidog }: { origem: 'loja' | 'online' | null; taxidog: ModalidadeTaxiDog | null }) {
  if (!origem && !taxidog) return null
  return (
    <span className="cal-event-icones" aria-hidden="true">
      {origem === 'loja' && <IconStore />}
      {origem === 'online' && <IconLink />}
      {taxidog && <IconCar />}
    </span>
  )
}

export default function AgendaCalendar({
  lojistaId,
  inicioSemana,
  agendamentosIniciais,
  funcionarios,
  clientesComPets,
  servicos,
  clienteFixoInicial,
  funcionarioIdPadraoInicial,
  podeAtribuirProfissional,
  horaInicioGrade,
  horaFimGrade,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Otimista: status/profissional mudam na hora na tela, o salvamento de
  // verdade continua rolando por baixo dos panos (startTransition) — só
  // reverte se o servidor recusar. Mesmo padrão do KanbanBoard.
  const [agendamentos, setAgendamentos] = useState(agendamentosIniciais)
  // Re-sincroniza com o servidor quando a semana muda (navegação por
  // Link/router.push) — ajuste de estado durante a renderização, não em
  // efeito (mesmo truque do KanbanBoard pra trocar de dia).
  const [agendamentosAnterior, setAgendamentosAnterior] = useState(agendamentosIniciais)
  if (agendamentosIniciais !== agendamentosAnterior) {
    setAgendamentosAnterior(agendamentosIniciais)
    setAgendamentos(agendamentosIniciais)
  }

  const inicioSemanaObj = parseDia(inicioSemana)
  const diasSemana = useMemo(
    () => eachDayOfInterval({ start: inicioSemanaObj, end: addDays(inicioSemanaObj, 6) }),
    [inicioSemana] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const [mesMini, setMesMini] = useState(inicioSemanaObj)
  const [filtroProfissionais, setFiltroProfissionais] = useState<Set<string>>(
    () => new Set([...funcionarios.map(f => f.id_funcionario), SEM_PROFISSIONAL])
  )
  const [selecionado, setSelecionado] = useState<AgendamentoCalendario | null>(null)
  const [modalAberto, setModalAberto] = useState(!!clienteFixoInicial || !!funcionarioIdPadraoInicial)
  const [acaoErro, setAcaoErro] = useState<string | null>(null)

  function irParaSemana(dataRef: Date) {
    const iso = format(startOfWeek(dataRef, { weekStartsOn: 0 }), 'yyyy-MM-dd')
    router.push(`/lojista/agendamentos?semana=${iso}`)
  }

  function toggleProfissional(id: string) {
    setFiltroProfissionais(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const agendamentosFiltrados = agendamentos.filter(a =>
    filtroProfissionais.has(a.id_funcionario ?? SEM_PROFISSIONAL)
  )

  const diasDoMesMini = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mesMini), { weekStartsOn: 0 })
    const fim = endOfWeek(endOfMonth(mesMini), { weekStartsOn: 0 })
    return eachDayOfInterval({ start: inicio, end: fim })
  }, [mesMini])

  const horas = Array.from({ length: horaFimGrade - horaInicioGrade + 1 }, (_, i) => horaInicioGrade + i)

  function mudarStatus(id: string, novoStatus: 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado') {
    const atual = agendamentos.find(a => a.id_agendamento === id)
    if (!atual) return
    const statusAnterior = atual.status
    setAcaoErro(null)
    setAgendamentos(prev => prev.map(a => a.id_agendamento === id ? { ...a, status: novoStatus } : a))
    setSelecionado(null)
    startTransition(async () => {
      const result = novoStatus === 'Cancelado'
        ? await cancelarAgendamentoAction(id)
        : await atualizarStatusAgendamentoAction(id, novoStatus)
      if (result?.error) {
        setAcaoErro(result.error)
        setAgendamentos(prev => prev.map(a => a.id_agendamento === id ? { ...a, status: statusAnterior } : a))
        return
      }
      router.refresh()
    })
  }

  function atribuir(id: string, idFuncionario: string) {
    const atual = agendamentos.find(a => a.id_agendamento === id)
    if (!atual) return
    const funcionarioAnterior = { id_funcionario: atual.id_funcionario, nome_funcionario: atual.nome_funcionario }
    const nome = funcionarios.find(f => f.id_funcionario === idFuncionario)?.nome ?? null
    setAcaoErro(null)
    setAgendamentos(prev => prev.map(a => a.id_agendamento === id ? { ...a, id_funcionario: idFuncionario || null, nome_funcionario: nome } : a))
    setSelecionado(prev => prev && prev.id_agendamento === id ? { ...prev, id_funcionario: idFuncionario || null, nome_funcionario: nome } : prev)
    startTransition(async () => {
      const result = await atribuirFuncionarioAction(id, idFuncionario || null)
      if (result?.error) {
        setAcaoErro(result.error)
        setAgendamentos(prev => prev.map(a => a.id_agendamento === id ? { ...a, ...funcionarioAnterior } : a))
        setSelecionado(prev => prev && prev.id_agendamento === id ? { ...prev, ...funcionarioAnterior } : prev)
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <div className="page-header flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="page-title">Agendamentos</h1>
          <p className="page-subtitle">Agenda semanal do seu petshop</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalAberto(true)}>
          <IconPlus style={{ width: 16, height: 16 }} /> Criar agendamento
        </button>
      </div>

      {acaoErro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{acaoErro}</span>
        </div>
      )}

      <div className="cal-shell">
        {/* Barra lateral: mini calendário + filtro de profissionais */}
        <div className="cal-side">
          <div className="cal-mini">
            <div className="cal-mini-header">
              <button onClick={() => setMesMini(m => subDays(startOfMonth(m), 1))} aria-label="Mês anterior">
                <IconChevronLeft style={{ width: 14, height: 14 }} />
              </button>
              <span className="cal-mini-title">{format(mesMini, "MMMM 'de' yyyy", { locale: ptBR })}</span>
              <button onClick={() => setMesMini(m => addDays(endOfMonth(m), 1))} aria-label="Próximo mês">
                <IconChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div className="cal-mini-grid">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                <div key={i} className="cal-mini-dow">{d}</div>
              ))}
              {diasDoMesMini.map(dia => (
                <button
                  key={dia.toISOString()}
                  type="button"
                  className={[
                    'cal-mini-day',
                    !isSameMonth(dia, mesMini) ? 'is-outside' : '',
                    isToday(dia) ? 'is-today' : '',
                    diasSemana.some(d => isSameDay(d, dia)) ? 'is-selected' : '',
                  ].join(' ').trim()}
                  onClick={() => irParaSemana(dia)}
                >
                  {format(dia, 'd')}
                </button>
              ))}
            </div>
          </div>

          <div className="cal-profs cal-legenda">
            <h4>Legenda</h4>
            <div className="cal-legenda-item"><IconStore style={{ width: 14, height: 14 }} /> Lançado pela loja</div>
            <div className="cal-legenda-item"><IconLink style={{ width: 14, height: 14 }} /> Agendamento online</div>
            <div className="cal-legenda-item"><IconCar style={{ width: 14, height: 14 }} /> Com TaxiDog</div>
          </div>

          {funcionarios.length > 0 && (
            <div className="cal-profs">
              <h4>Profissionais</h4>
              <label className="cal-prof-item">
                <input
                  type="checkbox"
                  checked={filtroProfissionais.has(SEM_PROFISSIONAL)}
                  onChange={() => toggleProfissional(SEM_PROFISSIONAL)}
                />
                <span className="cal-prof-dot" style={{ background: '#6b7280' }} />
                Sem profissional
              </label>
              {funcionarios.map(f => (
                <label key={f.id_funcionario} className="cal-prof-item">
                  <input
                    type="checkbox"
                    checked={filtroProfissionais.has(f.id_funcionario)}
                    onChange={() => toggleProfissional(f.id_funcionario)}
                  />
                  <span className="cal-prof-dot" style={{ background: corDoFuncionario(f.id_funcionario, funcionarios) }} />
                  {f.nome}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Semana */}
        <div>
          <div className="cal-toolbar">
            <button className="btn btn-ghost btn-sm" onClick={() => irParaSemana(new Date())}>Hoje</button>
            <div className="cal-nav">
              <button onClick={() => irParaSemana(subWeeks(inicioSemanaObj, 1))} aria-label="Semana anterior">
                <IconChevronLeft style={{ width: 15, height: 15 }} />
              </button>
              <button onClick={() => irParaSemana(addWeeks(inicioSemanaObj, 1))} aria-label="Próxima semana">
                <IconChevronRight style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <span className="cal-toolbar-title">
              {format(diasSemana[0], "dd 'de' MMM", { locale: ptBR })} – {format(diasSemana[6], "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>

          <div className="cal-week">
            <div className="cal-week-head">
              <div />
              {diasSemana.map(dia => (
                <div key={dia.toISOString()} className={`cal-week-head-cell ${isToday(dia) ? 'is-today' : ''}`}>
                  <div className="cal-week-head-dow">{format(dia, 'EEE', { locale: ptBR })}</div>
                  <div className="cal-week-head-num">{format(dia, 'd')}</div>
                </div>
              ))}
            </div>

            <div className="cal-body" style={{ height: (horaFimGrade - horaInicioGrade) * ALTURA_HORA }}>
              <div className="cal-gutter">
                {horas.map(h => (
                  <div
                    key={h}
                    className={`cal-gutter-hour ${h === horaInicioGrade ? 'is-primeira' : ''}`}
                    style={{ top: (h - horaInicioGrade) * ALTURA_HORA }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {diasSemana.map(dia => {
                const diaISO = format(dia, 'yyyy-MM-dd')
                const eventosDoDia = agendamentosFiltrados.filter(a => a.dt_agendamento === diaISO)
                const posicionados = posicionarDia(eventosDoDia, horaInicioGrade, horaFimGrade)
                return (
                  <div key={diaISO} className="cal-day-col">
                    {horas.map(h => (
                      <div key={h} className="cal-hour-line" style={{ top: (h - horaInicioGrade) * ALTURA_HORA }} />
                    ))}
                    {posicionados.map(ev => {
                      const cor = corDoFuncionario(ev.id_funcionario, funcionarios)
                      const largura = 100 / ev.totalLanes
                      return (
                        <button
                          key={ev.id_agendamento}
                          type="button"
                          className={`cal-event ${ev.status === 'Cancelado' ? 'is-cancelado' : ''}`}
                          style={{
                            top: ev.top,
                            height: ev.height,
                            left: `calc(${ev.lane * largura}% + 2px)`,
                            width: `calc(${largura}% - 4px)`,
                            background: cor,
                            borderLeftColor: cor,
                            filter: ev.status === 'Pendente' ? 'saturate(0.6)' : 'none',
                          }}
                          onClick={() => setSelecionado(ev)}
                          title={[
                            `${ev.hr_agendamento.slice(0, 5)} · ${ev.nome_pet} · ${ev.nome_servico}`,
                            ev.origem ? ROTULO_ORIGEM[ev.origem] : null,
                            ev.taxidog ? `TaxiDog: ${ROTULO_MODALIDADE[ev.taxidog]}` : null,
                          ].filter(Boolean).join(' · ')}
                        >
                          <div className="cal-event-time">
                            {ev.hr_agendamento.slice(0, 5)}
                            <IconesAgendamento origem={ev.origem} taxidog={ev.taxidog} />
                          </div>
                          <div className="cal-event-title">{ev.nome_pet} · {ev.nome_servico}</div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {selecionado && (
        <div className="modal-overlay" onClick={() => setSelecionado(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Detalhes do agendamento</h3>
              <button className="modal-close" onClick={() => setSelecionado(null)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <div className="dash-detail-row"><span>Cliente</span><span>{selecionado.nome_cliente}</span></div>
              <div className="dash-detail-row"><span>Pet</span><span>{selecionado.nome_pet}</span></div>
              <div className="dash-detail-row"><span>Serviço</span><span>{selecionado.nome_servico}</span></div>
              <div className="dash-detail-row"><span>Data</span><span>{format(parseDia(selecionado.dt_agendamento), 'dd/MM/yyyy')}</span></div>
              <div className="dash-detail-row"><span>Horário</span><span>{selecionado.hr_agendamento.slice(0, 5)}</span></div>
              <div className="dash-detail-row"><span>Valor</span><span>{formatarReais(selecionado.valor)}</span></div>
              {selecionado.origem && (
                <div className="dash-detail-row">
                  <span>Origem</span>
                  <span className="flex items-center gap-1">
                    {selecionado.origem === 'loja' ? <IconStore style={{ width: 13, height: 13 }} /> : <IconLink style={{ width: 13, height: 13 }} />}
                    {ROTULO_ORIGEM[selecionado.origem]}
                  </span>
                </div>
              )}
              {selecionado.taxidog && (
                <div className="dash-detail-row">
                  <span>TaxiDog</span>
                  <span className="flex items-center gap-1"><IconCar style={{ width: 13, height: 13 }} /> {ROTULO_MODALIDADE[selecionado.taxidog]}</span>
                </div>
              )}
              <div className="dash-detail-row"><span>Status</span><span><span className={`badge ${classeBadgeStatus(selecionado.status)}`}>{rotuloStatus(selecionado.status)}</span></span></div>
              {selecionado.obs && (
                <div className="dash-detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
                  <span>Descrição</span>
                  <span style={{ textAlign: 'left', fontWeight: 400, color: 'var(--gray-300)' }}>{selecionado.obs}</span>
                </div>
              )}

              {funcionarios.length > 0 && (
                podeAtribuirProfissional ? (
                  <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                    <label className="form-label">Profissional responsável</label>
                    <select
                      className="form-select"
                      defaultValue={selecionado.id_funcionario ?? ''}
                      onChange={e => atribuir(selecionado.id_agendamento, e.target.value)}
                      disabled={isPending}
                    >
                      <option value="">Sem profissional</option>
                      {funcionarios.map(f => (
                        <option key={f.id_funcionario} value={f.id_funcionario}>{f.nome}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="dash-detail-row"><span>Profissional responsável</span><span>{selecionado.nome_funcionario ?? 'Sem profissional'}</span></div>
                )
              )}

              {(selecionado.status === 'Pendente' || selecionado.status === 'Confirmado' || selecionado.status === 'Em andamento') && (
                <div className="dash-detail-actions">
                  <button
                    className="btn btn-success btn-sm"
                    style={{ flex: 1 }}
                    disabled={isPending}
                    onClick={() => mudarStatus(selecionado.id_agendamento, PROXIMA_ETAPA[selecionado.status]!.status)}
                  >
                    <IconCheck style={{ width: 14, height: 14 }} /> {PROXIMA_ETAPA[selecionado.status]!.acao}
                  </button>
                  <button className="btn btn-danger btn-sm" style={{ flex: 1 }} disabled={isPending} onClick={() => mudarStatus(selecionado.id_agendamento, 'Cancelado')}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <NovoAgendamentoModal
          lojistaId={lojistaId}
          defaultDate={format(new Date(), 'yyyy-MM-dd')}
          clientes={clientesComPets}
          servicos={servicos}
          funcionarios={funcionarios}
          podeAtribuirProfissional={podeAtribuirProfissional}
          clienteIdFixo={clienteFixoInicial?.id_cliente}
          funcionarioIdPadrao={funcionarioIdPadraoInicial ?? undefined}
          onClose={() => {
            setModalAberto(false)
            // Veio de ?novoAgendamentoTutor= ou ?novoAgendamentoProfissional=
            // — some com o parâmetro ao fechar sem criar, preservando a
            // semana em exibição.
            if (clienteFixoInicial || funcionarioIdPadraoInicial) router.push(`/lojista/agendamentos?semana=${inicioSemana}`)
          }}
          onCreated={() => router.refresh()}
        />
      )}
    </>
  )
}
