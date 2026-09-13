'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { atualizarStatusAgendamentoAction } from '@/lib/actions'
import {
  IconAlert,
  IconArrowRight,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconDog,
  IconUserBadge,
} from '@/components/icons'

// Reaproveita exatamente o status_agendamento existente — não existe
// (nem é criado aqui) nenhum status "Em Andamento" no banco. A coluna do
// meio é 'Confirmado' com o rótulo "Em Andamento" só na interface.
// 'Cancelado' fica fora do board, igual à agenda e ao dashboard.
export interface KanbanItem {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Concluído'
  valor: number
  nome_pet: string
  raca_pet: string | null
  especie_pet: 'Cão' | 'Gato' | null
  porte_pet: 'Pequeno' | 'Médio' | 'Grande' | null
  nome_cliente: string
  nome_servico: string
  id_servico: string
  id_funcionario: string | null
  nome_funcionario: string | null
}

interface Props {
  selectedDate: string
  hojeISO: string
  itensIniciais: KanbanItem[]
  funcionarios: { id_funcionario: string; nome: string }[]
  servicos: { id_servico: string; nome: string }[]
}

const COLUNAS = [
  { status: 'Pendente' as const, titulo: 'Agendamentos Pendentes', badge: 'badge-pendente', proximo: 'Confirmado' as const, acao: 'Iniciar atendimento' },
  { status: 'Confirmado' as const, titulo: 'Em Andamento', badge: 'badge-confirmado', proximo: 'Concluído' as const, acao: 'Finalizar' },
  { status: 'Concluído' as const, titulo: 'Finalizado', badge: 'badge-concluido', proximo: null, acao: null },
]

function parseDia(iso: string) {
  return parseISO(`${iso}T12:00:00`)
}

