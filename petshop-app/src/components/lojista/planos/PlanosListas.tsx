'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarCobrancaPlanoAction, cancelarAssinaturaAction, type ResumoCancelamento } from '@/lib/actions-planos'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import {
  ROTULO_STATUS_COBRANCA,
  dataBR,
  statusCobrancaExibido,
  sufixoPeriodo,
  type Assinatura,
  type CobrancaDaLoja,
  type HistoricoPlano,
} from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { Folha, LinhaSwitch, Opcao, Segmentos } from '@/components/app/PecasApp'
import { IconAlert, IconCheck, IconMoney, IconSearch } from '@/components/icons'
import CobrancaPagamento from './CobrancaPagamento'
import BeneficiosBarra from './BeneficiosBarra'
import Ilustracao from '@/components/Ilustracao'
import './planos-tela.css'

// ── Assinaturas da loja ──
type FiltroAssinatura = 'ativa' | 'pendencia' | 'cancelada' | 'todas'
const FILTROS_ASSINATURA: [FiltroAssinatura, string][] = [
  ['ativa', 'Ativas'],
  ['pendencia', 'Com cobrança vencida'],
  ['cancelada', 'Canceladas'],
  ['todas', 'Todas'],
]

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function passaNoFiltro(a: Assinatura, f: FiltroAssinatura): boolean {
  if (f === 'todas') return true
  if (f === 'pendencia') return a.status === 'ativa' && a.cobrancas_vencidas > 0
  return a.status === f
}

