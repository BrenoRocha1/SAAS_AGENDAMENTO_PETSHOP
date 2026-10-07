'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { atribuirFuncionarioAction, atualizarStatusAgendamentoAction, cancelarAgendamentoAction } from '@/lib/actions'
import { classeBadgeStatus, ORDEM_ETAPA, PROXIMA_ETAPA, podeAvancarEtapa, rotuloStatus } from '@/lib/status-agendamento'
import BotaoCancelarAgendamento from '@/components/lojista/BotaoCancelarAgendamento'
import { BotaoRemarcar, RemarcarModal, type AlvoRemarcar } from '@/components/lojista/RemarcarAgendamento'
import { BotaoEditar, EditarModal } from '@/components/EditarAgendamento'
import { useArrastarToque } from '@/components/lojista/useArrastarToque'
import HistoricoAlteracoes from '@/components/lojista/HistoricoAlteracoes'
import { ConfirmarBuscaTaxiDog, type EscolhaBuscaTaxiDog } from '@/components/lojista/ConfirmarBuscaTaxiDog'
import type { TaxiDogPendente } from '@/lib/actions'
import { rotuloEstoque } from '@/lib/produto'
import { formatarReais } from '@/lib/taxidog'
import { origemTaxiDogDaVisita, type TransporteVisita } from '@/lib/taxidog-visita'
import TransporteAgendamento from '@/components/lojista/TransporteAgendamento'
import PagamentoAgendamento from '@/components/lojista/PagamentoAgendamento'
import BeneficioAgendamento from '@/components/lojista/planos/BeneficioAgendamento'
import NovoAgendamentoModal from '@/components/lojista/NovoAgendamentoModal'
import type { ClienteComPets, ServicoAtivo } from '@/components/lojista/DashboardClient'
import type { FormaPagamento } from '@/lib/pagamento'
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDog,
  IconPlus,
  IconUserBadge,
} from '@/components/icons'
import Ilustracao from '@/components/Ilustracao'

// As quatro etapas do atendimento (Pendente → Aceito → Em andamento →
// Finalizado) reaproveitam o status_agendamento existente — ver
// src/lib/status-agendamento.ts pros rótulos e a ordem de transição.
// 'Cancelado' fica fora do board, igual à agenda e ao dashboard.
export interface KanbanItem {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído'
  valor: number
  nome_pet: string
  raca_pet: string | null
  especie_pet: 'Cão' | 'Gato' | null
  porte_pet: 'Pequeno' | 'Médio' | 'Grande' | null
  foto_pet: string | null
  id_cliente: string | null
  nome_cliente: string
  nome_servico: string
  id_servico: string
  id_funcionario: string | null
  nome_funcionario: string | null
  obs: string | null
  // Produtos comprados junto (migration 039) — vazio na maioria dos
  // agendamentos, já que produto é opcional no agendamento online.
  produtos: { nome: string; unidade_venda: string; quantidade: number; preco_unitario: number }[]
  // TaxiDog da visita (mesmo pet, mesmo dia) — a taxa já está somada no
  // `valor` do serviço que carrega a solicitação (taxidog.id_agendamento).
  taxidog: TransporteVisita | null
  // Pagamento do pedido (migration 057) — null em agendamento antigo.
  forma_pagamento: string | null
  status_pagamento: string | null
  // O cliente trocou serviço/pet ou remarcou (migrations 070/071).
  alterado_cliente: boolean
}

interface Props {
  lojistaId: string
  selectedDate: string
  hojeISO: string
  itensIniciais: KanbanItem[]
  // Clientes e pets da loja — só pro modal de "Novo agendamento".
  clientes: ClienteComPets[]
  funcionarios: { id_funcionario: string; nome: string }[]
  // Serviços ativos: filtro do board e opções do modal.
  servicos: ServicoAtivo[]
  // Só o responsável pela conta ou um administrador pode atribuir/trocar
  // o profissional responsável — ver atribuirFuncionarioAction.
  podeAtribuirProfissional: boolean
  // TaxiDog ativado na loja: mostra "Adicionar TaxiDog" no detalhe.
  taxidogAtivo: boolean
  // Formas que a loja aceita (seletor do bloco Pagamento).
  formasPagamento: FormaPagamento[]
}

