'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { assumirCorridaAction, atribuirCorridaAction, avancarCorridaAction, cancelarCorridaAction } from '@/lib/actions-taxidog'
import { formatarTelefone } from '@/lib/format'
import {
  ROTULO_GRUPO,
  ROTULO_MODALIDADE,
  enderecoEmUmaLinha,
  formatarCep,
  formatarKm,
  formatarReais,
  grupoCorrida,
  podeReatribuir,
  proximaAcaoCorrida,
  rotuloStatusCorrida,
  type CorridaDetalhe,
  type GrupoCorrida,
} from '@/lib/taxidog'
import {
  IconAlert,
  IconCar,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDog,
  IconMapPin,
  IconRoute,
  IconUserBadge,
  IconWhatsapp,
} from '@/components/icons'

interface Props {
  idLojista: string
  data: string
  hojeISO: string
  corridas: CorridaDetalhe[]
  taxidogs: { id_funcionario: string; nome: string }[]
  // Responsável pela loja ou administrador — mesma regra de
  // fn_atribuir_corrida/fn_cancelar_corrida no banco.
  podeAtribuir: boolean
  // Quem vê o painel tem a função TaxiDog: pode pegar uma corrida sem
  // TaxiDog pra si ("Atribuir para mim", migration 046).
  podeAssumir?: boolean
  // Funcionário que só é TaxiDog: vê as corridas dele + as sem TaxiDog
  // (o banco já filtra), e as etapas ficam em botões no próprio card.
  modoMotorista?: boolean
}

const COLUNAS: { grupo: GrupoCorrida; cor: string; badge: string; vazio: string }[] = [
  { grupo: 'pendentes', cor: 'var(--status-aguardando-solid)', badge: 'badge-pendente', vazio: 'Nenhuma corrida esperando TaxiDog.' },
  { grupo: 'atribuidas', cor: 'var(--status-aceito-solid)', badge: 'badge-aceito', vazio: 'Nenhuma corrida atribuída aguardando saída.' },
  { grupo: 'andamento', cor: 'var(--status-andamento-solid)', badge: 'badge-em-andamento', vazio: 'Nenhum TaxiDog na rua agora.' },
  { grupo: 'concluidas', cor: 'var(--status-concluido-solid)', badge: 'badge-concluido', vazio: 'Nenhuma corrida concluída ainda.' },
]

const VAZIO_MOTORISTA: Record<GrupoCorrida, string> = {
  pendentes: 'Nenhuma corrida disponível agora.',
  atribuidas: 'Nenhuma corrida sua aguardando saída.',
  andamento: 'Você não está em nenhuma corrida agora.',
  concluidas: 'Nenhuma corrida concluída neste dia.',
}

function classeBadge(c: CorridaDetalhe): string {
  if (c.status === 'cancelada') return 'badge-cancelado'
  const grupo = grupoCorrida(c.status, !!c.id_funcionario)
  return COLUNAS.find(col => col.grupo === grupo)?.badge ?? 'badge-inativo'
}

function rotulo(c: CorridaDetalhe): string {
  return rotuloStatusCorrida({ status: c.status, modalidade: c.modalidade, temTaxiDog: !!c.id_funcionario, statusAgendamento: c.status_agendamento })
}

