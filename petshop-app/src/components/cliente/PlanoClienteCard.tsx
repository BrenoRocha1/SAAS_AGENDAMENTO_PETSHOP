'use client'

import { useState } from 'react'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, normalizarFormasLoja } from '@/lib/pagamento'
import {
  CLASSE_STATUS_COBRANCA, ROTULO_STATUS_COBRANCA, dataBR, rotuloPeriodicidade, statusCobrancaExibido, sufixoPeriodo,
  type AssinaturaDoCliente,
} from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import BeneficiosBarra from '@/components/lojista/planos/BeneficiosBarra'
import { PixDaLoja } from './PagamentoEtapa'
import { IconAlert, IconWhatsapp } from '@/components/icons'

// Um plano do cliente (fn_meus_planos, migration 068): benefícios do
// período, cobrança em aberto (com o Pix da loja) e histórico. Só leitura:
// quem registra uso e pagamento é a loja.
export default function PlanoClienteCard({ a, hojeISO }: { a: AssinaturaDoCliente; hojeISO: string }) {
  const ativa = a.status === 'ativa'
  const abertas = a.cobrancas.filter(c => c.status === 'pendente')
  const vencidas = abertas.filter(c => c.vencimento < hojeISO)
  const [aberta, setAberta] = useState<'cobrancas' | 'usos' | null>(null)
  const formas = normalizarFormasLoja(a.formas_loja)
  const usosValidos = a.utilizacoes.filter(u => !u.estornada_em).length
  const telefone = a.loja_telefone?.replace(/\D/g, '')

  return (
    <div className={`card plano-assinatura ${ativa ? '' : 'is-cancelada'}`}>
      <div className="flex items-center justify-between gap-2" style={{ flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="font-semibold" style={{ color: 'var(--gray-100)', fontSize: '1.05rem' }}>{a.plano}</div>
          <div className="text-sm text-muted">{a.pet ?? 'Pet removido'} · {a.loja}</div>
        </div>
        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
          {ativa ? <span className="badge badge-concluido">Ativo</span> : <span className="badge badge-inativo">Cancelado</span>}
          {vencidas.length > 0 && <span className="badge badge-cancelado">{vencidas.length} vencida{vencidas.length > 1 ? 's' : ''}</span>}
        </div>
      </div>

      <div className="text-xs text-muted">
        {formatarReais(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)} · {rotuloPeriodicidade(a.periodicidade, a.intervalo_dias)}
        {' · '}desde {dataBR(a.data_inicio)}
        {a.forma_pagamento && ehFormaPagamento(a.forma_pagamento) && <> · {ROTULO_FORMA_PAGAMENTO[a.forma_pagamento]}</>}
      </div>
      {a.descricao && <p className="text-sm text-muted" style={{ margin: 0 }}>{a.descricao}</p>}

      {ativa && a.periodo_atual && (
        <>
          <div className="text-sm" style={{ color: 'var(--gray-200)', marginTop: 'var(--space-1)' }}>
            Neste período ({dataBR(a.periodo_atual.inicio)} a {dataBR(a.periodo_atual.fim)}):
          </div>
          <BeneficiosBarra beneficios={a.periodo_atual.beneficios} />
          <p className="text-xs text-muted" style={{ margin: 0 }}>
            Para usar, agende o serviço pela sua conta: o saldo do plano já entra no agendamento, sem cobrar o serviço.
            {a.proxima_cobranca && <> Renova em <strong>{dataBR(a.proxima_cobranca)}</strong>.</>}
          </p>
        </>
      )}
      {ativa && !a.periodo_atual && <div className="text-sm text-muted">Começa em {dataBR(a.data_inicio)}.</div>}
      {!ativa && <div className="text-sm text-muted">Cancelado em {dataBR(a.cancelada_em)}.</div>}

      {abertas.length > 0 && (
        <div className={`alert ${vencidas.length > 0 ? 'alert-error' : 'alert-warning'}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}>
          {abertas.map(c => (
            <div key={c.id_cobranca} className="flex items-center gap-2">
              <IconAlert style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span>
                {c.vencimento < hojeISO
                  ? <>Cobrança de <strong>{formatarReais(c.valor)}</strong> vencida em {dataBR(c.vencimento)}</>
                  : <>Cobrança de <strong>{formatarReais(c.valor)}</strong> vence em {dataBR(c.vencimento)}</>}
                {' '}(período {c.numero}).
              </span>
            </div>
          ))}
          <span className="text-sm" style={{ fontWeight: 400 }}>
            Pague na loja{formas.pix && formas.pix_chave ? ' ou pelo Pix abaixo' : ''}. A loja confirma o pagamento.
          </span>
        </div>
      )}
      {abertas.length > 0 && formas.pix && <PixDaLoja chave={formas.pix_chave} nome={formas.pix_nome} />}

      <div className="flex gap-1" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={`btn btn-sm ${aberta === 'cobrancas' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAberta(aberta === 'cobrancas' ? null : 'cobrancas')}>
          Cobranças ({a.cobrancas.length})
        </button>
        <button type="button" className={`btn btn-sm ${aberta === 'usos' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAberta(aberta === 'usos' ? null : 'usos')}>
          Usos ({usosValidos})
        </button>
        {telefone && (
          <a
            href={`https://wa.me/55${telefone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto' }}
          >
            <IconWhatsapp style={{ width: 14, height: 14 }} /> Falar com a loja
          </a>
        )}
      </div>

      {aberta === 'cobrancas' && (
        a.cobrancas.length === 0 ? <p className="text-sm text-muted" style={{ margin: 0 }}>Sem cobranças ainda.</p> : (
          <ul className="plano-lista-detalhe">
            {a.cobrancas.map(c => {
              const st = statusCobrancaExibido(c.status, c.vencimento, hojeISO)
              return (
                <li key={c.id_cobranca}>
                  <div>
                    <div className="text-sm font-semibold">{formatarReais(c.valor)} · vence {dataBR(c.vencimento)}</div>
                    <div className="text-xs text-muted">
                      Período {c.numero} ({dataBR(c.periodo_inicio)} a {dataBR(c.periodo_fim)})
                      {c.pago_em ? ` · pago em ${dataBR(c.pago_em)}` : ''}
                      {c.forma_pagamento && ehFormaPagamento(c.forma_pagamento) ? ` · ${ROTULO_FORMA_PAGAMENTO[c.forma_pagamento]}` : ''}
                    </div>
                  </div>
                  <span className={`badge ${CLASSE_STATUS_COBRANCA[st]}`}>{ROTULO_STATUS_COBRANCA[st]}</span>
                </li>
              )
            })}
          </ul>
        )
      )}

      {aberta === 'usos' && (
        a.utilizacoes.length === 0 ? <p className="text-sm text-muted" style={{ margin: 0 }}>Nenhum serviço do plano usado ainda.</p> : (
          <ul className="plano-lista-detalhe">
            {a.utilizacoes.map((u, i) => (
              <li key={i} className={u.estornada_em ? 'is-estornada' : ''}>
                <div>
                  <div className="text-sm font-semibold">
                    {u.servico}{u.data ? ` · ${dataBR(u.data)}` : ''}{u.hora ? ` às ${u.hora.slice(0, 5)}` : ''}
                  </div>
                  <div className="text-xs text-muted">
                    Período {u.periodo}
                    {u.estornada_em ? ` · devolvido ao plano em ${dataBR(u.estornada_em)}${u.motivo_estorno ? ` (${u.motivo_estorno})` : ''}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
