'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarCobrancaPlanoAction } from '@/lib/actions-planos'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import {
  ROTULO_STATUS_COBRANCA,
  dataBR,
  statusCobrancaExibido,
  type CobrancaDaLoja,
} from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { Folha, Opcao } from '@/components/app/PecasApp'
import { IconAlert, IconCheck, IconMoney } from '@/components/icons'
import CobrancaPagamento from './CobrancaPagamento'
import './planos-tela.css'

// Filtro das cobranças (a página lê pela URL). Canceladas aparecem em Todas.
const FILTROS_COBRANCA: [string, string][] = [
  ['pendentes', 'A vencer'],
  ['vencidas', 'Vencidas'],
  ['pagas', 'Pagas'],
  ['todas', 'Todas'],
]

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
      <div className="pl-filtros">
        <div className="pl-segmentos is-igual" role="tablist" aria-label="Situação">
          {FILTROS_COBRANCA.map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={filtro === v} className={filtro === v ? 'is-ativo' : ''}
              onClick={() => router.push(`/lojista/planos?aba=cobrancas&filtro=${v}`)}>
              {l}
            </button>
          ))}
        </div>
        {cobrancas.length > 0 && (
          <span className="pl-total">{cobrancas.length} {cobrancas.length === 1 ? 'cobrança' : 'cobranças'} · <strong>{formatarReais(total)}</strong></span>
        )}
      </div>

      {/* Celular: a mesma aba "Cobranças" do app. */}
      <div className="so-celular">
        <div className="tela-app-pilha">
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
      {cobrancas.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nenhuma cobrança aqui</div>
          <p>As cobranças nascem sozinhas no início de cada período das assinaturas.</p>
        </div>
      ) : (
        <>
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
