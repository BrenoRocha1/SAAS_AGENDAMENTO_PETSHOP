'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { detalheAssinaturaAction, type ResumoCancelamento } from '@/lib/actions-planos'
import type { FormaPagamento } from '@/lib/pagamento'
import {
  GRUPOS_HISTORICO,
  dataBR,
  descreverEvento,
  fatorMensal,
  horaBR,
  rotuloDia,
  sufixoPeriodo,
  type Assinatura,
  type GrupoHistorico,
  type ItemHistoricoPlano,
  type TomHistorico,
} from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import {
  IconAlert, IconCheck, IconChevronRight, IconClose, IconMoney, IconPlus, IconRepeat, IconSearch, IconStar, IconTrash,
} from '@/components/icons'
import Ilustracao from '@/components/Ilustracao'
import BeneficiosBarra from './BeneficiosBarra'
import CobrancaPagamento from './CobrancaPagamento'
import { CancelamentoAssinatura } from './PlanosDoCliente'
import './planos-tela.css'

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const iniciais = (nome: string | null) => (nome ?? '?').trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

// ════════════════════════════════════════════════════════════
// Assinaturas
// ════════════════════════════════════════════════════════════
type FiltroAssinatura = 'ativa' | 'vencida' | 'cancelada' | 'todas'
const FILTROS: [FiltroAssinatura, string][] = [
  ['ativa', 'Ativas'],
  ['vencida', 'Vencidas'],
  ['cancelada', 'Canceladas'],
  ['todas', 'Todas'],
]

function passa(a: Assinatura, f: FiltroAssinatura): boolean {
  if (f === 'todas') return true
  if (f === 'vencida') return a.status === 'ativa' && a.cobrancas_vencidas > 0
  return a.status === f
}

