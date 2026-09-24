'use client'

import { useMemo, useState, useTransition } from 'react'
import { differenceInHours, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cancelarAgendamentoAction } from '@/lib/actions'
import { hojeBrasilISO } from '@/lib/agenda'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import { rotuloEstoque } from '@/lib/produto'
import { ROTULO_MODALIDADE, formatarReais, rotuloStatusCorrida, type ModalidadeTaxiDog } from '@/lib/taxidog'
import { IconAlert, IconCalendar, IconCar, IconChevronRight, IconPackage, IconPencil, IconStar, IconStore, IconTrash } from '@/components/icons'
import AvaliacaoModal, { type AvaliacaoExistente } from './AvaliacaoModal'
import { Estrelas } from './Estrelas'

type Status = 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'

export interface AgendamentoCliente {
  id_agendamento: string
  id_pet: string
  id_lojista: string
  dt_agendamento: string
  hr_agendamento: string
  status: Status
  valor: number
  obs: string | null
  created_at: string
  pet: { nome: string; raca: string } | null
  servico: { nome: string; duracao: number } | null
  lojista: { nome_loja: string; telefone: string } | null
}

// Produto comprado junto de um agendamento (migration 039) — preço já é
// o cobrado no momento da compra, não o preço atual do catálogo.
export interface ProdutoComprado {
  nome: string
  unidade_venda: string
  quantidade: number
  preco_unitario: number
}

// TaxiDog pedido junto (migration 042) — a taxa já está dentro de `valor`,
// aqui ela aparece separada pro cliente entender o total.
export interface TaxiDogCliente {
  modalidade: ModalidadeTaxiDog
  status: string
  valor: number
  endereco: string
  temTaxiDog: boolean
}

interface Props {
  agendamentos: AgendamentoCliente[]
  // Avaliações que o próprio cliente já deixou, indexadas pelo agendamento
  // (no máximo uma por atendimento — UNIQUE no banco).
  avaliacoes: Record<string, AvaliacaoExistente>
  // Produtos comprados junto, indexados pelo agendamento — vazio na
  // maioria dos casos (produto é opcional no agendamento online).
  produtosComprados: Record<string, ProdutoComprado[]>
  taxidog: Record<string, TaxiDogCliente>
}

// Uma visita = mesmo pet, mesma loja, mesmo dia. Um carrinho com vários
// serviços vira vários agendamentos no banco (migration 022), mas pro
// cliente é uma ida só — então aparece como um card só.
interface Visita {
  chave: string
  dt: string
  itens: AgendamentoCliente[]
  status: Status
  valor: number
  criadoEm: string
  taxidog: TaxiDogCliente | null
  produtos: ProdutoComprado[]
}

const ORDEM: Status[] = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído']

// Status da visita: o do serviço "mais atrasado" entre os não cancelados
// (banho Concluído + tosa Em andamento = Em andamento); tudo cancelado =
// Cancelado.
function statusDaVisita(itens: AgendamentoCliente[]): Status {
  const ativos = itens.filter(i => i.status !== 'Cancelado')
  if (ativos.length === 0) return 'Cancelado'
  return ativos.reduce((menor, i) => (ORDEM.indexOf(i.status) < ORDEM.indexOf(menor) ? i.status : menor), ativos[0].status)
}

