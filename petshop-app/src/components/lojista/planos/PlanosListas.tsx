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
import { IconAlert, IconCheck, IconMoney, IconRepeat, IconUsers } from '@/components/icons'
import CobrancaPagamento from './CobrancaPagamento'
import BeneficiosBarra from './BeneficiosBarra'

// ── Assinaturas da loja ──
export function AssinaturasLista({ assinaturas }: { assinaturas: Assinatura[] }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<'ativa' | 'cancelada' | 'todas'>('ativa')
  const lista = assinaturas.filter(a => filtro === 'todas' || a.status === filtro)
  // Celular (igual ao app): todas as assinaturas numa lista, e cancelar daqui.
  const [cancelando, setCancelando] = useState<Assinatura | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function cancelada(r: ResumoCancelamento | null) {
    const partes = [
      r?.cobrancas_canceladas ? `${r.cobrancas_canceladas} ${r.cobrancas_canceladas === 1 ? 'cobrança cancelada' : 'cobranças canceladas'} (${formatarReais(r.valor_cancelado)})` : null,
      r?.agendamentos_devolvidos ? `${r.agendamentos_devolvidos} ${r.agendamentos_devolvidos === 1 ? 'agendamento voltou' : 'agendamentos voltaram'} ao preço normal` : null,
    ].filter(Boolean)
    setInfo(`Assinatura cancelada.${partes.length ? ` ${partes.join(' · ')}.` : ''}`)
    setCancelando(null)
    router.refresh()
  }

  return (
    <>
      {/* Celular: a mesma aba "Assinaturas" do app. */}
      <div className="so-celular">
        <div className="tela-app-pilha">
          {info && (
            <div className="alert alert-success">
              <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{info}</span>
            </div>
          )}
          {assinaturas.length === 0 ? (
            <div className="dash-app-vazio">
              <span className="dash-app-vazio-icone"><IconUsers style={{ width: 26, height: 26 }} /></span>
              <strong>Nenhuma assinatura</strong>
              <span>Vincule um plano a um pet na ficha do pet.</span>
            </div>
          ) : (
            assinaturas.map(a => (
              <div key={a.id_assinatura} className="cartao-app">
                <span className={`titulo-app ${a.status === 'cancelada' ? 'is-apagado' : ''}`}>
                  {a.pet ?? 'Pet excluído'} — {a.plano}
                </span>
                <span className="sub-app">
                  {a.cliente ?? 'Cliente excluído'} · {formatarReais(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)}
                </span>
                {a.status === 'cancelada' ? (
                  <span className="sub-app">
                    Cancelada{a.cancelada_em ? ` em ${dataBR(a.cancelada_em)}` : ''}{a.motivo_cancelamento ? ` — ${a.motivo_cancelamento}` : ''}
                  </span>
                ) : (
                  <>
                    {a.periodo_atual && (
                      <span className="sub-app">
                        Período até {dataBR(a.periodo_atual.fim)}: {a.periodo_atual.beneficios.map(b => `${b.servico} ${b.usados}/${b.quantidade}`).join(' · ')}
                      </span>
                    )}
                    <span className={`sub-app ${a.cobrancas_vencidas > 0 ? 'is-perigo' : ''}`}>
                      {a.cobrancas_vencidas > 0
                        ? `${a.cobrancas_vencidas} ${a.cobrancas_vencidas === 1 ? 'cobrança vencida' : 'cobranças vencidas'}`
                        : a.cobrancas_em_aberto > 0
                          ? `${a.cobrancas_em_aberto} ${a.cobrancas_em_aberto === 1 ? 'cobrança em aberto' : 'cobranças em aberto'}`
                          : 'Cobranças em dia'}
                      {a.proxima_cobranca ? ` · próxima em ${dataBR(a.proxima_cobranca)}` : ''}
                    </span>
                    <button type="button" className="botao-app is-perigo is-compacto" onClick={() => setCancelando(a)}>
                      Cancelar assinatura
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {cancelando && (
        <CancelarAssinaturaFolha
          key={cancelando.id_assinatura}
          assinatura={cancelando}
          onFechar={() => setCancelando(null)}
          onCancelada={cancelada}
        />
      )}

      <div className="so-desktop">
      <div className="planos-filtros">
        {([['ativa', 'Ativas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']] as const).map(([v, l]) => (
          <button key={v} type="button" className={`btn btn-sm ${filtro === v ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro(v)}>
            {l} ({assinaturas.filter(a => v === 'todas' || a.status === v).length})
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <div className="empty-state card">
          <IconRepeat style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhuma assinatura {filtro === 'cancelada' ? 'cancelada' : filtro === 'ativa' ? 'ativa' : ''}</div>
          <p>Para vincular um plano, abra o cliente em Clientes e use &quot;Assinar plano&quot;.</p>
        </div>
      ) : (
        <div className="planos-assinaturas">
          {lista.map(a => (
            <div key={a.id_assinatura} className="card plano-assinatura">
              <div className="flex items-center justify-between gap-2" style={{ flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="font-semibold">{a.pet ?? 'Pet removido'} · {a.plano}</div>
                  <div className="text-xs text-muted">
                    {a.id_cliente ? <Link href={`/lojista/clientes/${a.id_cliente}`}>{a.cliente}</Link> : 'Cliente removido'}
                    {' · '}{formatarReais(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)}
                  </div>
                </div>
                <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                  {a.status === 'cancelada'
                    ? <span className="badge badge-inativo">Cancelada</span>
                    : <span className="badge badge-concluido">Ativa</span>}
                  {a.cobrancas_vencidas > 0 && <span className="badge badge-cancelado">{a.cobrancas_vencidas} vencida{a.cobrancas_vencidas > 1 ? 's' : ''}</span>}
                </div>
              </div>
              {a.periodo_atual ? (
                <>
                  <div className="text-xs text-muted">
                    Período {a.periodo_atual.numero}: {dataBR(a.periodo_atual.inicio)} a {dataBR(a.periodo_atual.fim)}
                    {a.proxima_cobranca && <> · próxima cobrança {dataBR(a.proxima_cobranca)}</>}
                  </div>
                  <BeneficiosBarra beneficios={a.periodo_atual.beneficios} />
                </>
              ) : (
                <div className="text-xs text-muted">
                  {a.status === 'ativa' ? `Começa em ${dataBR(a.data_inicio)}` : `Cancelada em ${dataBR(a.cancelada_em)}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
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
