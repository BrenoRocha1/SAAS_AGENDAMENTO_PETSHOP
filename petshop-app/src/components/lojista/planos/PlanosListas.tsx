'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FormaPagamento } from '@/lib/pagamento'
import { dataBR, sufixoPeriodo, type Assinatura, type CobrancaDaLoja, type HistoricoPlano } from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { IconRepeat } from '@/components/icons'
import CobrancaPagamento from './CobrancaPagamento'
import BeneficiosBarra from './BeneficiosBarra'

// ── Assinaturas da loja ──
export function AssinaturasLista({ assinaturas }: { assinaturas: Assinatura[] }) {
  const [filtro, setFiltro] = useState<'ativa' | 'cancelada' | 'todas'>('ativa')
  const lista = assinaturas.filter(a => filtro === 'todas' || a.status === filtro)

  return (
    <>
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
    </>
  )
}

// ── Cobranças da loja ──
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
  return (
    <>
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
    </>
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