export function AssinaturasLista({ assinaturas, buscaInicial = '', hojeISO }: { assinaturas: Assinatura[]; buscaInicial?: string; hojeISO: string }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<FiltroAssinatura>(buscaInicial ? 'todas' : 'ativa')
  const [busca, setBusca] = useState(buscaInicial)
  const [cancelando, setCancelando] = useState<Assinatura | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const termo = semAcento(busca.trim())
  const daBusca = termo
    ? assinaturas.filter(a => semAcento([a.cliente, a.pet, a.plano].filter(Boolean).join(' ')).includes(termo))
    : assinaturas
  const lista = daBusca.filter(a => passaNoFiltro(a, filtro))

  function cancelada(r: ResumoCancelamento | null) {
    const partes = [
      r?.cobrancas_canceladas ? `${r.cobrancas_canceladas} ${r.cobrancas_canceladas === 1 ? 'cobrança cancelada' : 'cobranças canceladas'} (${formatarReais(r.valor_cancelado)})` : null,
      r?.agendamentos_devolvidos ? `${r.agendamentos_devolvidos} ${r.agendamentos_devolvidos === 1 ? 'agendamento voltou' : 'agendamentos voltaram'} ao preço normal` : null,
    ].filter(Boolean)
    setInfo(`Assinatura cancelada.${partes.length ? ` ${partes.join(' · ')}.` : ''}`)
    setCancelando(null)
    router.refresh()
  }

  const statusSelo = (a: Assinatura) => a.status === 'cancelada'
    ? <span className="badge badge-inativo">Cancelada</span>
    : <span className="badge badge-concluido">Ativa</span>

  // Próxima renovação: a próxima cobrança gerada; cancelada não renova.
  const proxima = (a: Assinatura) => a.status === 'cancelada'
    ? `Cancelada em ${dataBR(a.cancelada_em)}`
    : a.proxima_cobranca ? dataBR(a.proxima_cobranca)
    : a.data_inicio > hojeISO ? `Começa em ${dataBR(a.data_inicio)}` : '—'

  const pendencia = (a: Assinatura) => a.status === 'ativa' && a.cobrancas_vencidas > 0
    ? <span className="pl-pendencia">{a.cobrancas_vencidas} {a.cobrancas_vencidas === 1 ? 'cobrança vencida' : 'cobranças vencidas'}</span>
    : null

  return (
    <>
      {info && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{info}</span>
        </div>
      )}

      <div className="pl-filtros">
        <div className="pl-busca">
          <IconSearch style={{ width: 16, height: 16 }} />
          <input className="form-input" type="search" placeholder="Buscar por cliente, pet ou plano" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar assinaturas" />
        </div>
        <div className="pl-segmentos" role="tablist" aria-label="Status">
          {FILTROS_ASSINATURA.map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={filtro === v} className={filtro === v ? 'is-ativo' : ''} onClick={() => setFiltro(v)}>
              {l}<span>{daBusca.filter(a => passaNoFiltro(a, v)).length}</span>
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="empty-state card">
          <Ilustracao nome="planos" altura={110} />
          <div className="empty-state-title">
            {assinaturas.length === 0 ? 'Nenhuma assinatura ainda' : 'Nenhuma assinatura encontrada'}
          </div>
          <p>
            {assinaturas.length === 0
              ? <>Na aba <Link href="/lojista/planos">Planos</Link>, use “Atribuir plano” para vincular um plano a um pet.</>
              : 'Mude a busca ou o filtro de status.'}
          </p>
        </div>
      ) : (
        <>
          {/* Computador: tabela. */}
          <div className="so-desktop">
          <div className="table-container">
            <table className="table pl-tabela">
              <thead>
                <tr>
                  <th>Cliente e pet</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Início</th>
                  <th>Próxima renovação</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.map(a => (
                  <tr key={a.id_assinatura}>
                    <td>
                      <div className="pl-tabela-quem">
                        <strong>{a.pet ?? 'Pet removido'}</strong>
                        <span>{a.cliente ?? 'Cliente removido'}</span>
                      </div>
                    </td>
                    <td>{a.plano}</td>
                    <td className="pl-num">{formatarReais(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)}</td>
                    <td>{statusSelo(a)}{pendencia(a)}</td>
                    <td className="pl-num">{dataBR(a.data_inicio)}</td>
                    <td className="pl-num">{proxima(a)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {a.id_cliente && (
                        <Link href={`/lojista/clientes/${a.id_cliente}`} className="btn btn-ghost btn-sm">Detalhes</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>

          {/* Celular: cards compactos. */}
          <div className="so-celular">
          <div className="pl-lista-cel">
            {lista.map(a => (
              <div key={a.id_assinatura} className="pl-assin-cel">
                <div className="pl-assin-cel-topo">
                  <div className="pl-tabela-quem">
                    <strong>{a.pet ?? 'Pet removido'} · {a.plano}</strong>
                    <span>{a.cliente ?? 'Cliente removido'}</span>
                  </div>
                  {statusSelo(a)}
                </div>
                <div className="pl-assin-cel-linha"><span>Valor</span><strong>{formatarReais(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)}</strong></div>
                <div className="pl-assin-cel-linha"><span>Início</span><strong>{dataBR(a.data_inicio)}</strong></div>
                <div className="pl-assin-cel-linha"><span>{a.status === 'cancelada' ? 'Situação' : 'Próxima renovação'}</span><strong>{proxima(a)}</strong></div>
                {pendencia(a)}
                {a.status === 'ativa' && a.periodo_atual && <BeneficiosBarra beneficios={a.periodo_atual.beneficios} />}
                <div className="pl-assin-cel-acoes">
                  {a.id_cliente && <Link href={`/lojista/clientes/${a.id_cliente}`} className="btn btn-secondary btn-sm">Detalhes</Link>}
                  {a.status === 'ativa' && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-500)' }} onClick={() => setCancelando(a)}>Cancelar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          </div>
        </>
      )}

      {cancelando && (
        <CancelarAssinaturaFolha
          key={cancelando.id_assinatura}
          assinatura={cancelando}
          onFechar={() => setCancelando(null)}
          onCancelada={cancelada}
        />
      )}
    </>
  )
}

// Celular: painel "Cancelar assinatura" do app — o que fazer com as
// cobranças em aberto e com os agendamentos que ainda usam o plano.
function CancelarAssinaturaFolha({ assinatura, onFechar, onCancelada }: {
  assinatura: Assinatura
  onFechar: () => void
  onCancelada: (resumo: ResumoCancelamento | null) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [cancelarCobrancas, setCancelarCobrancas] = useState(true)
  const [devolverAgendamentos, setDevolverAgendamentos] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function cancelar() {
    setErro(null)
    startTransition(async () => {
      const r = await cancelarAssinaturaAction(assinatura.id_assinatura, motivo, { cancelarCobrancas, devolverAgendamentos })
      if (r.error) {
        setErro(r.error)
        return
      }
      onCancelada(r.resumo ?? null)
    })
  }

  return (
    <Folha titulo="Cancelar assinatura" onFechar={onFechar} ocupado={isPending}>
      <span className="sub-app">{assinatura.pet ?? 'Pet'} — {assinatura.plano} ({assinatura.cliente ?? 'cliente'})</span>
      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}
      <LinhaSwitch
        titulo="Cancelar as cobranças em aberto"
        detalhe={assinatura.cobrancas_em_aberto > 0 ? `${assinatura.cobrancas_em_aberto} em aberto. Desligado, elas continuam a receber.` : 'Nenhuma em aberto agora.'}
        valor={cancelarCobrancas}
        onChange={setCancelarCobrancas}
      />
      <LinhaSwitch
        titulo="Devolver agendamentos ao preço normal"
        detalhe="Os agendamentos ainda por fazer que usam o plano voltam a ser cobrados avulsos."
        valor={devolverAgendamentos}
        onChange={setDevolverAgendamentos}
      />
      <div className="form-group">
        <label htmlFor="cancelar-motivo" className="form-label">Motivo (opcional)</label>
        <textarea id="cancelar-motivo" className="form-textarea" rows={2} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} />
      </div>
      <button type="button" className="botao-app is-perigo" onClick={cancelar} disabled={isPending}>
        {isPending ? 'Cancelando...' : 'Cancelar assinatura'}
      </button>
      <button type="button" className="botao-app is-secundario" onClick={onFechar} disabled={isPending}>Voltar</button>
    </Folha>
  )
}

// ── Cobranças da loja ──
// Os mesmos quatro filtros do app (lá "Pendentes" se chama "A vencer").
const FILTROS_CELULAR: { valor: 'pendentes' | 'vencidas' | 'pagas' | 'todas'; rotulo: string }[] = [
  { valor: 'pendentes', rotulo: 'A vencer' },
  { valor: 'vencidas', rotulo: 'Vencidas' },
  { valor: 'pagas', rotulo: 'Pagas' },
  { valor: 'todas', rotulo: 'Todas' },
]

const FILTROS_COBRANCA = [
  ['pendentes', 'Pendentes'],
  ['vencidas', 'Vencidas'],
  ['pagas', 'Pagas'],
  ['canceladas', 'Canceladas'],
  ['todas', 'Todas'],
] as const

export function CobrancasLista({ cobrancas, filtro, hojeISO, formasAceitas }: {
  cobrancas: CobrancaDaLoja[]
  filtro: string
  hojeISO: string
  formasAceitas: FormaPagamento[]
}) {
  const router = useRouter()
  const total = cobrancas.reduce((s, c) => s + Number(c.valor), 0)
  // Celular (igual ao app): tocar na cobrança abre o painel dela.
  const [aberta, setAberta] = useState<CobrancaDaLoja | null>(null)
  return (
    <>
      {/* Celular: a mesma aba "Cobranças" do app. */}
      <div className="so-celular">
        <div className="tela-app-pilha">
          <Segmentos
            valor={FILTROS_CELULAR.find(f => f.valor === filtro)?.valor ?? null}
            onChange={v => router.push(`/lojista/planos?aba=cobrancas&filtro=${v}`)}
            opcoes={FILTROS_CELULAR}
          />
          {cobrancas.length === 0 ? (
            <div className="dash-app-vazio">
              <span className="dash-app-vazio-icone"><IconMoney style={{ width: 26, height: 26 }} /></span>
              <strong>Nenhuma cobrança aqui</strong>
            </div>
          ) : (
            cobrancas.map(c => {
              const st = statusCobrancaExibido(c.status, c.vencimento, hojeISO)
              return (
                <button key={c.id_cobranca} type="button" className="dash-app-linha" onClick={() => setAberta(c)}>
                  <span className="dash-app-linha-info">
                    <span className="dash-app-linha-pet">{c.pet ?? 'Pet excluído'} — {c.plano}</span>
                    <span className="dash-app-linha-sub is-media">{c.cliente ?? 'Cliente excluído'}</span>
                    <span className="dash-app-linha-sub is-media">
                      Vence {dataBR(c.vencimento)}
                      {c.status === 'pago' && ehFormaPagamento(c.forma_pagamento) ? ` · ${ROTULO_FORMA_PAGAMENTO[c.forma_pagamento]}` : ''}
                    </span>
                  </span>
                  <span className="tela-app-lateral">
                    <strong>{formatarReais(c.valor)}</strong>
                    <span className={`dash-app-selo is-${st}`}>{ROTULO_STATUS_COBRANCA[st]}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
      {aberta && (
        <CobrancaFolha
          key={aberta.id_cobranca}
          cobranca={aberta}
          formas={formasAceitas}
          onFechar={() => setAberta(null)}
          onSalva={() => { setAberta(null); router.refresh() }}
        />
      )}

      <div className="so-desktop">
      <div className="planos-filtros">
        {FILTROS_COBRANCA.map(([v, l]) => (
          <button key={v} type="button" className={`btn btn-sm ${filtro === v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => router.push(`/lojista/planos?aba=cobrancas&filtro=${v}`)}>
            {l}
          </button>
        ))}
      </div>
      {cobrancas.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nenhuma cobrança aqui</div>
          <p>As cobranças nascem sozinhas no início de cada período das assinaturas.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted" style={{ margin: '0 0 var(--space-3)' }}>
            {cobrancas.length} cobrança{cobrancas.length !== 1 ? 's' : ''} · {formatarReais(total)}
          </p>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Cliente / Pet</th>
                    <th>Plano</th>
                    <th>Valor</th>
                    <th>Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {cobrancas.map(c => (
                    <tr key={c.id_cobranca}>
                      <td>
                        {dataBR(c.vencimento)}
                        {c.pago_em && <div className="text-xs text-muted">pago em {dataBR(c.pago_em)}</div>}
                      </td>
                      <td>
                        {c.id_cliente ? <Link href={`/lojista/clientes/${c.id_cliente}`}>{c.cliente}</Link> : 'Cliente removido'}
                        <div className="text-xs text-muted">{c.pet ?? '—'}</div>
                      </td>
                      <td>
                        {c.plano}
                        <div className="text-xs text-muted">
                          Período {c.numero} · {dataBR(c.periodo_inicio)} a {dataBR(c.periodo_fim)}
                          {c.assinatura_status === 'cancelada' && ' · assinatura cancelada'}
                        </div>
                      </td>
                      <td className="font-semibold text-success">{formatarReais(c.valor)}</td>
                      <td>
                        <CobrancaPagamento
                          idCobranca={c.id_cobranca}
                          forma={c.forma_pagamento}
                          status={c.status}
                          vencimento={c.vencimento}
                          hojeISO={hojeISO}
                          formasAceitas={formasAceitas}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </div>
    </>
  )
}

// Celular: painel "Cobrança do plano" do app — como pagou e a situação.
function CobrancaFolha({ cobranca, formas, onFechar, onSalva }: {
  cobranca: CobrancaDaLoja
  formas: FormaPagamento[]
  onFechar: () => void
  onSalva: () => void
}) {
  const formaAtual = ehFormaPagamento(cobranca.forma_pagamento) ? cobranca.forma_pagamento : null
  const [forma, setForma] = useState<FormaPagamento | null>(formaAtual ?? (formas.length === 1 ? formas[0] : null))
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // A forma já registrada continua na lista mesmo se a loja deixou de aceitar.
  const opcoes = formaAtual && !formas.includes(formaAtual) ? [formaAtual, ...formas] : formas

  function atualizar(status: 'pendente' | 'pago' | 'cancelado') {
    if (status === 'pago' && !forma) {
      setErro('Escolha como o cliente pagou.')
      return
    }
    setErro(null)
    startTransition(async () => {
      const r = await atualizarCobrancaPlanoAction(cobranca.id_cobranca, forma, status)
      if (r.error) {
        setErro(r.error)
        return
      }
      onSalva()
    })
  }

  return (
    <Folha titulo="Cobrança do plano" onFechar={onFechar} ocupado={isPending}>
      <span className="titulo-app">{cobranca.pet ?? 'Pet'} — {cobranca.plano}</span>
      <span className="sub-app">
        {formatarReais(cobranca.valor)} · vence {dataBR(cobranca.vencimento)} · período de {dataBR(cobranca.periodo_inicio)} a {dataBR(cobranca.periodo_fim)}
      </span>
      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}
      {cobranca.status !== 'cancelado' && (
        <>
          <span className="rotulo-app">Como pagou</span>
          <div className="tela-app-pilha is-junta" role="radiogroup" aria-label="Como pagou">
            {opcoes.map(f => (
              <Opcao key={f} titulo={ROTULO_FORMA_PAGAMENTO[f]} selecionada={forma === f} onClick={() => setForma(f)} />
            ))}
          </div>
        </>
      )}
      {cobranca.status === 'pendente' && (
        <button type="button" className="botao-app is-sucesso" onClick={() => atualizar('pago')} disabled={isPending}>
          <IconCheck style={{ width: 18, height: 18 }} /> Marcar como paga
        </button>
      )}
      {cobranca.status === 'pago' && (
        <button type="button" className="botao-app is-secundario" onClick={() => atualizar('pendente')} disabled={isPending}>Voltar para pendente</button>
      )}
      {cobranca.status === 'pendente' && (
        <button type="button" className="botao-app is-perigo" onClick={() => atualizar('cancelado')} disabled={isPending}>Cancelar esta cobrança</button>
      )}
      {cobranca.status === 'cancelado' && (
        <button type="button" className="botao-app is-secundario" onClick={() => atualizar('pendente')} disabled={isPending}>Reabrir cobrança</button>
      )}
    </Folha>
  )
}

// ── Histórico (planos, assinaturas, renovações, cobranças, usos) ──
export function HistoricoPlanosLista({ itens }: { itens: (HistoricoPlano & { cliente?: string | null; pet?: string | null; id_cliente?: string | null })[] }) {
  if (itens.length === 0) {
    return <div className="empty-state card"><div className="empty-state-title">Nada registrado ainda</div></div>
  }
  return (
    <div className="card">
      <ul className="plano-historico">
        {itens.map((h, i) => (
          <li key={i}>
            <span className="text-xs text-muted">{new Date(h.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <span>
              {h.pet && <strong>{h.pet}{h.cliente ? ` (${h.cliente})` : ''}: </strong>}
              {h.descricao}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