function linkRota(c: CorridaDetalhe): string {
  const destino = `${enderecoEmUmaLinha(c)}, ${formatarCep(c.cep)}, Brasil`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`
}

export default function TaxiDogPainel({ idLojista, data, hojeISO, corridas, taxidogs, podeAtribuir, podeAssumir = false, modoMotorista = false }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Qual card disparou a ação — só ele mostra o "carregando".
  const [idEmAcao, setIdEmAcao] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)

  const aberta = corridas.find(c => c.id_corrida === abertaId) ?? null
  const dataObj = parseISO(data)

  // Qualquer mudança numa corrida da loja (TaxiDog apertou "Cheguei",
  // agendamento finalizado virou "pronto para entrega"…) recarrega o
  // painel — mesmo mecanismo do som de novo agendamento (Realtime).
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`taxidog-painel-${idLojista}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${idLojista}` }, () => router.refresh())
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [idLojista, router])

  const grupos = useMemo(() => {
    const g: Record<GrupoCorrida, CorridaDetalhe[]> = { pendentes: [], atribuidas: [], andamento: [], concluidas: [] }
    for (const c of corridas) {
      const k = grupoCorrida(c.status, !!c.id_funcionario)
      if (k) g[k].push(c)
    }
    return g
  }, [corridas])

  const contadas = modoMotorista ? corridas.filter(c => c.id_funcionario) : corridas
  const canceladas = contadas.filter(c => c.status === 'cancelada').length
  const totalCorridas = contadas.length - canceladas
  const totalDia = contadas.filter(c => c.status !== 'cancelada').reduce((soma, c) => soma + c.valor, 0)

  function irParaDia(novaData: string) {
    router.push(`/lojista/taxidog?data=${novaData}`)
  }

  function executar(acao: () => Promise<{ error?: string }>, idCorrida?: string) {
    setErro(null)
    setIdEmAcao(idCorrida ?? null)
    startTransition(async () => {
      const result = await acao()
      if (result?.error) {
        setErro(result.error)
        return
      }
      setConfirmandoCancelamento(false)
      router.refresh()
    })
  }

  const seletorDe = (c: CorridaDetalhe) => (
    <SeletorTaxiDog
      c={c}
      podeAtribuir={podeAtribuir}
      taxidogs={taxidogs}
      disabled={isPending}
      onAtribuir={id => executar(() => atribuirCorridaAction(c.id_corrida, id))}
    />
  )

  return (
    <>
      <div className="kanban-toolbar">
        <div className="dash-day-nav">
          <button onClick={() => irParaDia(format(subDays(dataObj, 1), 'yyyy-MM-dd'))} aria-label="Dia anterior">
            <IconChevronLeft />
          </button>
          <span className="dash-day-label">{format(dataObj, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
          <button onClick={() => irParaDia(format(addDays(dataObj, 1), 'yyyy-MM-dd'))} aria-label="Próximo dia">
            <IconChevronRight />
          </button>
          {data !== hojeISO && (
            <button className="btn btn-ghost btn-sm" onClick={() => irParaDia(hojeISO)} style={{ marginLeft: 'var(--space-2)' }}>
              Hoje
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted" style={{ flexWrap: 'wrap' }}>
          <span><strong style={{ color: 'var(--gray-100)' }}>{totalCorridas}</strong> {totalCorridas === 1 ? 'corrida' : 'corridas'}</span>
          <span>Total do dia <strong className="text-success">{formatarReais(totalDia)}</strong></span>
          {canceladas > 0 && <span>{canceladas} cancelada{canceladas > 1 ? 's' : ''}</span>}
        </div>
      </div>

      {podeAtribuir && taxidogs.length === 0 && corridas.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Nenhum funcionário está habilitado como TaxiDog. Habilite em Equipe para poder atribuir as corridas.</span>
        </div>
      )}

      {erro && !aberta && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}

      {corridas.length === 0 ? (
        <div className="empty-state card">
          <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhuma corrida neste dia</div>
          <p>
            {modoMotorista
              ? 'Quando um cliente pedir TaxiDog, a corrida aparece aqui para você pegar — ou a loja atribui a você.'
              : 'As corridas aparecem aqui quando um cliente pede TaxiDog no agendamento.'}
          </p>
        </div>
      ) : (
        <div className="kanban-columns">
          {COLUNAS.map(col => (
            <div key={col.grupo} className="kanban-column">
              <div className="kanban-column-header" style={{ borderTopColor: col.cor }}>
                <span>{ROTULO_GRUPO[col.grupo]}</span>
                <span className={`badge ${col.badge}`}>{grupos[col.grupo].length}</span>
              </div>
              <div className="kanban-column-body">
                {grupos[col.grupo].length === 0 ? (
                  <p className="text-sm text-muted" style={{ padding: 'var(--space-3)' }}>{modoMotorista ? VAZIO_MOTORISTA[col.grupo] : col.vazio}</p>
                ) : grupos[col.grupo].map(c => (
                  <div
                    key={c.id_corrida}
                    className="kanban-card"
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setAbertaId(c.id_corrida); setErro(null); setConfirmandoCancelamento(false) }}
                    onKeyDown={e => { if (e.key === 'Enter') setAbertaId(c.id_corrida) }}
                  >
                    <div className="kanban-card-top">
                      <div className="kanban-card-time">{c.hr_agendamento.slice(0, 5)}</div>
                      <span className="text-sm font-semibold text-success">{formatarReais(c.valor)}</span>
                    </div>
                    <div className="kanban-card-main">
                      <span className="pet-avatar">
                        {c.pet_foto_url
                          // eslint-disable-next-line @next/next/no-img-element -- URL pública do Storage
                          ? <img src={c.pet_foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <IconDog style={{ width: 14, height: 14, color: 'var(--gray-500)' }} />}
                      </span>
                      <span className="kanban-card-pet">{c.pet_nome}</span>
                    </div>
                    <div className="kanban-card-line">{c.cliente_nome} · {formatarTelefone(c.cliente_telefone)}</div>
                    <div className="kanban-card-line" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={enderecoEmUmaLinha(c)}>
                      {c.bairro} · {c.logradouro}, {c.numero}
                    </div>
                    <div className="flex gap-1" style={{ flexWrap: 'wrap', margin: 'var(--space-1) 0' }}>
                      <span className="badge badge-inativo" style={{ textTransform: 'none', letterSpacing: 0 }}>{ROTULO_MODALIDADE[c.modalidade]}</span>
                      {/* Sem TaxiDog, na visão do TaxiDog, o botão do card já diz o estado. */}
                      {!(modoMotorista && !c.id_funcionario) && (
                        <span className={`badge ${classeBadge(c)}`} style={{ textTransform: 'none', letterSpacing: 0 }}>{rotulo(c)}</span>
                      )}
                    </div>
                    {/* O TaxiDog não precisa ver o próprio nome em todo card. */}
                    {!modoMotorista && (
                      <div className="kanban-card-prof" onClick={e => e.stopPropagation()}>
                        <IconUserBadge style={{ width: 12, height: 12, flexShrink: 0 }} />
                        {seletorDe(c)}
                      </div>
                    )}
                    <AcaoDoCard
                      c={c}
                      podeAssumir={podeAssumir && !podeAtribuir}
                      etapasNoCard={modoMotorista}
                      isPending={isPending}
                      carregando={isPending && idEmAcao === c.id_corrida}
                      onAssumir={() => executar(() => assumirCorridaAction(c.id_corrida), c.id_corrida)}
                      onAvancar={status => executar(() => avancarCorridaAction(c.id_corrida, status), c.id_corrida)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {aberta && (
        <DetalheCorrida
          corrida={aberta}
          erro={erro}
          isPending={isPending}
          podeAtribuir={podeAtribuir}
          mostrarEtapas={!modoMotorista}
          confirmandoCancelamento={confirmandoCancelamento}
          seletor={seletorDe(aberta)}
          onFechar={() => { setAbertaId(null); setErro(null); setConfirmandoCancelamento(false) }}
          onAvancar={status => executar(() => avancarCorridaAction(aberta.id_corrida, status))}
          onPedirCancelamento={() => setConfirmandoCancelamento(true)}
          onDesistirCancelamento={() => setConfirmandoCancelamento(false)}
          onCancelar={() => executar(() => cancelarCorridaAction(aberta.id_corrida))}
        />
      )}
    </>
  )
}

// Botão no próprio card. Sem TaxiDog: "Aguardando aceite da loja"
// (amarelo, enquanto o agendamento está Pendente) ou "Atribuir para mim".
// Na visão do TaxiDog, também a próxima etapa ("Cheguei", "Pet
// entregue"...) — sem precisar abrir o detalhe.
function AcaoDoCard({ c, podeAssumir, etapasNoCard, isPending, carregando, onAssumir, onAvancar }: {
  c: CorridaDetalhe
  podeAssumir: boolean
  etapasNoCard: boolean
  isPending: boolean
  carregando: boolean
  onAssumir: () => void
  onAvancar: (status: string) => void
}) {
  const pendenteNaLoja = c.status_agendamento === 'Pendente'
  const aguardandoAceite = (
    <div className="kanban-card-acao">
      <button type="button" className="btn btn-sm btn-aguardando" disabled>Aguardando aceite da loja</button>
    </div>
  )

  if (!c.id_funcionario) {
    if (!podeAssumir || !podeReatribuir(c.status)) return null
    if (pendenteNaLoja) return aguardandoAceite
    return (
      <div className="kanban-card-acao" onClick={e => e.stopPropagation()}>
        <div className="text-xs font-semibold" style={{ color: 'var(--status-aceito-fg)', marginBottom: 'var(--space-1)' }}>
          Disponível para atribuição
        </div>
        <button type="button" className={`btn btn-primary btn-sm ${carregando ? 'btn-loading' : ''}`} disabled={isPending} onClick={onAssumir}>
          Atribuir para mim
        </button>
      </div>
    )
  }

  if (!etapasNoCard) return null
  const acao = proximaAcaoCorrida(c.status, c.modalidade)
  if (acao?.status === 'a_caminho_cliente' && pendenteNaLoja) return aguardandoAceite
  if (acao) {
    return (
      <div className="kanban-card-acao" onClick={e => e.stopPropagation()}>
        <button type="button" className={`btn btn-primary btn-sm ${carregando ? 'btn-loading' : ''}`} disabled={isPending} onClick={() => onAvancar(acao.status)}>
          {acao.rotulo}
        </button>
      </div>
    )
  }
  if (c.status === 'entregue_loja' || (c.status === 'agendada' && c.modalidade === 'entregar')) {
    return <p className="kanban-card-acao text-xs text-muted" style={{ margin: 'var(--space-2) 0 0' }}>Aguardando o serviço terminar para a entrega</p>
  }
  return null
}

function SeletorTaxiDog({ c, podeAtribuir, taxidogs, disabled, onAtribuir }: {
  c: CorridaDetalhe
  podeAtribuir: boolean
  taxidogs: { id_funcionario: string; nome: string }[]
  disabled: boolean
  onAtribuir: (idFuncionario: string | null) => void
}) {
  if (!podeAtribuir || !podeReatribuir(c.status)) {
    return <span>{c.funcionario_nome ?? 'Sem TaxiDog'}</span>
  }
  return (
    <select
      className="form-select"
      style={{ padding: '2px 28px 2px 8px', fontSize: '0.8125rem', width: '100%' }}
      value={c.id_funcionario ?? ''}
      disabled={disabled}
      onClick={e => e.stopPropagation()}
      onChange={e => onAtribuir(e.target.value || null)}
    >
      <option value="">Sem TaxiDog (pendente)</option>
      {taxidogs.map(t => <option key={t.id_funcionario} value={t.id_funcionario}>{t.nome}</option>)}
      {c.id_funcionario && !taxidogs.some(t => t.id_funcionario === c.id_funcionario) && (
        <option value={c.id_funcionario}>{c.funcionario_nome ?? 'TaxiDog atual'}</option>
      )}
    </select>
  )
}

function DetalheCorrida({
  corrida: c, erro, isPending, podeAtribuir, mostrarEtapas, confirmandoCancelamento, seletor,
  onFechar, onAvancar, onPedirCancelamento, onDesistirCancelamento, onCancelar,
}: {
  corrida: CorridaDetalhe
  erro: string | null
  isPending: boolean
  podeAtribuir: boolean
  // Na visão do TaxiDog as etapas ficam no card, não aqui.
  mostrarEtapas: boolean
  confirmandoCancelamento: boolean
  seletor: React.ReactNode
  onFechar: () => void
  onAvancar: (status: string) => void
  onPedirCancelamento: () => void
  onDesistirCancelamento: () => void
  onCancelar: () => void
}) {
  const acao = mostrarEtapas ? proximaAcaoCorrida(c.status, c.modalidade) : null
  const precisaTaxiDog = !!acao && (acao.status === 'a_caminho_cliente' || acao.status === 'a_caminho_entrega') && !c.id_funcionario
  // Mesma regra de fn_avancar_corrida (migration 043): a busca só sai
  // depois de a loja aceitar o agendamento.
  const aguardandoAceite = acao?.status === 'a_caminho_cliente' && c.status_agendamento === 'Pendente'
  const encerrada = c.status === 'concluida' || c.status === 'cancelada'
  const comportamento = (c.pet_comportamento ?? []).filter(Boolean)

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title flex items-center gap-2">
            <IconCar style={{ width: 17, height: 17 }} /> {c.pet_nome}
            <span className={`badge ${classeBadge(c)}`} style={{ textTransform: 'none', letterSpacing: 0 }}>{rotulo(c)}</span>
          </h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar">
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div className="modal-body">
          {erro && (
            <div className="alert alert-error">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
            </div>
          )}

          <div className="dash-detail-row"><span>Tutor</span><span>{c.cliente_nome}</span></div>
          <div className="dash-detail-row">
            <span>Telefone</span>
            <span className="flex items-center gap-2">
              {formatarTelefone(c.cliente_telefone)}
              <a href={`https://wa.me/55${c.cliente_telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-accent" aria-label="WhatsApp">
                <IconWhatsapp style={{ width: 14, height: 14 }} />
              </a>
            </span>
          </div>
          <div className="dash-detail-row">
            <span>Endereço</span>
            <span style={{ textAlign: 'right' }}>
              {enderecoEmUmaLinha(c)}<br />
              <span className="text-xs text-muted">CEP {formatarCep(c.cep)}</span>
            </span>
          </div>
          <div className="dash-detail-row">
            <span>Horário</span>
            <span>{format(parseISO(c.dt_agendamento), 'dd/MM/yyyy')} às {c.hr_agendamento.slice(0, 5)}</span>
          </div>
          <div className="dash-detail-row"><span>Tipo de transporte</span><span>{ROTULO_MODALIDADE[c.modalidade]}</span></div>
          <div className="dash-detail-row">
            <span>Valor da corrida</span>
            <span style={{ textAlign: 'right' }}>
              <span className="font-semibold text-success">{formatarReais(c.valor)}</span>
              {(c.criterio || c.distancia_km != null) && (
                <><br /><span className="text-xs text-muted">{[c.criterio, c.distancia_km != null ? `~${formatarKm(c.distancia_km)}` : null].filter(Boolean).join(' · ')}</span></>
              )}
            </span>
          </div>
          {c.servicos && <div className="dash-detail-row"><span>Serviço</span><span>{c.servicos}</span></div>}
          <div className="dash-detail-row"><span>TaxiDog responsável</span><span style={{ minWidth: 180 }}>{seletor}</span></div>

          {(c.obs_agendamento || c.pet_obs || comportamento.length > 0 || c.pet_obs_comportamento) && (
            <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--gray-850)', borderRadius: 'var(--radius-md)' }}>
              <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Observações importantes</div>
              {comportamento.length > 0 && (
                <div className="flex gap-1" style={{ flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                  {comportamento.map(t => <span key={t} className="badge badge-pendente" style={{ textTransform: 'none', letterSpacing: 0 }}>{t}</span>)}
                </div>
              )}
              {[c.obs_agendamento, c.pet_obs, c.pet_obs_comportamento].filter(Boolean).map((o, i) => (
                <p key={i} className="text-sm" style={{ color: 'var(--gray-200)', margin: '2px 0' }}>{o}</p>
              ))}
            </div>
          )}

          {c.eventos.length > 0 && (
            <div style={{ marginTop: 'var(--space-5)' }}>
              <div className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>Histórico da corrida</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {c.eventos.map((e, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-muted" style={{ width: 44, flexShrink: 0 }}>{format(parseISO(e.created_at), 'HH:mm')}</span>
                    <span style={{ color: 'var(--gray-200)' }}>{e.descricao}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirmandoCancelamento && (
            <div className="alert alert-warning" style={{ marginTop: 'var(--space-4)' }}>
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span>
                Cancelar só o TaxiDog? O agendamento continua, e a taxa de {formatarReais(c.valor)} sai do valor dele.
              </span>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="flex gap-2">
            <a href={linkRota(c)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              <IconRoute style={{ width: 14, height: 14 }} /> Abrir rota
            </a>
            {podeAtribuir && !encerrada && (
              confirmandoCancelamento ? (
                <>
                  <button className={`btn btn-danger btn-sm ${isPending ? 'btn-loading' : ''}`} disabled={isPending} onClick={onCancelar}>Confirmar cancelamento</button>
                  <button className="btn btn-ghost btn-sm" onClick={onDesistirCancelamento}>Voltar</button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={onPedirCancelamento}>Cancelar TaxiDog</button>
              )
            )}
          </div>
          {acao && !confirmandoCancelamento && (
            <div className="flex items-center gap-2">
              {aguardandoAceite
                ? <span className="text-xs text-muted flex items-center gap-1"><IconAlert style={{ width: 12, height: 12 }} /> Aceite o agendamento antes</span>
                : precisaTaxiDog && <span className="text-xs text-muted flex items-center gap-1"><IconMapPin style={{ width: 12, height: 12 }} /> Atribua um TaxiDog antes</span>}
              <button
                className={`btn btn-primary btn-sm ${isPending ? 'btn-loading' : ''}`}
                disabled={isPending || precisaTaxiDog || aguardandoAceite}
                onClick={() => onAvancar(acao.status)}
              >
                {acao.rotulo}
              </button>
            </div>
          )}
          {mostrarEtapas && !acao && c.status === 'entregue_loja' && (
            <span className="text-sm text-muted">Aguardando o serviço terminar para a entrega</span>
          )}
          {mostrarEtapas && !acao && c.status === 'agendada' && c.modalidade === 'entregar' && (
            <span className="text-sm text-muted">A entrega libera quando o serviço for finalizado</span>
          )}
        </div>
      </div>
    </div>
  )
}
