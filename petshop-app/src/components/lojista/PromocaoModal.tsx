'use client'

import { useState, useTransition } from 'react'
import { salvarPromocaoAction } from '@/lib/actions-promocao'
import { precoComDesconto, type Promocao } from '@/lib/promocao'
import { formatarReais } from '@/lib/taxidog'
import { IconAlert, IconClose } from '@/components/icons'

// Colocar / editar / encerrar a promoção de um serviço ou produto
// (migration 095). O desconto vale no link de agendamento, nos agendamentos
// feitos pela loja e no Caixa.
export default function PromocaoModal({ tipo, id, nome, preco, atual, onFechar, onSalvo }: {
  tipo: 'servico' | 'produto'
  id: string
  nome: string
  preco: number
  atual: Promocao
  onFechar: () => void
  onSalvo: (p: Promocao) => void
}) {
  const [percentual, setPercentual] = useState(atual.promo_percentual ? String(atual.promo_percentual) : '')
  const [inicio, setInicio] = useState(atual.promo_inicio ?? '')
  const [fim, setFim] = useState(atual.promo_fim ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const pct = Number(percentual)
  const valido = Number.isInteger(pct) && pct >= 1 && pct <= 90

  function salvar(encerrar = false) {
    setErro(null)
    const dados = encerrar
      ? { percentual: null, inicio: null, fim: null }
      : { percentual: pct, inicio: inicio || null, fim: fim || null }
    startTransition(async () => {
      const r = await salvarPromocaoAction(tipo, id, dados)
      if (r.error) { setErro(r.error); return }
      onSalvo({ promo_percentual: dados.percentual, promo_inicio: dados.inicio, promo_fim: dados.fim })
    })
  }

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Promoção · {nome}</h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar"><IconClose style={{ width: 15, height: 15 }} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (valido) salvar() }}>
          <div className="modal-body">
            {erro && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="promo-pct">Desconto (%)</label>
              <input id="promo-pct" className="form-input" type="number" min={1} max={90} step={1} inputMode="numeric" placeholder="Ex.: 15"
                value={percentual} onChange={e => setPercentual(e.target.value)} autoFocus required />
              {valido && (
                <p className="text-sm" style={{ margin: '6px 0 0' }}>
                  De <s className="text-muted">{formatarReais(preco)}</s> por <strong className="text-success">{formatarReais(precoComDesconto(preco, pct))}</strong>
                  {tipo === 'servico' && <span className="text-muted"> — o mesmo desconto vale para os preços por porte/raça</span>}
                </p>
              )}
            </div>
            <div className="grid-2" style={{ gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="promo-ini">Começa em <span className="text-muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
                <input id="promo-ini" className="form-input" type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="promo-fim">Termina em <span className="text-muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
                <input id="promo-fim" className="form-input" type="date" value={fim} min={inicio || undefined} onChange={e => setFim(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              Sem datas, a promoção começa agora e fica até você encerrar. Ela aparece em destaque no link de agendamento da loja.
            </p>
          </div>
          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            {atual.promo_percentual ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => salvar(true)} disabled={isPending}>Encerrar promoção</button>
            ) : <span />}
            <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={!valido || isPending}>
              {isPending ? 'Salvando…' : atual.promo_percentual ? 'Salvar promoção' : 'Ativar promoção'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