export function AssinaturasLista({ assinaturas, buscaInicial = '', hojeISO, formasAceitas }: {
  assinaturas: Assinatura[]
  buscaInicial?: string
  hojeISO: string
  formasAceitas: FormaPagamento[]
}) {
  const [filtro, setFiltro] = useState<FiltroAssinatura>('ativa')
  const [busca, setBusca] = useState(buscaInicial)
  const [aberta, setAberta] = useState<Assinatura | null>(null)

  const ativas = assinaturas.filter(a => a.status === 'ativa')
  const receitaMensal = ativas.reduce((s, a) => s + Number(a.valor) * fatorMensal(a.periodicidade, a.intervalo_dias), 0)
  const comVencida = ativas.filter(a => a.cobrancas_vencidas > 0).length

  const termo = semAcento(busca.trim())
  const daBusca = termo ? assinaturas.filter(a => semAcento([a.cliente, a.pet, a.plano].filter(Boolean).join(' ')).includes(termo)) : assinaturas
  const lista = daBusca.filter(a => passa(a, filtro))

  if (assinaturas.length === 0) {
    return (
      <div className="empty-state card">
        <Ilustracao nome="planos" altura={120} />
        <div className="empty-state-title">Nenhuma assinatura ainda</div>
        <p>Na aba <Link href="/lojista/planos">Planos</Link>, toque em “Atribuir plano” para vincular um plano a um pet.</p>
      </div>
    )
  }

  // Próxima renovação, ou o que explica por que não tem.
  const renovacao = (a: Assinatura) => a.status === 'cancelada'
    ? `Cancelada em ${dataBR(a.cancelada_em)}`
    : a.proxima_cobranca ? `Renova ${dataBR(a.proxima_cobranca)}`
    : a.data_inicio > hojeISO ? `Começa ${dataBR(a.data_inicio)}` : '—'

  return (
    <>
      {/* Resumo: tocar filtra. */}
      <div className="pl-resumo-cards">
        <button type="button" className={`pl-resumo-card ${filtro === 'ativa' ? 'is-ativo' : ''}`} onClick={() => setFiltro('ativa')}>
          <span>Assinaturas ativas</span><strong>{ativas.length}</strong>
        </button>
        <div className="pl-resumo-card">
          <span>Receita por mês</span><strong>{formatarReais(receitaMensal)}</strong>
        </div>
        <button type="button" className={`pl-resumo-card ${comVencida > 0 ? 'is-alerta' : ''} ${filtro === 'vencida' ? 'is-ativo' : ''}`} onClick={() => setFiltro('vencida')}>
          <span>Com cobrança vencida</span><strong>{comVencida}</strong>
        </button>
      </div>

      <div className="pl-filtros">
        <div className="pl-busca">
          <IconSearch style={{ width: 16, height: 16 }} />
          <input className="form-input" type="search" placeholder="Buscar por cliente, pet ou plano" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar assinaturas" />
        </div>
        <div className="pl-segmentos is-igual" role="tablist" aria-label="Status">
          {FILTROS.map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={filtro === v} className={filtro === v ? 'is-ativo' : ''} onClick={() => setFiltro(v)}>{l}</button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="pl-vazio">
          Nenhuma assinatura {filtro === 'ativa' ? 'ativa' : filtro === 'vencida' ? 'com cobrança vencida' : filtro === 'cancelada' ? 'cancelada' : ''}{termo ? ` para “${busca.trim()}”` : ''}.
        </div>
      ) : (
        <ul className="pl-assin-lista">
          {lista.map(a => {
            const cancelada = a.status === 'cancelada'
            const uso = a.periodo_atual?.beneficios ?? []
            return (
              <li key={a.id_assinatura}>
                <button type="button" className={`pl-assin ${cancelada ? 'is-cancelada' : ''}`} onClick={() => setAberta(a)}>
                  <span className="pl-avatar" aria-hidden="true">{iniciais(a.pet)}</span>
                  <span className="pl-assin-quem">
                    <span className="pl-assin-pet">{a.pet ?? 'Pet removido'}</span>
                    <span className="pl-assin-sub">{a.cliente ?? 'Cliente removido'}</span>
                  </span>
                  <span className="pl-assin-plano">
                    <span className="pl-assin-plano-nome">{a.plano}</span>
                    <span className="pl-assin-sub">{formatarReais(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)}</span>
                  </span>
                  <span className="pl-assin-uso so-desktop">
                    {!cancelada && uso.length > 0
                      ? uso.map(b => <span key={b.servico}>{b.servico} <strong>{b.usados}/{b.quantidade}</strong></span>)
                      : <span className="pl-assin-sub">—</span>}
                  </span>
                  <span className="pl-assin-fim">
                    {cancelada
                      ? <span className="pl-pilula is-neutro">Cancelada</span>
                      : a.cobrancas_vencidas > 0
                        ? <span className="pl-pilula is-perigo">{a.cobrancas_vencidas} {a.cobrancas_vencidas === 1 ? 'vencida' : 'vencidas'}</span>
                        : <span className="pl-pilula is-sucesso">Em dia</span>}
                    <span className="pl-assin-sub">{renovacao(a)}</span>
                  </span>
                  <IconChevronRight className="pl-assin-seta" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {aberta && (
        <PainelAssinatura
          key={aberta.id_assinatura}
          resumo={aberta}
          hojeISO={hojeISO}
          formasAceitas={formasAceitas}
          onFechar={() => setAberta(null)}
        />
      )}
    </>
  )
}

// ── Painel de uma assinatura: tudo dela num lugar só ──
function PainelAssinatura({ resumo, hojeISO, formasAceitas, onFechar }: {
  resumo: Assinatura
  hojeISO: string
  formasAceitas: FormaPagamento[]
  onFechar: () => void
}) {
  const [a, setA] = useState<Assinatura | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [cancelando, setCancelando] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)

  useEffect(() => {
    let atual = true
    if (!resumo.id_cliente) return
    detalheAssinaturaAction(resumo.id_cliente, resumo.id_assinatura).then(r => {
      if (!atual) return
      setErro(r.error ?? null)
      setA(r.assinatura ?? null)
    })
    return () => { atual = false }
  }, [resumo.id_cliente, resumo.id_assinatura, tentativa])

  function cancelada(r: ResumoCancelamento | null) {
    const partes = [
      r?.cobrancas_canceladas ? `${r.cobrancas_canceladas} ${r.cobrancas_canceladas === 1 ? 'cobrança cancelada' : 'cobranças canceladas'} (${formatarReais(Number(r.valor_cancelado))})` : null,
      r?.agendamentos_devolvidos ? `${r.agendamentos_devolvidos} ${r.agendamentos_devolvidos === 1 ? 'agendamento voltou' : 'agendamentos voltaram'} ao preço normal` : null,
    ].filter(Boolean)
    setCancelando(false)
    setFeito(`Assinatura cancelada.${partes.length ? ` ${partes.join(' · ')}.` : ''}`)
    setA(null)
    setTentativa(n => n + 1)
  }

  const base = a ?? resumo
  const ativa = base.status === 'ativa'
  const cobrancas = a?.cobrancas ?? []
  const usos = (a?.utilizacoes ?? []).filter(u => !u.estornada_em)
  const historico = a?.historico ?? []

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal pl-painel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pl-painel-titulo">
        <div className="modal-header">
          <div className="pl-painel-topo">
            <span className="pl-avatar is-grande" aria-hidden="true">{iniciais(base.pet)}</span>
            <div style={{ minWidth: 0 }}>
              <h3 className="modal-title" id="pl-painel-titulo">{base.pet ?? 'Pet removido'}</h3>
              <div className="pl-assin-sub">
                {base.id_cliente ? <Link href={`/lojista/clientes/${base.id_cliente}`}>{base.cliente}</Link> : 'Cliente removido'}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar"><IconClose style={{ width: 15, height: 15 }} /></button>
        </div>

        <div className="modal-body">
          {feito && (
            <div className="alert alert-success"><IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{feito}</span></div>
          )}

          <div className="pl-painel-plano">
            <div>
              <span className="pl-rotulo">Plano</span>
              <strong>{base.plano}</strong>
              <span className="pl-assin-sub">{formatarReais(base.valor)}{sufixoPeriodo(base.periodicidade, base.intervalo_dias)} · desde {dataBR(base.data_inicio)}</span>
            </div>
            {ativa
              ? (base.cobrancas_vencidas > 0
                  ? <span className="pl-pilula is-perigo">{base.cobrancas_vencidas} {base.cobrancas_vencidas === 1 ? 'cobrança vencida' : 'cobranças vencidas'}</span>
                  : <span className="pl-pilula is-sucesso">Ativa · em dia</span>)
              : <span className="pl-pilula is-neutro">Cancelada em {dataBR(base.cancelada_em)}</span>}
          </div>

          {ativa && base.periodo_atual && (
            <section className="pl-secao">
              <div className="pl-secao-topo is-coluna">
                <h4>Período atual</h4>
                <span>{dataBR(base.periodo_atual.inicio)} a {dataBR(base.periodo_atual.fim)}{base.proxima_cobranca ? ` · renova ${dataBR(base.proxima_cobranca)}` : ''}</span>
              </div>
              <BeneficiosBarra beneficios={base.periodo_atual.beneficios} />
            </section>
          )}
          {!ativa && base.motivo_cancelamento && (
            <p className="pl-assin-sub" style={{ margin: 0 }}>Motivo do cancelamento: {base.motivo_cancelamento}</p>
          )}

          {erro ? (
            <div className="pl-estado">
              <span>{erro}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setErro(null); setTentativa(n => n + 1) }}>Tentar de novo</button>
            </div>
          ) : !a ? (
            <div className="pl-estado"><span>Carregando cobranças e histórico…</span></div>
          ) : (
            <>
              <section className="pl-secao">
                <div className="pl-secao-topo"><h4>Cobranças</h4><span>{cobrancas.length}</span></div>
                {cobrancas.length === 0 ? <p className="pl-assin-sub" style={{ margin: 0 }}>Nenhuma cobrança ainda.</p> : (
                  <ul className="pl-linhas">
                    {cobrancas.map(c => {
                      return (
                        <li key={c.id_cobranca}>
                          <div className="pl-linhas-info">
                            <strong>{formatarReais(c.valor)}</strong>
                            <span className="pl-assin-sub">
                              Vence {dataBR(c.vencimento)} · período {c.numero}
                              {c.pago_em ? ` · pago em ${dataBR(c.pago_em)}` : ''}
                            </span>
                          </div>
                          <div className="pl-linhas-acao">
                            <CobrancaPagamento idCobranca={c.id_cobranca} forma={c.forma_pagamento} status={c.status} vencimento={c.vencimento} hojeISO={hojeISO} formasAceitas={formasAceitas} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section className="pl-secao">
                <div className="pl-secao-topo"><h4>Serviços usados</h4><span>{usos.length}</span></div>
                {usos.length === 0 ? <p className="pl-assin-sub" style={{ margin: 0 }}>Nenhum serviço do plano usado ainda.</p> : (
                  <ul className="pl-linhas">
                    {usos.map((u, i) => (
                      <li key={i}>
                        <div className="pl-linhas-info">
                          <strong>{u.servico}</strong>
                          <span className="pl-assin-sub">{u.data ? dataBR(u.data) : ''}{u.hora ? ` às ${u.hora.slice(0, 5)}` : ''} · período {u.periodo}{u.funcionario ? ` · ${u.funcionario}` : ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {historico.length > 0 && (
                <section className="pl-secao">
                  <div className="pl-secao-topo"><h4>Histórico</h4></div>
                  <ul className="pl-tempo is-compacto">
                    {historico.map((h, i) => <EventoHistorico key={i} item={h} hojeISO={hojeISO} mostrarDia />)}
                  </ul>
                </section>
              )}

              {ativa && !cancelando && (
                <button type="button" className="btn btn-ghost pl-cancelar-botao" onClick={() => setCancelando(true)}>
                  <IconClose style={{ width: 14, height: 14 }} /> Cancelar assinatura
                </button>
              )}
              {cancelando && (
                <CancelamentoAssinatura a={a} hojeISO={hojeISO} onVoltar={() => setCancelando(false)} onCancelada={cancelada} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Histórico
// ════════════════════════════════════════════════════════════
const ICONE_TOM: Record<TomHistorico, React.ReactNode> = {
  sucesso: <IconPlus />,
  perigo: <IconClose />,
  aviso: <IconMoney />,
  primario: <IconRepeat />,
  neutro: <IconAlert />,
}
function iconeDoEvento(tipo: string, tom: TomHistorico) {
  if (tipo === 'pagamento_registrado') return <IconCheck />
  if (tipo === 'beneficio_utilizado') return <IconStar />
  if (tipo === 'plano_excluido') return <IconTrash />
  if (tipo.startsWith('cobranca') || tipo === 'cobrancas_canceladas') return <IconMoney />
  return ICONE_TOM[tom]
}

function EventoHistorico({ item, hojeISO, mostrarDia = false }: { item: ItemHistoricoPlano; hojeISO: string; mostrarDia?: boolean }) {
  const ev = descreverEvento(item.tipo, item.descricao)
  const quem = [item.pet, item.cliente].filter(Boolean).join(' · ')
  // Plano apagado de vez: o nome ainda está na frase gravada ("Plano "X" …").
  const plano = item.plano ?? item.descricao.match(/"([^"]+)"/)?.[1] ?? null
  return (
    <li className="pl-evento">
      <span className={`pl-evento-icone is-${ev.tom}`} aria-hidden="true">{iconeDoEvento(item.tipo, ev.tom)}</span>
      <div className="pl-evento-corpo">
        <div className="pl-evento-topo">
          <strong>{ev.titulo}</strong>
          <span>{mostrarDia ? `${rotuloDia(item.em, hojeISO)}, ` : ''}{horaBR(item.em)}</span>
        </div>
        {(quem || plano) && (
          <div className="pl-evento-quem">
            {quem && <span>{quem}</span>}
            {plano && <span className="pl-evento-plano">{plano}</span>}
          </div>
        )}
        {ev.detalhe && <p>{ev.detalhe}</p>}
      </div>
    </li>
  )
}

export function HistoricoPlanosLista({ itens, hojeISO }: { itens: ItemHistoricoPlano[]; hojeISO: string }) {
  const [grupo, setGrupo] = useState<GrupoHistorico | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  const dias = useMemo(() => {
    const termo = semAcento(busca.trim())
    const filtrados = itens.filter(h => {
      if (grupo !== 'todos' && descreverEvento(h.tipo, h.descricao).grupo !== grupo) return false
      return !termo || semAcento([h.pet, h.cliente, h.plano, h.descricao].filter(Boolean).join(' ')).includes(termo)
    })
    const porDia = new Map<string, ItemHistoricoPlano[]>()
    for (const h of filtrados) {
      const rotulo = rotuloDia(h.em, hojeISO)
      porDia.set(rotulo, [...(porDia.get(rotulo) ?? []), h])
    }
    return [...porDia.entries()]
  }, [itens, grupo, busca, hojeISO])

  if (itens.length === 0) {
    return (
      <div className="empty-state card">
        <Ilustracao nome="planos" altura={120} />
        <div className="empty-state-title">Nada registrado ainda</div>
        <p>Aqui aparece tudo o que acontece com os planos: atribuições, renovações, pagamentos, usos e cancelamentos.</p>
      </div>
    )
  }

  return (
    <>
      <div className="pl-filtros">
        <div className="pl-busca">
          <IconSearch style={{ width: 16, height: 16 }} />
          <input className="form-input" type="search" placeholder="Buscar por pet, cliente ou plano" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar no histórico" />
        </div>
        <div className="pl-segmentos is-quebra" role="tablist" aria-label="Tipo de evento">
          {GRUPOS_HISTORICO.map(g => (
            <button key={g.valor} type="button" role="tab" aria-selected={grupo === g.valor} className={grupo === g.valor ? 'is-ativo' : ''} onClick={() => setGrupo(g.valor)}>{g.rotulo}</button>
          ))}
        </div>
      </div>

      {dias.length === 0 ? (
        <div className="pl-vazio">Nada encontrado com esse filtro.</div>
      ) : (
        <div className="pl-dias">
          {dias.map(([dia, eventos]) => (
            <section key={dia} className="pl-dia">
              <h3 className="pl-dia-titulo">{dia}</h3>
              <ul className="pl-tempo">
                {eventos.map((h, i) => <EventoHistorico key={`${h.em}-${i}`} item={h} hojeISO={hojeISO} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