function montarVisitas(agendamentos: AgendamentoCliente[], taxidog: Props['taxidog'], produtos: Props['produtosComprados']): Visita[] {
  const grupos = new Map<string, AgendamentoCliente[]>()
  for (const ag of agendamentos) {
    const chave = `${ag.id_lojista}|${ag.id_pet}|${ag.dt_agendamento}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), ag])
  }
  return [...grupos.entries()].map(([chave, lista]) => {
    const itens = [...lista].sort((a, b) => a.hr_agendamento.localeCompare(b.hr_agendamento))
    const status = statusDaVisita(itens)
    const contam = status === 'Cancelado' ? itens : itens.filter(i => i.status !== 'Cancelado')
    return {
      chave,
      dt: itens[0].dt_agendamento,
      itens,
      status,
      valor: contam.reduce((soma, i) => soma + Number(i.valor), 0),
      criadoEm: itens.reduce((min, i) => (i.created_at < min ? i.created_at : min), itens[0].created_at),
      taxidog: itens.map(i => taxidog[i.id_agendamento]).find(Boolean) ?? null,
      produtos: itens.flatMap(i => produtos[i.id_agendamento] ?? []),
    }
  })
}

const primeiraHora = (v: Visita) => (v.itens.find(i => i.status !== 'Cancelado') ?? v.itens[0]).hr_agendamento

export default function AgendamentosClienteList({ agendamentos, avaliacoes, produtosComprados, taxidog }: Props) {
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [avaliando, setAvaliando] = useState<AgendamentoCliente | null>(null)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  const { proximas, historico } = useMemo(() => {
    const hoje = hojeBrasilISO()
    const visitas = montarVisitas(agendamentos, taxidog, produtosComprados)
    const ativa = (v: Visita) => ['Pendente', 'Confirmado', 'Em andamento'].includes(v.status) && v.dt >= hoje
    return {
      // Próximos: o mais perto primeiro. Histórico: o mais recente primeiro.
      proximas: visitas.filter(ativa).sort((a, b) => (a.dt + primeiraHora(a)).localeCompare(b.dt + primeiraHora(b))),
      historico: visitas.filter(v => !ativa(v)).sort((a, b) => (b.dt + primeiraHora(b)).localeCompare(a.dt + primeiraHora(a))),
    }
  }, [agendamentos, taxidog, produtosComprados])

  const [aba, setAba] = useState<'proximos' | 'historico'>(proximas.length > 0 ? 'proximos' : 'historico')

  function handleCancel(id: string) {
    setError(null)
    startTransition(async () => {
      const result = await cancelarAgendamentoAction(id, motivo || undefined)
      if (result?.error) setError(result.error)
      else {
        setCancelId(null)
        setMotivo('')
      }
    })
  }

  function alternar(chave: string) {
    setAbertas(prev => {
      const nova = new Set(prev)
      if (nova.has(chave)) nova.delete(chave)
      else nova.add(chave)
      return nova
    })
  }

  if (!agendamentos.length) {
    return (
      <div className="empty-state card">
        <IconCalendar style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Nenhum agendamento encontrado</div>
        <p>Você ainda não realizou nenhum agendamento</p>
      </div>
    )
  }

  const [destaque, ...demaisProximas] = proximas
  const lista = aba === 'proximos' ? demaisProximas : historico

  const renderDetalhes = (v: Visita) => (
    <div className="agc-detalhes">
      <div className="agc-servicos">
        {v.itens.map(ag => {
          const podeCanc = ['Pendente', 'Confirmado'].includes(ag.status)
          const cancelando = cancelId === ag.id_agendamento
          const avaliacao = avaliacoes[ag.id_agendamento]
          return (
            <div key={ag.id_agendamento} className="agc-servico">
              <div className="agc-servico-linha">
                <div style={{ minWidth: 0 }}>
                  <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{ag.servico?.nome ?? 'Serviço'}</div>
                  <div className="text-xs text-muted">{ag.hr_agendamento.slice(0, 5)} · {ag.servico?.duracao ?? '—'} min</div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  {v.itens.length > 1 && <span className={`badge ${classeBadgeStatus(ag.status)}`}>{rotuloStatus(ag.status)}</span>}
                  <span className="font-semibold text-success">{formatarReais(ag.valor)}</span>
                </div>
              </div>

              {/* Avaliação — só pra atendimento Finalizado ('Concluído'); a mesma
                  regra é conferida no banco (fn_criar_avaliacao). */}
              {ag.status === 'Concluído' && (
                avaliacao ? (
                  <div className="agc-avaliacao">
                    <span className="text-xs text-muted">Sua avaliação</span>
                    <Estrelas nota={avaliacao.nota} />
                    <button className="btn btn-ghost btn-sm" onClick={() => setAvaliando(ag)}>
                      <IconPencil style={{ width: 13, height: 13 }} /> Editar
                    </button>
                    {avaliacao.comentario && (
                      <p className="text-sm" style={{ color: 'var(--gray-300)', width: '100%', margin: 0, wordBreak: 'break-word' }}>
                        &ldquo;{avaliacao.comentario}&rdquo;
                      </p>
                    )}
                  </div>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => setAvaliando(ag)}>
                    <IconStar style={{ width: 14, height: 14 }} /> Avaliar atendimento
                  </button>
                )
              )}

              {podeCanc && !cancelando && (
                <button className="btn btn-ghost btn-sm agc-cancelar" onClick={() => { setCancelId(ag.id_agendamento); setMotivo('') }}>
                  <IconTrash style={{ width: 13, height: 13 }} /> {v.itens.length > 1 ? 'Cancelar este serviço' : 'Cancelar agendamento'}
                </button>
              )}

              {cancelando && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', width: '100%' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Motivo do cancelamento (opcional)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={motivo}
                      onChange={e => setMotivo(e.target.value)}
                      placeholder="Ex: compromisso de última hora"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-danger btn-sm" onClick={() => handleCancel(ag.id_agendamento)} disabled={isPending}>
                      {isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setCancelId(null); setMotivo('') }}>Voltar</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {v.taxidog && (
        <div className="agc-bloco">
          <div className="agc-bloco-titulo"><IconCar style={{ width: 13, height: 13 }} /> TaxiDog</div>
          <div className="flex items-center justify-between text-sm" style={{ gap: 'var(--space-3)' }}>
            <span style={{ color: 'var(--gray-300)' }}>
              {ROTULO_MODALIDADE[v.taxidog.modalidade]} · {rotuloStatusCorrida({ status: v.taxidog.status, modalidade: v.taxidog.modalidade, temTaxiDog: v.taxidog.temTaxiDog, statusAgendamento: v.status })}
            </span>
            <span className="font-semibold text-success">{formatarReais(v.taxidog.valor)}</span>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 2 }}>{v.taxidog.endereco}</div>
        </div>
      )}

      {v.produtos.length > 0 && (
        <div className="agc-bloco">
          <div className="agc-bloco-titulo"><IconPackage style={{ width: 13, height: 13 }} /> Produtos comprados</div>
          {v.produtos.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-sm" style={{ gap: 'var(--space-3)' }}>
              <span style={{ color: 'var(--gray-300)' }}>{p.nome} — {rotuloEstoque(p.quantidade, p.unidade_venda)}</span>
              <span className="font-semibold text-success">{formatarReais(p.preco_unitario * p.quantidade)}</span>
            </div>
          ))}
        </div>
      )}

      {v.itens.some(i => i.obs) && (
        <div className="agc-obs">{v.itens.map(i => i.obs).filter(Boolean).join(' · ')}</div>
      )}
    </div>
  )

  const renderVisita = (v: Visita, emDestaque = false) => {
    const dataObj = parseISO(v.dt)
    const aberta = emDestaque || abertas.has(v.chave)
    const loja = v.itens[0].lojista?.nome_loja ?? ''
    const novo = differenceInHours(new Date(), new Date(v.criadoEm)) < 24
    return (
      <div key={v.chave} className={`card agc-card ${emDestaque ? 'agc-card-destaque' : ''} ${v.status === 'Cancelado' ? 'agc-card-cancelada' : ''}`}>
        <button type="button" className="agc-resumo" onClick={() => !emDestaque && alternar(v.chave)} aria-expanded={aberta} disabled={emDestaque}>
          <div className="agc-data">
            <span className="agc-data-dia">{format(dataObj, 'dd')}</span>
            <span className="agc-data-mes">{format(dataObj, 'MMM', { locale: ptBR })}</span>
            <span className="agc-data-semana">{format(dataObj, 'EEE', { locale: ptBR })}</span>
          </div>
          <div className="agc-info">
            <div className="agc-servicos-titulo">{v.itens.map(i => i.servico?.nome ?? 'Serviço').join(' + ')}</div>
            <div className="text-sm text-muted">
              {v.itens[0].pet?.nome ?? 'Pet'} · {primeiraHora(v).slice(0, 5)}
            </div>
            <div className="agc-meta">
              <span className="flex items-center gap-1"><IconStore style={{ width: 12, height: 12 }} /> {loja}</span>
              <span>Agendado em {format(new Date(v.criadoEm), "dd/MM 'às' HH:mm")}</span>
            </div>
            <div className="flex gap-1" style={{ flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
              <span className={`badge ${classeBadgeStatus(v.status)}`}>{rotuloStatus(v.status)}</span>
              {v.taxidog && v.taxidog.status !== 'cancelada' && (
                <span className="badge badge-inativo" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  <IconCar style={{ width: 11, height: 11, marginRight: 3, verticalAlign: -1 }} />TaxiDog
                </span>
              )}
              {novo && <span className="badge badge-aceito" style={{ textTransform: 'none', letterSpacing: 0 }}>Novo</span>}
            </div>
          </div>
          <div className="agc-valor">
            <span className="font-semibold text-success">{formatarReais(v.valor)}</span>
            {v.taxidog && v.taxidog.status !== 'cancelada' && <span className="text-xs text-muted">inclui TaxiDog</span>}
            {!emDestaque && (
              <IconChevronRight className="agc-seta" style={{ width: 16, height: 16, transform: aberta ? 'rotate(90deg)' : 'none' }} />
            )}
          </div>
        </button>
        {aberta && renderDetalhes(v)}
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16 }} /><span>{error}</span>
        </div>
      )}

      {destaque && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div className="agc-secao-titulo">Seu próximo agendamento</div>
          {renderVisita(destaque, true)}
        </div>
      )}

      <div className="flex gap-2" style={{ marginBottom: 'var(--space-4)' }}>
        <button className={`btn btn-sm ${aba === 'proximos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAba('proximos')}>
          Próximos ({proximas.length})
        </button>
        <button className={`btn btn-sm ${aba === 'historico' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAba('historico')}>
          Histórico ({historico.length})
        </button>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-muted">
          {aba === 'proximos'
            ? (destaque ? 'Nenhum outro agendamento marcado.' : 'Você não tem agendamentos marcados.')
            : 'Nenhum agendamento anterior.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {lista.map(v => renderVisita(v))}
        </div>
      )}

      {avaliando && (
        <AvaliacaoModal
          idAgendamento={avaliando.id_agendamento}
          nomePet={avaliando.pet?.nome ?? 'Pet'}
          nomeServico={avaliando.servico?.nome ?? 'Serviço'}
          nomeLoja={avaliando.lojista?.nome_loja ?? ''}
          avaliacao={avaliacoes[avaliando.id_agendamento] ?? null}
          onClose={() => setAvaliando(null)}
        />
      )}
    </>
  )
}
