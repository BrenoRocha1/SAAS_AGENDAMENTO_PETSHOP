'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import '@/app/lojista/pdv/pdv.css'
import { cancelarVendaPdvAction } from '@/lib/actions-pdv'
import { FORMAS_PAGAMENTO, ROTULO_FORMA_PAGAMENTO, rotuloForma } from '@/lib/pagamento'
import { rotuloNumeroVenda, textoQuantidade, type VendaHistorico } from '@/lib/pdv'
import { formatarReais } from '@/lib/taxidog'
import { IconAlert, IconChevronRight, IconClose, IconInbox } from '@/components/icons'

interface Props {
  vendas: VendaHistorico[]
  de: string
  ate: string
  hoje: string
  presets: { rotulo: string; de: string; ate: string }[]
  podeCancelar: boolean
  // true quando o limite de linhas foi atingido (há vendas mais antigas no período).
  truncado: boolean
}

const formatarDataHora = (iso: string, comData: boolean) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    ...(comData ? { day: '2-digit', month: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  })

const formatarDia = (iso: string) =>
  new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

export default function PdvVendas({ vendas: inicial, de, ate, hoje, presets, podeCancelar, truncado }: Props) {
  const router = useRouter()
  const [vendas, setVendas] = useState(inicial)
  const [aberta, setAberta] = useState<VendaHistorico | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const resumo = useMemo(() => {
    const ok = vendas.filter(v => v.status === 'concluida')
    const faturamento = ok.reduce((s, v) => s + v.total, 0)
    const descontos = ok.reduce((s, v) => s + v.desconto, 0)
    const porForma = FORMAS_PAGAMENTO
      .map(f => ({ forma: f, total: ok.filter(v => v.forma_pagamento === f).reduce((s, v) => s + v.total, 0) }))
      .filter(x => x.total > 0)
    return {
      qtd: ok.length,
      canceladas: vendas.length - ok.length,
      faturamento,
      ticket: ok.length ? faturamento / ok.length : 0,
      descontos,
      porForma,
    }
  }, [vendas])

  function fechar() {
    if (enviando) return
    setAberta(null)
    setCancelando(false)
    setMotivo('')
    setErro(null)
  }

  async function cancelar() {
    if (!aberta || enviando) return
    setEnviando(true)
    setErro(null)
    const r = await cancelarVendaPdvAction(aberta.id_venda, motivo)
    setEnviando(false)
    if (r.error !== undefined) {
      setErro(r.error)
      return
    }
    setVendas(vs => vs.map(v => v.id_venda === aberta.id_venda
      ? { ...v, status: 'cancelada', cancelada_em: new Date().toISOString(), cancelada_motivo: motivo.trim() || null }
      : v))
    setAberta(null)
    setCancelando(false)
    setMotivo('')
    router.refresh()
  }

  const mesmoDia = de === ate

  return (
    <>
      <div className="pdv-filtros">
        {presets.map(p => (
          <Link
            key={p.rotulo}
            href={`/lojista/pdv/vendas?de=${p.de}&ate=${p.ate}`}
            className={`pdv-chip pdv-chip-link ${p.de === de && p.ate === ate ? 'is-ativo' : ''}`}
          >
            {p.rotulo}
          </Link>
        ))}
        <form method="get" action="/lojista/pdv/vendas">
          <input type="date" name="de" defaultValue={de} max={hoje} aria-label="De" required />
          <span style={{ color: 'var(--gray-500)', fontSize: '0.8125rem' }}>até</span>
          <input type="date" name="ate" defaultValue={ate} max={hoje} aria-label="Até" required />
          <button type="submit" className="btn btn-secondary btn-sm">Filtrar</button>
        </form>
      </div>

      <div className="pdv-metricas">
        <div className="pdv-metrica"><small>Vendas</small><strong>{resumo.qtd}</strong></div>
        <div className="pdv-metrica"><small>Faturamento</small><strong>{formatarReais(resumo.faturamento)}</strong></div>
        <div className="pdv-metrica"><small>Ticket médio</small><strong>{formatarReais(resumo.ticket)}</strong></div>
        <div className="pdv-metrica"><small>Descontos</small><strong>{formatarReais(resumo.descontos)}</strong></div>
      </div>

      {resumo.porForma.length > 0 && (
        <div className="pdv-por-forma">
          {resumo.porForma.map(x => (
            <span key={x.forma}>{ROTULO_FORMA_PAGAMENTO[x.forma]} <b>{formatarReais(x.total)}</b></span>
          ))}
          {resumo.canceladas > 0 && <span>Canceladas <b>{resumo.canceladas}</b></span>}
        </div>
      )}

      {vendas.length === 0 ? (
        <div className="empty-state card">
          <IconInbox style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhuma venda {mesmoDia ? `em ${formatarDia(de)}` : 'no período'}</div>
          <p>As vendas feitas no caixa aparecem aqui.</p>
          <Link href="/lojista/pdv" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-4)' }}>Ir para o caixa</Link>
        </div>
      ) : (
        <div className="pdv-vendas">
          {vendas.map(v => (
            <button key={v.id_venda} type="button" className="pdv-venda-linha" onClick={() => setAberta(v)}>
              <span className="pdv-venda-num">{rotuloNumeroVenda(v.numero)}</span>
              <span className="pdv-venda-hora">{formatarDataHora(v.created_at, !mesmoDia)}</span>
              <span className="pdv-venda-resumo">
                {v.itens.map(i => i.produto_nome).join(', ') || '—'}
                <small>{v.cliente_nome ?? 'Sem cliente'}</small>
              </span>
              <span className="pdv-venda-forma">
                {v.status === 'cancelada'
                  ? <span className="badge badge-cancelado">Cancelada</span>
                  : <span style={{ color: 'var(--gray-400)' }}>{rotuloForma(v.forma_pagamento)}</span>}
              </span>
              <span className={`pdv-venda-total ${v.status === 'cancelada' ? 'is-cancelada' : ''}`}>{formatarReais(v.total)}</span>
              <IconChevronRight />
            </button>
          ))}
        </div>
      )}
      {truncado && (
        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
          Mostrando as vendas mais recentes do período. Reduza o intervalo para ver as demais.
        </p>
      )}

      {aberta && (
        <div className="modal-overlay" onClick={fechar}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} role="dialog" aria-label={`Venda ${rotuloNumeroVenda(aberta.numero)}`}>
            <div className="modal-header">
              <h3 className="modal-title">
                Venda {rotuloNumeroVenda(aberta.numero)}{' '}
                {aberta.status === 'cancelada' && <span className="badge badge-cancelado" style={{ marginLeft: 6 }}>Cancelada</span>}
              </h3>
              <button type="button" className="modal-close" onClick={fechar} aria-label="Fechar" disabled={enviando}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>

            <div className="modal-body">
              <div className="pdv-detalhe-meta">
                <span>Data<b>{formatarDataHora(aberta.created_at, true)}</b></span>
                <span>Pagamento<b>{rotuloForma(aberta.forma_pagamento)}</b></span>
                <span>Cliente<b>{aberta.cliente_nome ?? 'Sem cliente'}</b></span>
                <span>Atendente<b>{aberta.operador_nome ?? '—'}</b></span>
              </div>

              <div className="pdv-detalhe-itens">
                {aberta.itens.map(i => (
                  <div key={i.id_item} className="pdv-detalhe-item">
                    <span>
                      {i.produto_nome}
                      <small>{textoQuantidade(i.quantidade, i.unidade_venda)} × {formatarReais(i.preco_unitario)}</small>
                    </span>
                    <strong>{formatarReais(i.subtotal)}</strong>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="pdv-linha"><span>Subtotal</span><strong>{formatarReais(aberta.subtotal)}</strong></div>
                {aberta.desconto > 0 && (
                  <div className="pdv-linha is-desconto"><span>Desconto</span><strong>− {formatarReais(aberta.desconto)}</strong></div>
                )}
                <div className="pdv-linha" style={{ fontSize: '1.0625rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--gray-100)' }}>Total</span>
                  <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem' }}>{formatarReais(aberta.total)}</strong>
                </div>
                {aberta.valor_recebido !== null && (
                  <div className="pdv-linha">
                    <span>Recebido {formatarReais(aberta.valor_recebido)}</span>
                    <strong>Troco {formatarReais(aberta.troco ?? 0)}</strong>
                  </div>
                )}
              </div>

              {aberta.status === 'cancelada' && (
                <div className="alert alert-error">
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Venda cancelada{aberta.cancelada_em ? ` em ${formatarDataHora(aberta.cancelada_em, true)}` : ''}; o estoque foi devolvido.
                    {aberta.cancelada_motivo && <> Motivo: {aberta.cancelada_motivo}</>}
                  </span>
                </div>
              )}

              {erro && (
                <div className="alert alert-error">
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
                </div>
              )}

              {cancelando && (
                <div className="form-group">
                  <label htmlFor="pdv-motivo" className="form-label">Motivo do cancelamento (opcional)</label>
                  <input
                    id="pdv-motivo"
                    className="form-input"
                    maxLength={200}
                    placeholder="Ex.: cliente desistiu"
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    autoFocus
                  />
                  <p className="form-hint">Os produtos voltam para o estoque.</p>
                </div>
              )}
            </div>

            {aberta.status === 'concluida' && (
              <div className="modal-footer">
                {!podeCancelar ? (
                  <span className="text-xs text-muted" style={{ marginRight: 'auto' }}>Só o responsável ou um administrador cancela vendas.</span>
                ) : cancelando ? (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => { setCancelando(false); setErro(null) }} disabled={enviando}>Voltar</button>
                    <button type="button" className={`btn btn-danger ${enviando ? 'btn-loading' : ''}`} onClick={cancelar} disabled={enviando}>
                      {enviando ? 'Cancelando…' : 'Confirmar cancelamento'}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={() => setCancelando(true)} style={{ color: 'var(--danger-400)' }}>
                    Cancelar venda
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
