'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  adicionarNaRotaAction,
  aprovarRotaAction,
  atribuirRotaAction,
  cancelarRotaAction,
  criarRotaAction,
  removerDaRotaAction,
  reordenarParadasAction,
} from '@/lib/actions-rotas'
import { formatarTelefone } from '@/lib/format'
import { ROTULO_MODALIDADE, type TaxiDogOpcao } from '@/lib/taxidog'
import {
  CLASSE_STATUS_ROTA,
  ROTULO_STATUS_ROTA,
  avisarMudancaPropria,
  contarPets,
  enderecoParada,
  formatarDistancia,
  formatarDuracao,
  horarioParada,
  linhasLoja,
  montarPlanoInicial,
  proximaParada,
  tituloParada,
  type Parada,
  type ParadaPlano,
  type Rota,
  type TrechoPendente,
} from '@/lib/taxidog-rotas'
import { useRecalculoRotas } from '@/lib/useRecalculoRotas'
import { IconAlert, IconCar, IconChevronLeft, IconChevronRight, IconClose, IconRoute, IconStore } from '@/components/icons'

// Página "Rotas" do TaxiDog (migration 053), em dois perfis:
//   • 'gestor' — dono, administrador ou gestão de agendamentos: monta rotas
//     com qualquer corrida, escolhe o TaxiDog e aprova as rotas que os
//     TaxiDogs montaram;
//   • 'taxidog' — monta rotas pra si com as corridas sem TaxiDog ou dele;
//     se a loja exigir, a rota espera aprovação antes de sair.
// A execução parada a parada fica em TaxiDogRotaExecucao (?rota=...).

export type PerfilRotas = 'gestor' | 'taxidog'

interface Props {
  perfil: PerfilRotas
  precisaAprovacao: boolean
  data: string
  hojeISO: string
  caminho: string
  rotas: Rota[]
  pendentes: TrechoPendente[]
  taxidogs: TaxiDogOpcao[]
  enderecoLoja: string
  googleConfigurado: boolean
}

const chaveTrecho = (t: Pick<TrechoPendente, 'id_corrida' | 'trecho'>) => `${t.id_corrida}:${t.trecho}`

function textoTrecho(t: TrechoPendente): string {
  if (t.trecho === 'busca') return `Buscar às ${t.hr_agendamento.slice(0, 5)}`
  return t.hr_fim_visita ? `Entregar após ${t.hr_fim_visita.slice(0, 5)}` : 'Entregar após o serviço'
}

function enderecoCurto(t: Pick<TrechoPendente, 'logradouro' | 'numero' | 'bairro'>): string {
  return `${t.logradouro}, ${t.numero} · ${t.bairro}`
}

// Plano (ainda sem gravar) com nomes, pra pré-visualizar a rota nova.
function descreverPlano(plano: ParadaPlano[], trechos: TrechoPendente[]) {
  const nome = (id: string) => trechos.find(t => t.id_corrida === id)?.pet_nome ?? 'Pet'
  return plano.map(p => {
    if (p.local === 'loja') {
      const deixar = p.itens.filter(i => i.acao === 'deixar_loja').map(i => nome(i.id_corrida))
      const pegar = p.itens.filter(i => i.acao === 'pegar_loja').map(i => nome(i.id_corrida))
      return { titulo: 'Pet Shop', detalhe: [deixar.length ? `Deixar ${deixar.join(' + ')}` : null, pegar.length ? `Pegar ${pegar.join(' + ')}` : null].filter(Boolean).join(' · ') }
    }
    const buscar = p.itens.filter(i => i.acao === 'embarcar').map(i => nome(i.id_corrida))
    const entregar = p.itens.filter(i => i.acao === 'entregar').map(i => nome(i.id_corrida))
    return { titulo: [buscar.length ? `Buscar ${buscar.join(' + ')}` : null, entregar.length ? `Entregar ${entregar.join(' + ')}` : null].filter(Boolean).join(' · '), detalhe: '' }
  })
}