export default function KanbanBoard({ selectedDate, hojeISO, itensIniciais, funcionarios, servicos }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [itens, setItens] = useState(itensIniciais)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [filtroServico, setFiltroServico] = useState('')

  // Re-sincroniza com o servidor quando o dia muda (navegação por Link) —
  // ajuste de estado durante a renderização, não em efeito.
  const [itensAnterior, setItensAnterior] = useState(itensIniciais)
  if (itensIniciais !== itensAnterior) {
    setItensAnterior(itensIniciais)
    setItens(itensIniciais)
  }

  const selectedDateObj = parseDia(selectedDate)
  const isHoje = selectedDate === hojeISO

  function irParaDia(iso: string) {
    router.push(`/lojista/kanban?data=${iso}`)
  }

  const itensFiltrados = useMemo(() => {
    return itens.filter(it => {
      if (filtroFuncionario && it.id_funcionario !== filtroFuncionario) return false
      if (filtroServico && it.id_servico !== filtroServico) return false
      return true
    })
  }, [itens, filtroFuncionario, filtroServico])

  // Usada tanto pelos botões (Pendente→Confirmado→Concluído, só pra
  // frente) quanto pelo arrastar-e-soltar (qualquer coluna → qualquer
  // coluna, incluindo voltar — ex.: arrastar de volta de "Finalizado"
  // pra "Em Andamento" se foi marcado por engano).
  function moverParaStatus(item: KanbanItem, novoStatus: KanbanItem['status']) {
    if (item.status === novoStatus) return
    setErro(null)
    setPendingId(item.id_agendamento)
    startTransition(async () => {
      const result = await atualizarStatusAgendamentoAction(item.id_agendamento, novoStatus)
      setPendingId(null)
      if (result?.error) {
        setErro(result.error)
        return
      }
      setItens(prev => prev.map(it => it.id_agendamento === item.id_agendamento ? { ...it, status: novoStatus } : it))
      router.refresh()
    })
  }

  // ── Arrastar e soltar (HTML5 Drag and Drop nativo — sem biblioteca) ──
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [colunaAlvo, setColunaAlvo] = useState<KanbanItem['status'] | null>(null)

  function handleDragStart(e: React.DragEvent, item: KanbanItem) {
    setDraggingId(item.id_agendamento)
    e.dataTransfer.setData('text/plain', item.id_agendamento)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggingId(null)
    setColunaAlvo(null)
  }

  function handleDragOverColuna(e: React.DragEvent, status: KanbanItem['status']) {
    e.preventDefault() // sem isso o navegador não permite soltar aqui
    e.dataTransfer.dropEffect = 'move'
    if (colunaAlvo !== status) setColunaAlvo(status)
  }

  function handleDragLeaveColuna(e: React.DragEvent, status: KanbanItem['status']) {
    // Ignora dragleave disparado ao passar por um card FILHO da coluna —
    // só limpa o destaque quando realmente sai da coluna inteira.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    if (colunaAlvo === status) setColunaAlvo(null)
  }

  function handleDrop(e: React.DragEvent, status: KanbanItem['status']) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    setColunaAlvo(null)
    setDraggingId(null)
    const item = itens.find(it => it.id_agendamento === id)
    if (item) moverParaStatus(item, status)
  }

  function descricaoPet(item: KanbanItem) {
    const partes = [item.especie_pet, item.porte_pet, item.raca_pet].filter(Boolean)
    return partes.length > 0 ? partes.join(' · ') : null
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Kanban de Agendamentos</h1>
        <p className="page-subtitle">Acompanhe o atendimento em tempo real</p>
      </div>

      <div className="kanban-toolbar">
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
          {!isHoje && (
            <button className="btn btn-ghost btn-sm" onClick={() => irParaDia(hojeISO)} style={{ marginLeft: 'var(--space-2)' }}>
              Hoje
            </button>
          )}
        </div>

        <div className="kanban-filtros">
          {funcionarios.length > 0 && (
            <select className="form-select" value={filtroFuncionario} onChange={e => setFiltroFuncionario(e.target.value)}>
              <option value="">Todos os profissionais</option>
              {funcionarios.map(f => (
                <option key={f.id_funcionario} value={f.id_funcionario}>{f.nome}</option>
              ))}
            </select>
          )}
          {servicos.length > 0 && (
            <select className="form-select" value={filtroServico} onChange={e => setFiltroServico(e.target.value)}>
              <option value="">Todos os serviços</option>
              {servicos.map(s => (
                <option key={s.id_servico} value={s.id_servico}>{s.nome}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      {itens.length === 0 ? (
        <div className="empty-state card">
          <IconCalendar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem agendamentos neste dia</div>
          <p>Escolha outro dia ou crie um agendamento na agenda.</p>
        </div>
      ) : (
        <div className="kanban-columns">
          {COLUNAS.map(coluna => {
            const itensDaColuna = itensFiltrados.filter(it => it.status === coluna.status)
            return (
              <div key={coluna.status} className="kanban-column">
                <div className={`kanban-column-header kanban-column-header--${coluna.status}`}>
                  <span>{coluna.titulo}</span>
                  <span className={`badge ${coluna.badge}`}>{itensDaColuna.length}</span>
                </div>

                <div
                  className={`kanban-column-body ${colunaAlvo === coluna.status ? 'is-drag-over' : ''}`}
                  onDragOver={e => handleDragOverColuna(e, coluna.status)}
                  onDragLeave={e => handleDragLeaveColuna(e, coluna.status)}
                  onDrop={e => handleDrop(e, coluna.status)}
                >
                  {itensDaColuna.length === 0 ? (
                    <p className="text-sm text-muted" style={{ padding: 'var(--space-3)' }}>
                      {filtroFuncionario || filtroServico ? 'Nada com esse filtro.' : 'Arraste um card pra cá, ou nenhum agendamento aqui.'}
                    </p>
                  ) : (
                    itensDaColuna.map(item => {
                      const pet = descricaoPet(item)
                      return (
                        <div
                          key={item.id_agendamento}
                          className={`kanban-card ${draggingId === item.id_agendamento ? 'is-dragging' : ''}`}
                          draggable={!(isPending && pendingId === item.id_agendamento)}
                          onDragStart={e => handleDragStart(e, item)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="kanban-card-top">
                            <div className="kanban-card-time">{item.hr_agendamento.slice(0, 5)}</div>
                            <span className="text-sm font-semibold text-success">R$ {item.valor.toFixed(2)}</span>
                          </div>

                          <div className="kanban-card-main">
                            <IconDog style={{ width: 16, height: 16, color: 'var(--gray-400)', flexShrink: 0, marginTop: 2 }} />
                            <div>
                              <div className="kanban-card-pet">{item.nome_pet}</div>
                              {pet && <div className="text-xs text-muted">{pet}</div>}
                            </div>
                          </div>

                          <div className="kanban-card-line">{item.nome_cliente}</div>
                          <div className="kanban-card-line text-muted">{item.nome_servico}</div>

                          <div className="kanban-card-prof">
                            <IconUserBadge style={{ width: 13, height: 13 }} />
                            {item.nome_funcionario ?? 'Sem profissional'}
                          </div>

                          {coluna.proximo && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm btn-full"
                              style={{ marginTop: 'var(--space-3)' }}
                              onClick={() => moverParaStatus(item, coluna.proximo!)}
                              disabled={isPending && pendingId === item.id_agendamento}
                            >
                              {isPending && pendingId === item.id_agendamento ? 'Salvando...' : (<>{coluna.acao} <IconArrowRight style={{ width: 13, height: 13 }} /></>)}
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