const COLUNAS: { status: KanbanItem['status']; titulo: string; borda: string }[] = [
  { status: 'Pendente', titulo: 'Pendentes', borda: 'var(--status-aguardando-solid)' },
  { status: 'Confirmado', titulo: 'Aceitos', borda: 'var(--status-aceito-solid)' },
  { status: 'Em andamento', titulo: 'Em Andamento', borda: 'var(--status-andamento-solid)' },
  { status: 'Concluído', titulo: 'Finalizado', borda: 'var(--status-concluido-solid)' },
]

function ehColuna(v: string | null): v is KanbanItem['status'] {
  return COLUNAS.some(c => c.status === v)
}

function parseDia(iso: string) {
  return parseISO(`${iso}T12:00:00`)
}

export default function KanbanBoard({ lojistaId, selectedDate, hojeISO, itensIniciais, clientes, funcionarios, servicos, podeAtribuirProfissional, taxidogAtivo, formasPagamento }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [itens, setItens] = useState(itensIniciais)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Busca do TaxiDog ainda não chegou: a loja confirma antes de iniciar/finalizar.
  const [confirmarBusca, setConfirmarBusca] = useState<{ item: KanbanItem; novoStatus: 'Em andamento' | 'Concluído'; info: TaxiDogPendente } | null>(null)
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [filtroServico, setFiltroServico] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  // Celular: "Finalizar" no próprio card pede confirmação (não tem volta).
  const [confirmarFinalizar, setConfirmarFinalizar] = useState<KanbanItem | null>(null)

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

  // Usada tanto pelos botões quanto pelo arrastar-e-soltar. O status só
  // anda pra frente (Pendente→Confirmado→Em andamento→Concluído) — uma
  // vez finalizado (ou numa etapa mais avançada), não existe caminho de
  // volta, nem por drag-and-drop nem por botão. A Server Action recusa a
  // mesma coisa do lado do servidor; esta checagem aqui é só pra dar o
  // feedback na hora, sem esperar a viagem até o servidor.
  //
  // Otimista: o card troca de coluna na hora, antes da resposta do
  // servidor chegar — o salvamento continua rolando por baixo dos panos
  // (startTransition) e só reverte a troca se o servidor recusar.
  function moverParaStatus(item: KanbanItem, novoStatus: KanbanItem['status'], escolhaTaxiDog?: EscolhaBuscaTaxiDog) {
    if (item.status === novoStatus) return
    if (ORDEM_ETAPA[novoStatus] <= ORDEM_ETAPA[item.status]) {
      setErro('Não é possível voltar para uma etapa anterior. Um agendamento finalizado não pode ser reaberto.')
      return
    }
    setErro(null)
    setAviso(null)
    const statusAnterior = item.status
    setItens(prev => prev.map(it => it.id_agendamento === item.id_agendamento ? { ...it, status: novoStatus } : it))
    setPendingId(item.id_agendamento)
    startTransition(async () => {
      const result = await atualizarStatusAgendamentoAction(item.id_agendamento, novoStatus, escolhaTaxiDog ? { taxidog: escolhaTaxiDog } : undefined)
      setPendingId(null)
      if (result?.taxidogPendente && (novoStatus === 'Em andamento' || novoStatus === 'Concluído')) {
        // Nada mudou no servidor: volta o card e pergunta.
        setItens(prev => prev.map(it => it.id_agendamento === item.id_agendamento ? { ...it, status: statusAnterior } : it))
        setConfirmarBusca({ item: { ...item, status: statusAnterior }, novoStatus, info: result.taxidogPendente })
        return
      }
      if (result?.error) {
        setErro(result.error)
        // Servidor recusou — volta o card pra coluna original.
        setItens(prev => prev.map(it => it.id_agendamento === item.id_agendamento ? { ...it, status: statusAnterior } : it))
        return
      }
      if (result?.aviso) setAviso(result.aviso)
      router.refresh()
    })
  }

  // ── Arrastar e soltar (HTML5 Drag and Drop nativo — sem biblioteca) ──
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [colunaAlvo, setColunaAlvo] = useState<KanbanItem['status'] | null>(null)

  function handleDragStart(e: React.DragEvent, item: KanbanItem) {
    // No toque quem arrasta é useArrastarToque (abaixo) — não deixa o
    // arrastar nativo começar junto.
    if (toque.emAndamento()) { e.preventDefault(); return }
    setDraggingId(item.id_agendamento)
    e.dataTransfer.setData('text/plain', item.id_agendamento)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggingId(null)
    setColunaAlvo(null)
    acabouDeArrastarRef.current = true
    setTimeout(() => { acabouDeArrastarRef.current = false }, 0)
  }

  function handleDragOverColuna(e: React.DragEvent, status: KanbanItem['status']) {
    const item = itens.find(it => it.id_agendamento === draggingId)
    // Etapa igual ou anterior à atual — não chama preventDefault(), então
    // o navegador mantém o comportamento padrão de "não pode soltar aqui"
    // (cursor de proibido, sem highlight na coluna).
    if (item && ORDEM_ETAPA[status] <= ORDEM_ETAPA[item.status]) return
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

  // ── Modal de detalhes (abre ao clicar no card) ──
  // Um clique de verdade não dispara dragstart, então dá pra usar onClick
  // no mesmo elemento draggable sem conflito — mas alguns navegadores
  // ainda emitem um clique residual logo após soltar um drag, então essa
  // ref marca "acabei de arrastar" por um instante pra ignorar esse clique.
  const acabouDeArrastarRef = useRef(false)

  // ── Arrastar com o dedo (celular/tablet): segurar o card e arrastar ──
  // O arrastar nativo acima só funciona com mouse. Mesmas regras: a
  // coluna só acende se for uma etapa à frente; soltar usa moverParaStatus.
  const toque = useArrastarToque({
    aoIniciar: id => { setDraggingId(id); setErro(null) },
    aoMudarAlvo: (id, alvo) => {
      const item = itens.find(it => it.id_agendamento === id)
      setColunaAlvo(item && ehColuna(alvo) && ORDEM_ETAPA[alvo] > ORDEM_ETAPA[item.status] ? alvo : null)
    },
    aoSoltar: (id, alvo) => {
      const item = itens.find(it => it.id_agendamento === id)
      if (item && ehColuna(alvo)) moverParaStatus(item, alvo)
    },
    aoEncerrar: () => {
      setDraggingId(null)
      setColunaAlvo(null)
      acabouDeArrastarRef.current = true
      setTimeout(() => { acabouDeArrastarRef.current = false }, 0)
    },
  })
  // Guarda só o id: o detalhe acompanha os dados novos do servidor
  // (atualização ao vivo, troca de transporte...).
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  // Remarcar abre fora do detalhe (o item pode sair do dia).
  const [remarcando, setRemarcando] = useState<AlvoRemarcar | null>(null)
  // Editar (trocar serviço/pet) também abre fora do detalhe.
  const [editando, setEditando] = useState<string | null>(null)
  const selecionado = itens.find(it => it.id_agendamento === selecionadoId) ?? null
  const [modalErro, setModalErro] = useState<string | null>(null)

  function handleCardClick(item: KanbanItem) {
    if (acabouDeArrastarRef.current) return
    setModalErro(null)
    setSelecionadoId(item.id_agendamento)
  }

  function fecharModal() {
    setSelecionadoId(null)
    setModalErro(null)
  }

  function mudarStatusModal(novoStatus: KanbanItem['status']) {
    if (!selecionado) return
    // Reaproveita moverParaStatus (mesma troca otimista do drag-and-drop
    // — fecha na hora, e se o servidor recusar o erro aparece no board
    // com o card já de volta na coluna original).
    moverParaStatus(selecionado, novoStatus)
    fecharModal()
  }

  function cancelarModal() {
    if (!selecionado) return
    const item = selecionado
    setModalErro(null)
    startTransition(async () => {
      const result = await cancelarAgendamentoAction(item.id_agendamento)
      if (result?.error) { setModalErro(result.error); return }
      // Cancelado sai do board — o Kanban nunca mostra 'Cancelado' (mesma
      // regra da Agenda/Dashboard), então remove da lista em vez de só
      // trocar o status.
      setItens(prev => prev.filter(it => it.id_agendamento !== item.id_agendamento))
      fecharModal()
      router.refresh()
    })
  }

  function atribuirModal(idFuncionario: string) {
    if (!selecionado) return
    const item = selecionado
    setModalErro(null)
    startTransition(async () => {
      const result = await atribuirFuncionarioAction(item.id_agendamento, idFuncionario || null)
      if (result?.error) { setModalErro(result.error); return }
      const nome = funcionarios.find(f => f.id_funcionario === idFuncionario)?.nome ?? null
      setItens(prev => prev.map(it => it.id_agendamento === item.id_agendamento ? { ...it, id_funcionario: idFuncionario || null, nome_funcionario: nome } : it))
      router.refresh()
    })
  }

  // Celular: o botão do card leva para a etapa seguinte (no lugar de arrastar).
  function avancarPeloCard(item: KanbanItem) {
    const proxima = PROXIMA_ETAPA[item.status]
    if (!proxima) return
    if (proxima.status === 'Concluído') { setConfirmarFinalizar(item); return }
    moverParaStatus(item, proxima.status)
  }

  function descricaoPet(item: KanbanItem) {
    const partes = [item.especie_pet, item.porte_pet, item.raca_pet].filter(Boolean)
    return partes.length > 0 ? partes.join(' · ') : null
  }

  return (
    <>
      {/* Título e o botão "Visualizar TaxiDog" ficam na página (kanban/page.tsx). */}
      <div className="kanban-toolbar gestor-barra">
        {/* Celular (até 768px): a mesma faixa de dia da tela Agendamentos. */}
        <div className="so-celular gestor-dia-celular">
          <div className="tela-app-dia">
            <button type="button" onClick={() => irParaDia(format(subDays(selectedDateObj, 1), 'yyyy-MM-dd'))} aria-label="Dia anterior">
              <IconChevronLeft style={{ width: 20, height: 20 }} />
            </button>
            <div>
              <strong>{format(selectedDateObj, "EEEE, d 'de' MMMM", { locale: ptBR })}</strong>
              {isHoje
                ? <span>Hoje</span>
                : <button type="button" onClick={() => irParaDia(hojeISO)}>Voltar para hoje</button>}
            </div>
            <button type="button" onClick={() => irParaDia(format(addDays(selectedDateObj, 1), 'yyyy-MM-dd'))} aria-label="Próximo dia">
              <IconChevronRight style={{ width: 20, height: 20 }} />
            </button>
          </div>
        </div>

        <div className="dash-day-nav so-desktop">
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
          <button type="button" className="btn btn-primary" onClick={() => setNovoAberto(true)}>
            <IconPlus style={{ width: 16, height: 16 }} />
            Novo agendamento
          </button>
        </div>
      </div>

      {aviso && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{aviso}</span>
        </div>
      )}

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      <p className="kanban-dica-toque text-xs text-muted">Segure um card e arraste até a etapa seguinte.</p>

      {itens.length === 0 ? (
        <div className="empty-state card">
          <Ilustracao nome="agendar" />
          <div className="empty-state-title">Sem agendamentos neste dia</div>
          <p>Escolha outro dia ou crie um agendamento na agenda.</p>
        </div>
      ) : (
        <div className="kanban-columns">
          {COLUNAS.map(coluna => {
            const itensDaColuna = itensFiltrados.filter(it => it.status === coluna.status)
            return (
              <div key={coluna.status} className="kanban-column" data-alvo-toque={coluna.status}>
                <div className="kanban-column-header" style={{ borderTopColor: coluna.borda }}>
                  <span>{coluna.titulo}</span>
                  <span className={`badge ${classeBadgeStatus(coluna.status)}`}>{itensDaColuna.length}</span>
                </div>

                <div
                  className={`kanban-column-body ${colunaAlvo === coluna.status ? 'is-drag-over' : ''}`}
                  onDragOver={e => handleDragOverColuna(e, coluna.status)}
                  onDragLeave={e => handleDragLeaveColuna(e, coluna.status)}
                  onDrop={e => handleDrop(e, coluna.status)}
                >
                  {itensDaColuna.length === 0 ? (
                    <p className="text-sm text-muted" style={{ padding: 'var(--space-3)' }}>
                      {filtroFuncionario || filtroServico ? 'Nada com esse filtro.' : (
                        // No celular não se arrasta: a etapa muda pelo botão do card.
                        <>
                          <span className="so-desktop">Arraste um card pra cá, ou nenhum agendamento aqui.</span>
                          <span className="so-celular-inline">Nenhum agendamento aqui.</span>
                        </>
                      )}
                    </p>
                  ) : (
                    itensDaColuna.map(item => {
                      const pet = descricaoPet(item)
                      const podeArrastar = item.status !== 'Concluído' && !(isPending && pendingId === item.id_agendamento)
                      return (
                        <div
                          key={item.id_agendamento}
                          className={`kanban-card ${draggingId === item.id_agendamento ? 'is-dragging' : ''}`}
                          draggable={podeArrastar}
                          onDragStart={e => handleDragStart(e, item)}
                          onTouchStart={podeArrastar ? e => toque.iniciar(e, item.id_agendamento) : undefined}
                          onContextMenu={e => { if (toque.emAndamento()) e.preventDefault() }}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleCardClick(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === 'Enter') handleCardClick(item) }}
                        >
                          <div className="kanban-card-top">
                            <div className="kanban-card-time">{item.hr_agendamento.slice(0, 5)}</div>
                            <span className="text-sm font-semibold text-success">{formatarReais(item.valor)}</span>
                          </div>

                          <div className="kanban-card-main">
                            <div className="pet-avatar">
                              {item.foto_pet ? (
                                // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                                <img src={item.foto_pet} alt={item.nome_pet} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <IconDog style={{ width: 14, height: 14, color: 'var(--gray-500)' }} />
                              )}
                            </div>
                            <div>
                              <div className="kanban-card-pet">{item.nome_pet}</div>
                              {pet && <div className="text-xs text-muted">{pet}</div>}
                            </div>
                          </div>

                          <div className="kanban-card-line">{item.nome_cliente}</div>
                          <div className="kanban-card-line text-muted">{item.nome_servico}</div>
                          {item.alterado_cliente && item.status === 'Pendente' && <span className="tag-alterado-cliente">Alterado pelo cliente</span>}

                          <div className="kanban-card-prof">
                            <IconUserBadge style={{ width: 13, height: 13 }} />
                            {item.nome_funcionario ?? 'Sem profissional'}
                          </div>

                          {/* Celular: sem mouse pra arrastar, a etapa seguinte é um botão. */}
                          {item.status !== 'Concluído' && (
                            <div className="kanban-card-acao so-celular" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                              {podeAvancarEtapa(item.status, selectedDate, hojeISO) ? (
                                <button
                                  type="button"
                                  className={`btn btn-success btn-sm ${isPending && pendingId === item.id_agendamento ? 'btn-loading' : ''}`}
                                  disabled={isPending}
                                  onClick={() => avancarPeloCard(item)}
                                >
                                  <IconCheck style={{ width: 14, height: 14 }} /> {PROXIMA_ETAPA[item.status]!.acao}
                                </button>
                              ) : (
                                <p className="text-xs text-muted" style={{ margin: 0 }}>Iniciar e finalizar a partir do dia do agendamento.</p>
                              )}
                            </div>
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

      {selecionado && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Detalhes do agendamento</h3>
              <button className="modal-close" onClick={fecharModal} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              {modalErro && (
                <div className="alert alert-error" style={{ marginBottom: 'var(--space-3)' }}>
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>{modalErro}</span>
                </div>
              )}

              <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="pet-avatar" style={{ width: 48, height: 48 }}>
                  {selecionado.foto_pet ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                    <img src={selecionado.foto_pet} alt={selecionado.nome_pet} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <IconDog style={{ width: 22, height: 22, color: 'var(--gray-500)' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--gray-100)' }}>{selecionado.nome_pet}</div>
                  {descricaoPet(selecionado) && <div className="text-xs text-muted">{descricaoPet(selecionado)}</div>}
                </div>
              </div>

              <div className="dash-detail-row"><span>Cliente</span><span>{selecionado.nome_cliente}</span></div>
              <div className="dash-detail-row"><span>Serviço</span><span>{selecionado.nome_servico}</span></div>
              {selecionado.produtos.length > 0 && (
                <div className="dash-detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
                  <span>Produtos</span>
                  <div style={{ width: '100%' }}>
                    {selecionado.produtos.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm" style={{ color: 'var(--gray-300)' }}>
                        <span>{p.nome} — {rotuloEstoque(p.quantidade, p.unidade_venda)}</span>
                        <span className="font-semibold text-success">{formatarReais(p.preco_unitario * p.quantidade)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(selecionado.taxidog || taxidogAtivo) && (
                <TransporteAgendamento
                  key={`${selecionado.id_agendamento}:${selecionado.taxidog?.id_corrida ?? ''}:${selecionado.taxidog?.status ?? ''}`}
                  idAgendamento={selecionado.id_agendamento}
                  idCliente={selecionado.id_cliente}
                  statusAgendamento={selecionado.status}
                  transporte={selecionado.taxidog}
                  podeAlterar
                  origemVisita={origemTaxiDogDaVisita(selecionado.id_agendamento, selecionado.taxidog, itens).descricao}
                />
              )}
              <BeneficioAgendamento idAgendamento={selecionado.id_agendamento} status={selecionado.status} />
              <PagamentoAgendamento
                idAgendamento={selecionado.id_agendamento}
                forma={selecionado.forma_pagamento}
                status={selecionado.status_pagamento}
                formasAceitas={formasPagamento}
                podeAlterar
              />
              <HistoricoAlteracoes key={`${selecionado.id_agendamento}:${selecionado.dt_agendamento}:${selecionado.hr_agendamento}:${selecionado.nome_servico}:${selecionado.nome_pet}`} idAgendamento={selecionado.id_agendamento} />
              <div className="dash-detail-row"><span>Data</span><span>{format(parseDia(selecionado.dt_agendamento), 'dd/MM/yyyy')}</span></div>
              <div className="dash-detail-row"><span>Horário</span><span>{selecionado.hr_agendamento.slice(0, 5)}</span></div>
              <div className="dash-detail-row">
                <span>Valor</span>
                <span style={{ textAlign: 'right' }}>
                  {formatarReais(selecionado.valor)}
                  {/* A taxa do TaxiDog já está somada em `valor`. */}
                  {selecionado.taxidog?.id_agendamento === selecionado.id_agendamento && (
                    <><br /><span className="text-xs text-muted">inclui TaxiDog</span></>
                  )}
                </span>
              </div>
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
                      value={selecionado.id_funcionario ?? ''}
                      onChange={e => atribuirModal(e.target.value)}
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
                  {podeAvancarEtapa(selecionado.status, selectedDate, hojeISO) ? (
                    <button
                      className="btn btn-success btn-sm"
                      style={{ flex: 1 }}
                      disabled={isPending}
                      onClick={() => mudarStatusModal(PROXIMA_ETAPA[selecionado.status]!.status)}
                    >
                      <IconCheck style={{ width: 14, height: 14 }} /> {PROXIMA_ETAPA[selecionado.status]!.acao}
                    </button>
                  ) : (
                    <span className="text-xs text-muted" style={{ flex: 1, alignSelf: 'center' }}>
                      Iniciar e finalizar a partir do dia do agendamento.
                    </span>
                  )}
                  {selecionado.status !== 'Em andamento' && (
                    <BotaoRemarcar onClick={() => {
                      setRemarcando({ idAgendamento: selecionado.id_agendamento, dataAtual: selecionado.dt_agendamento, horaAtual: selecionado.hr_agendamento })
                      setSelecionadoId(null)
                    }} />
                  )}
                  {selecionado.status !== 'Em andamento' && (
                    <BotaoEditar onClick={() => {
                      setEditando(selecionado.id_agendamento)
                      setSelecionadoId(null)
                    }} />
                  )}
                  <BotaoCancelarAgendamento key={selecionado.id_agendamento} disabled={isPending} onConfirmar={cancelarModal} />
                </div>
              )}
              {selecionado.status === 'Concluído' && (
                <p className="text-sm text-muted" style={{ marginTop: 'var(--space-3)' }}>
                  Agendamento finalizado — o status não pode mais ser alterado.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mesmo modal do Dashboard e da Agenda; abre no dia que o board mostra.
          Ao criar, o board recarrega (se o agendamento for de outro dia, ele
          só aparece indo até lá). */}
      {novoAberto && (
        <NovoAgendamentoModal
          lojistaId={lojistaId}
          defaultDate={selectedDate}
          clientes={clientes}
          servicos={servicos}
          funcionarios={funcionarios}
          podeAtribuirProfissional={podeAtribuirProfissional}
          onClose={() => setNovoAberto(false)}
          onCreated={() => router.refresh()}
        />
      )}

      {confirmarFinalizar && (
        <div className="modal-overlay" onClick={() => setConfirmarFinalizar(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Finalizar atendimento</h3>
              <button className="modal-close" onClick={() => setConfirmarFinalizar(null)} aria-label="Fechar">
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>Confirma que o atendimento de {confirmarFinalizar.nome_pet} terminou?</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmarFinalizar(null)}>Voltar</button>
              <button
                type="button"
                className="btn btn-success"
                onClick={() => {
                  const item = confirmarFinalizar
                  setConfirmarFinalizar(null)
                  moverParaStatus(item, 'Concluído')
                }}
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {remarcando && <RemarcarModal {...remarcando} onFechar={() => setRemarcando(null)} />}
      {editando && <EditarModal idAgendamento={editando} modo="loja" onFechar={() => setEditando(null)} />}
      {confirmarBusca && (
        <ConfirmarBuscaTaxiDog
          info={confirmarBusca.info}
          novoStatus={confirmarBusca.novoStatus}
          onFechar={() => setConfirmarBusca(null)}
          onEscolher={escolha => {
            const c = confirmarBusca
            setConfirmarBusca(null)
            moverParaStatus(c.item, c.novoStatus, escolha)
          }}
        />
      )}
    </>
  )
}