export function trajetoTexto(r: Rota, googleConfigurado: boolean, falha?: string): string | null {
  if (!googleConfigurado) return null
  const distancia = formatarDistancia(r.distancia_m)
  if (distancia && r.calculo_versao === r.versao) return `${distancia} · ~${formatarDuracao(r.duracao_s)}`
  if (r.status === 'concluida' || r.status === 'cancelada') return null
  return falha ? 'distância indisponível' : 'calculando trajeto...'
}

export default function TaxiDogRotas({ perfil, precisaAprovacao, data, hojeISO, caminho, rotas, pendentes, taxidogs, enderecoLoja, googleConfigurado }: Props) {
  const router = useRouter()
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [criando, setCriando] = useState(false)
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const falhasCalculo = useRecalculoRotas(rotas, googleConfigurado)

  const dataObj = parseISO(data)
  const visiveis = rotas.filter(r => r.status !== 'cancelada')
  const paraAprovar = visiveis.filter(r => r.status === 'aguardando_aprovacao')
  const aberta = rotas.find(r => r.id_rota === abertaId) ?? null
  const paraBuscar = pendentes.filter(t => t.trecho === 'busca')
  const paraEntregar = pendentes.filter(t => t.trecho === 'entrega')
  const escolhidos = pendentes.filter(t => selecionados.has(chaveTrecho(t)))

  // Corridas que saíram da lista (entraram numa rota, foram pegas por
  // outro TaxiDog, canceladas) não podem continuar marcadas.
  const chavesPendentes = useMemo(() => new Set(pendentes.map(chaveTrecho)), [pendentes])
  const [chavesAnteriores, setChavesAnteriores] = useState(chavesPendentes)
  if (chavesPendentes !== chavesAnteriores) {
    setChavesAnteriores(chavesPendentes)
    setSelecionados(prev => new Set([...prev].filter(k => chavesPendentes.has(k))))
  }

  function alternar(chave: string) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  }

  function irParaDia(novaData: string) {
    setSelecionados(new Set())
    router.push(`${caminho}?data=${novaData}`)
  }

  // Gestão abre o detalhe (organizar); o TaxiDog vai pra tela da rota.
  function abrirRota(idRota: string) {
    if (perfil === 'gestor') setAbertaId(idRota)
    else router.push(`${caminho}?rota=${idRota}`)
  }

  const renderPendente = (t: TrechoPendente) => {
    const chave = chaveTrecho(t)
    const aguardandoAceite = t.status_agendamento === 'Pendente'
    const naoPronto = t.trecho === 'entrega' && t.status_corrida !== 'pronto_entrega'
    return (
      <label key={chave} className={`tdr-pendente ${aguardandoAceite ? 'is-bloqueado' : ''} ${selecionados.has(chave) ? 'is-marcado' : ''}`}>
        <input type="checkbox" checked={selecionados.has(chave)} disabled={aguardandoAceite} onChange={() => alternar(chave)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{t.pet_nome}</span>
            <span className="text-xs text-muted" style={{ flexShrink: 0 }}>{textoTrecho(t)}</span>
          </div>
          <div className="text-xs text-muted tdr-truncar">{enderecoCurto(t)}</div>
          <div className="text-xs text-muted">{t.cliente_nome} · {formatarTelefone(t.cliente_telefone)} · {ROTULO_MODALIDADE[t.modalidade]}</div>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {aguardandoAceite && <span className="badge badge-pendente tdr-badge">Aguardando aceite da loja</span>}
            {!aguardandoAceite && naoPronto && <span className="badge badge-inativo tdr-badge">Serviço ainda não terminou</span>}
            {!aguardandoAceite && t.trecho === 'entrega' && !naoPronto && <span className="badge badge-concluido tdr-badge">Pronto para entrega</span>}
            {t.id_funcionario && (
              <span className="badge badge-aceito tdr-badge">
                {perfil === 'taxidog' ? 'Sua corrida' : `Com ${t.funcionario_nome ?? 'TaxiDog'}`}
              </span>
            )}
          </div>
        </div>
      </label>
    )
  }

  const rotuloCriar = escolhidos.length === 0
    ? 'Selecione para montar uma rota'
    : perfil === 'taxidog' && precisaAprovacao
      ? `Montar rota com ${escolhidos.length} e enviar para aprovação`
      : `Montar rota com ${escolhidos.length}`

  return (
    <>
      <div className="kanban-toolbar">
        <div className="dash-day-nav">
          <button onClick={() => irParaDia(format(subDays(dataObj, 1), 'yyyy-MM-dd'))} aria-label="Dia anterior"><IconChevronLeft /></button>
          <span className="dash-day-label">{format(dataObj, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
          <button onClick={() => irParaDia(format(addDays(dataObj, 1), 'yyyy-MM-dd'))} aria-label="Próximo dia"><IconChevronRight /></button>
          {data !== hojeISO && (
            <button className="btn btn-ghost btn-sm" onClick={() => irParaDia(hojeISO)} style={{ marginLeft: 'var(--space-2)' }}>Hoje</button>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted" style={{ flexWrap: 'wrap' }}>
          <span><strong style={{ color: 'var(--gray-100)' }}>{paraBuscar.length}</strong> para buscar</span>
          <span><strong style={{ color: 'var(--gray-100)' }}>{paraEntregar.length}</strong> para entregar</span>
          <span><strong style={{ color: 'var(--gray-100)' }}>{visiveis.length}</strong> {visiveis.length === 1 ? 'rota' : 'rotas'}</span>
        </div>
      </div>

      {perfil === 'gestor' && paraAprovar.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            {paraAprovar.length === 1
              ? `A Rota #${paraAprovar[0].numero} (${paraAprovar[0].funcionario_nome ?? 'TaxiDog'}) está aguardando sua aprovação.`
              : `${paraAprovar.length} rotas estão aguardando sua aprovação.`}
          </span>
        </div>
      )}
      {perfil === 'gestor' && !googleConfigurado && (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-4)' }}>
          <IconRoute style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Distância e tempo das rotas aparecem quando o Google Maps for configurado (GOOGLE_MAPS_API_KEY com a Routes API ativada).</span>
        </div>
      )}
      {perfil === 'taxidog' && precisaAprovacao && (
        <p className="text-sm text-muted" style={{ margin: '0 0 var(--space-4)' }}>
          As rotas que você montar vão para aprovação da loja antes de sair.
        </p>
      )}

      <div className="tdr-grade">
        {/* Corridas que ainda não estão em rota */}
        <section className="card tdr-coluna">
          <h3 className="relatorio-secao-titulo">Corridas para rota</h3>
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted">
              {perfil === 'taxidog'
                ? 'Nenhuma corrida livre ou sua neste dia.'
                : 'Nada para organizar neste dia. Quando um cliente pedir TaxiDog, a corrida aparece aqui.'}
            </p>
          ) : (
            <>
              {paraBuscar.length > 0 && (
                <>
                  <div className="tdr-grupo">Para buscar ({paraBuscar.length})</div>
                  {paraBuscar.map(renderPendente)}
                </>
              )}
              {paraEntregar.length > 0 && (
                <>
                  <div className="tdr-grupo">Para entregar ({paraEntregar.length})</div>
                  {paraEntregar.map(renderPendente)}
                </>
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 'var(--space-3)' }}
                disabled={escolhidos.length === 0}
                onClick={() => setCriando(true)}
              >
                <IconRoute style={{ width: 15, height: 15 }} />
                {rotuloCriar}
              </button>
            </>
          )}
        </section>

        {/* Rotas do dia */}
        <section className="tdr-coluna">
          {visiveis.length === 0 ? (
            <div className="empty-state card">
              <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
              <div className="empty-state-title">{perfil === 'taxidog' ? 'Nenhuma rota sua neste dia' : 'Nenhuma rota neste dia'}</div>
              <p>Marque as corridas ao lado e monte uma rota.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {visiveis.map(r => (
                <CardRota
                  key={r.id_rota}
                  rota={r}
                  perfil={perfil}
                  trajeto={trajetoTexto(r, googleConfigurado, falhasCalculo[r.id_rota])}
                  onAbrir={() => abrirRota(r.id_rota)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {criando && (
        <NovaRota
          data={data}
          perfil={perfil}
          precisaAprovacao={precisaAprovacao}
          escolhidos={escolhidos}
          taxidogs={taxidogs}
          onFechar={() => setCriando(false)}
          onCriada={idRota => {
            setCriando(false)
            setSelecionados(new Set())
            abrirRota(idRota)
            router.refresh()
          }}
        />
      )}

      {aberta && (
        <DetalheRota
          rota={aberta}
          perfil={perfil}
          precisaAprovacao={precisaAprovacao}
          caminho={caminho}
          pendentes={pendentes}
          taxidogs={taxidogs}
          enderecoLoja={enderecoLoja}
          trajeto={trajetoTexto(aberta, googleConfigurado, falhasCalculo[aberta.id_rota])}
          falhaCalculo={falhasCalculo[aberta.id_rota]}
          onFechar={() => setAbertaId(null)}
        />
      )}
    </>
  )
}

function CardRota({ rota: r, perfil, trajeto, onAbrir }: { rota: Rota; perfil: PerfilRotas; trajeto: string | null; onAbrir: () => void }) {
  const proxima = r.status === 'em_andamento' ? proximaParada(r) : null
  const pets = contarPets(r)
  return (
    <button type="button" className={`card tdr-card-rota ${r.status === 'aguardando_aprovacao' ? 'is-aprovacao' : ''}`} onClick={onAbrir}>
      <div className="flex items-center justify-between gap-2">
        <span className="tdr-numero">Rota #{r.numero}</span>
        <span className={`badge ${CLASSE_STATUS_ROTA[r.status]}`}>{ROTULO_STATUS_ROTA[r.status]}</span>
      </div>
      {perfil === 'gestor' && (
        <div className="text-sm" style={{ color: 'var(--gray-300)' }}>TaxiDog: <strong>{r.funcionario_nome ?? 'sem TaxiDog'}</strong></div>
      )}
      <div className="text-sm text-muted">
        {r.paradas.length} {r.paradas.length === 1 ? 'parada' : 'paradas'} · {pets} {pets === 1 ? 'pet' : 'pets'}
        {trajeto ? ` · ${trajeto}` : ''}
      </div>
      {proxima && <div className="text-sm" style={{ color: 'var(--status-andamento-fg)' }}>Próxima: {tituloParada(proxima)}</div>}
      {r.ultima_alteracao && r.status !== 'concluida' && <div className="text-xs text-muted">Última alteração: {r.ultima_alteracao}</div>}
      {perfil === 'gestor' && r.status === 'aguardando_aprovacao' && <span className="text-sm text-accent">Revisar e aprovar →</span>}
    </button>
  )
}

function NovaRota({ data, perfil, precisaAprovacao, escolhidos, taxidogs, onFechar, onCriada }: {
  data: string
  perfil: PerfilRotas
  precisaAprovacao: boolean
  escolhidos: TrechoPendente[]
  taxidogs: TaxiDogOpcao[]
  onFechar: () => void
  onCriada: (idRota: string) => void
}) {
  // Sugestão: o TaxiDog que já tem as corridas escolhidas pelo Kanban.
  const [idTaxidog, setIdTaxidog] = useState(() => {
    const donos = [...new Set(escolhidos.map(t => t.id_funcionario).filter((x): x is string => !!x))]
    if (donos.length === 1) return donos[0]
    return taxidogs.length === 1 ? taxidogs[0].id_funcionario : ''
  })
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const previa = useMemo(() => descreverPlano(montarPlanoInicial(escolhidos), escolhidos), [escolhidos])

  function criar() {
    setErro(null)
    startTransition(async () => {
      const r = await criarRotaAction(data, perfil === 'gestor' ? idTaxidog || null : null, escolhidos.map(t => ({ id_corrida: t.id_corrida, trecho: t.trecho })))
      if (r.error || !r.id_rota) {
        setErro(r.error ?? 'Não foi possível montar a rota.')
        return
      }
      onCriada(r.id_rota)
    })
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Nova rota · {format(parseISO(data), 'dd/MM')}</h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar"><IconClose style={{ width: 15, height: 15 }} /></button>
        </div>
        <div className="modal-body">
          {erro && <div className="alert alert-error"><IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span></div>}
          {perfil === 'gestor' ? (
            <div className="form-group">
              <label className="form-label">TaxiDog</label>
              <select className="form-select" value={idTaxidog} onChange={e => setIdTaxidog(e.target.value)}>
                <option value="">Definir depois</option>
                {taxidogs.map(t => <option key={t.id_funcionario} value={t.id_funcionario}>{t.nome}</option>)}
              </select>
              {taxidogs.length === 0 && <span className="form-hint">Nenhum funcionário habilitado como TaxiDog — habilite em Equipe.</span>}
            </div>
          ) : (
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              A rota fica no seu nome.{precisaAprovacao ? ' Ela vai para aprovação da loja e você pode sair assim que aprovarem.' : ''}
            </p>
          )}
          <div className="form-label">Paradas (dá para reordenar depois)</div>
          <ol className="tdr-previa">
            {previa.map((p, i) => (
              <li key={i}>
                <strong>{p.titulo}</strong>
                {p.detalhe && <span className="text-xs text-muted"> — {p.detalhe}</span>}
              </li>
            ))}
          </ol>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending} onClick={criar}>
            {perfil === 'taxidog' && precisaAprovacao ? 'Enviar para aprovação' : 'Montar rota'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Detalhe/organização de uma rota: ordem das paradas, tirar e pôr pets,
// TaxiDog, aprovar, cancelar. Usado pela gestão (a partir do card) e pelo
// TaxiDog (botão "Editar paradas" da tela da rota).
export function DetalheRota({ rota: r, perfil, precisaAprovacao, caminho, pendentes, taxidogs, enderecoLoja, trajeto, falhaCalculo, onFechar }: {
  rota: Rota
  perfil: PerfilRotas
  precisaAprovacao: boolean
  caminho: string
  pendentes: TrechoPendente[]
  taxidogs: TaxiDogOpcao[]
  enderecoLoja: string
  trajeto: string | null
  falhaCalculo?: string
  onFechar: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const [adicionar, setAdicionar] = useState('')
  const [arrastando, setArrastando] = useState<string | null>(null)

  const gestor = perfil === 'gestor'
  const antesDeSair = r.status === 'planejamento' || r.status === 'aguardando_aprovacao' || r.status === 'aguardando_saida'
  const editavel = gestor ? antesDeSair || r.status === 'em_andamento' : r.status === 'aguardando_aprovacao' || r.status === 'aguardando_saida'
  const pendentesDaRota = r.paradas.filter(p => p.status === 'pendente')
  const idsPendentes = pendentesDaRota.map(p => p.id_parada)
  const [ordemLocal, setOrdemLocal] = useState(idsPendentes)
  const chaveOrdem = idsPendentes.join(',')
  const [chaveAnterior, setChaveAnterior] = useState(chaveOrdem)
  if (chaveOrdem !== chaveAnterior) {
    setChaveAnterior(chaveOrdem)
    setOrdemLocal(idsPendentes)
  }

  const fixas = r.paradas.filter(p => p.status !== 'pendente')
  const pendentesOrdenadas = ordemLocal.map(id => pendentesDaRota.find(p => p.id_parada === id)).filter((p): p is Parada => !!p)
  const exibidas = [...fixas, ...pendentesOrdenadas]
  const paraAdicionar = pendentes.filter(t => t.status_agendamento !== 'Pendente')

  function executar(acao: () => Promise<{ error?: string }>, depois?: () => void) {
    setErro(null)
    // O TaxiDog mexendo na própria rota não recebe "Rota atualizada".
    if (!gestor) avisarMudancaPropria(r.id_rota)
    startTransition(async () => {
      const res = await acao()
      if (res.error) {
        setErro(res.error)
        setOrdemLocal(idsPendentes)
        return
      }
      depois?.()
      router.refresh()
    })
  }

  function salvarOrdem(nova: string[]) {
    if (nova.join(',') === chaveOrdem) return
    setOrdemLocal(nova)
    executar(() => reordenarParadasAction(r.id_rota, nova))
  }

  function mover(id: string, delta: number) {
    const idx = ordemLocal.indexOf(id)
    const alvo = idx + delta
    if (idx < 0 || alvo < 0 || alvo >= ordemLocal.length) return
    const nova = [...ordemLocal]
    ;[nova[idx], nova[alvo]] = [nova[alvo], nova[idx]]
    salvarOrdem(nova)
  }

  function soltarSobre(idAlvo: string) {
    if (!arrastando || arrastando === idAlvo) return
    const nova = ordemLocal.filter(id => id !== arrastando)
    nova.splice(nova.indexOf(idAlvo), 0, arrastando)
    setOrdemLocal(nova)
  }

  const petsDaRota = [...new Map(r.paradas.flatMap(p => p.itens).map(i => [i.id_corrida, i])).values()]
  const rotuloCancelar = gestor && r.status === 'aguardando_aprovacao' && r.id_funcionario ? 'Recusar rota' : 'Cancelar rota'

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title flex items-center gap-2">
            Rota #{r.numero}
            <span className={`badge ${CLASSE_STATUS_ROTA[r.status]}`}>{ROTULO_STATUS_ROTA[r.status]}</span>
          </h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar"><IconClose style={{ width: 15, height: 15 }} /></button>
        </div>

        <div className="modal-body">
          {erro && <div className="alert alert-error"><IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span></div>}

          {gestor && r.status === 'aguardando_aprovacao' && (
            <div className="alert alert-warning">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
              <span style={{ flex: 1 }}>{r.funcionario_nome ?? 'O TaxiDog'} montou esta rota. Confira as paradas e aprove para ele poder sair.</span>
            </div>
          )}
          {!gestor && precisaAprovacao && r.status === 'aguardando_saida' && (
            <p className="text-xs text-muted" style={{ margin: 0 }}>Se você mudar as paradas, a rota volta para aprovação da loja.</p>
          )}

          <div className="tdr-resumo-rota">
            <div>
              <div className="text-xs text-muted">TaxiDog</div>
              {gestor && antesDeSair ? (
                <select
                  className="form-select"
                  value={r.id_funcionario ?? ''}
                  disabled={isPending}
                  onChange={e => executar(() => atribuirRotaAction(r.id_rota, e.target.value || null))}
                >
                  <option value="">Sem TaxiDog</option>
                  {taxidogs.map(t => <option key={t.id_funcionario} value={t.id_funcionario}>{t.nome}</option>)}
                  {r.id_funcionario && !taxidogs.some(t => t.id_funcionario === r.id_funcionario) && (
                    <option value={r.id_funcionario}>{r.funcionario_nome ?? 'TaxiDog atual'}</option>
                  )}
                </select>
              ) : (
                <div className="font-semibold">{r.funcionario_nome ?? '—'}</div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted">Trajeto</div>
              <div className="font-semibold">{trajeto ?? '—'}</div>
              {falhaCalculo && r.calculo_versao !== r.versao && <div className="text-xs text-muted">{falhaCalculo}</div>}
            </div>
            <div>
              <div className="text-xs text-muted">Pets</div>
              <div className="font-semibold">{contarPets(r)}</div>
            </div>
          </div>

          {r.status === 'em_andamento' && (
            <p className="text-xs text-muted" style={{ margin: 0 }}>A rota já saiu: as paradas feitas ficam travadas; dá para mexer nas próximas.</p>
          )}

          <ol className="tdr-paradas">
            {exibidas.map((p, idx) => {
              const pendente = p.status === 'pendente'
              const posPendente = ordemLocal.indexOf(p.id_parada)
              return (
                <li
                  key={p.id_parada}
                  className={`tdr-parada is-${p.status} ${arrastando === p.id_parada ? 'is-arrastando' : ''}`}
                  draggable={editavel && pendente && !isPending}
                  onDragStart={() => setArrastando(p.id_parada)}
                  onDragOver={e => { if (pendente && arrastando) { e.preventDefault(); soltarSobre(p.id_parada) } }}
                  onDragEnd={() => { if (arrastando) salvarOrdem(ordemLocal); setArrastando(null) }}
                >
                  <span className="tdr-parada-num">{p.status === 'concluida' ? '✓' : idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-semibold flex items-center gap-1" style={{ color: 'var(--gray-100)' }}>
                      {p.local === 'loja' && <IconStore style={{ width: 13, height: 13 }} />}
                      {tituloParada(p)}
                      {p.status === 'chegou' && <span className="badge badge-em-andamento tdr-badge">TaxiDog aqui</span>}
                    </div>
                    {p.local === 'loja'
                      ? linhasLoja(p).map(l => <div key={l} className="text-sm" style={{ color: 'var(--gray-300)' }}>{l}</div>)
                      : <div className="text-xs text-muted tdr-truncar">{enderecoParada(p, enderecoLoja)}{horarioParada(p) ? ` · ${horarioParada(p)}` : ''}</div>}
                    {editavel && pendente && p.local === 'cliente' && p.itens.map(i => (
                      <button key={i.id_item} type="button" className="tdr-remover" disabled={isPending}
                        onClick={() => executar(() => removerDaRotaAction(r.id_rota, i.id_corrida))}>
                        Tirar {i.pet_nome} da rota
                      </button>
                    ))}
                  </div>
                  {editavel && pendente && (
                    <div className="tdr-mover">
                      <button type="button" aria-label="Subir" disabled={isPending || posPendente === 0} onClick={() => mover(p.id_parada, -1)}>↑</button>
                      <button type="button" aria-label="Descer" disabled={isPending || posPendente === ordemLocal.length - 1} onClick={() => mover(p.id_parada, 1)}>↓</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {editavel && pendentesDaRota.length > 1 && (
            <p className="text-xs text-muted" style={{ margin: 0 }}>Arraste as paradas (ou use ↑ ↓) para mudar a ordem. As idas ao Pet Shop se ajustam sozinhas.</p>
          )}

          {editavel && paraAdicionar.length > 0 && (
            <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="form-select" style={{ flex: 1, minWidth: 200 }} value={adicionar} onChange={e => setAdicionar(e.target.value)}>
                <option value="">Adicionar corrida à rota...</option>
                {paraAdicionar.map(t => (
                  <option key={chaveTrecho(t)} value={chaveTrecho(t)}>
                    {t.trecho === 'busca' ? 'Buscar' : 'Entregar'} {t.pet_nome} · {textoTrecho(t)}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!adicionar || isPending}
                onClick={() => {
                  const [idCorrida, trecho] = adicionar.split(':') as [string, 'busca' | 'entrega']
                  executar(() => adicionarNaRotaAction(r.id_rota, idCorrida, trecho), () => setAdicionar(''))
                }}>
                Adicionar
              </button>
            </div>
          )}

          {petsDaRota.length > 0 && (
            <div className="text-xs text-muted">
              Contatos: {petsDaRota.map(i => `${i.pet_nome} (${i.cliente_nome} · ${formatarTelefone(i.cliente_telefone)})`).join(' · ')}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="flex gap-2">
            {antesDeSair && (confirmandoCancelar ? (
              <>
                <button className={`btn btn-danger btn-sm ${isPending ? 'btn-loading' : ''}`} disabled={isPending}
                  onClick={() => executar(() => cancelarRotaAction(r.id_rota), onFechar)}>Confirmar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmandoCancelar(false)}>Voltar</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmandoCancelar(true)}>{rotuloCancelar}</button>
            ))}
            {gestor && r.status !== 'planejamento' && (
              <Link href={`${caminho}?rota=${r.id_rota}`} className="btn btn-ghost btn-sm">Tela do TaxiDog</Link>
            )}
          </div>
          <div className="flex gap-2">
            {gestor && r.status === 'aguardando_aprovacao' && (
              <button className={`btn btn-primary btn-sm ${isPending ? 'btn-loading' : ''}`} disabled={isPending}
                onClick={() => executar(() => aprovarRotaAction(r.id_rota))}>
                Aprovar rota
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
