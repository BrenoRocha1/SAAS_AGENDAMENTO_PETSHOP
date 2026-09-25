'use client'

import { useState, useTransition } from 'react'
import { assinarPlanoAction } from '@/lib/actions-planos'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import { dataBR, rotuloPeriodicidade, sufixoPeriodo, type Plano } from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { IconAlert, IconClose } from '@/components/icons'

// Cliente → Pet → Assinar plano: escolhe o plano, o início e (opcional) a
// forma de pagamento de costume. A primeira cobrança nasce no início.
export default function AssinarPlanoModal({ planos, pets, petFixo, hojeISO, formasAceitas, onFechar, onAssinado }: {
  planos: Plano[]
  pets: { id_pet: string; nome: string }[]
  petFixo?: string
  hojeISO: string
  formasAceitas: FormaPagamento[]
  onFechar: () => void
  onAssinado: () => void
}) {
  const ativos = planos.filter(p => p.ativo)
  const [idPet, setIdPet] = useState(petFixo ?? (pets.length === 1 ? pets[0].id_pet : ''))
  const [idPlano, setIdPlano] = useState(ativos.length === 1 ? ativos[0].id_plano : '')
  const [inicio, setInicio] = useState(hojeISO)
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const plano = ativos.find(p => p.id_plano === idPlano)

  function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    startTransition(async () => {
      const r = await assinarPlanoAction(idPlano, idPet, inicio, forma || null)
      if (r.error) setErro(r.error)
      else onAssinado()
    })
  }

  return (
    <div className="modal-overlay" onClick={() => !isPending && onFechar()}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Assinar plano</h3>
          <button className="modal-close" onClick={onFechar} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <form onSubmit={confirmar}>
          <div className="modal-body">
            {erro && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
              </div>
            )}
            {ativos.length === 0 ? (
              <p className="text-sm text-muted" style={{ margin: 0 }}>Nenhum plano ativo. Crie um em Planos.</p>
            ) : (
              <>
                {!petFixo && (
                  <div className="form-group">
                    <label htmlFor="assinar-pet" className="form-label form-label-required">Pet</label>
                    <select id="assinar-pet" className="form-select" value={idPet} onChange={e => setIdPet(e.target.value)} required>
                      <option value="">Escolha o pet...</option>
                      {pets.map(p => <option key={p.id_pet} value={p.id_pet}>{p.nome}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="assinar-plano" className="form-label form-label-required">Plano</label>
                  <select id="assinar-plano" className="form-select" value={idPlano} onChange={e => setIdPlano(e.target.value)} required>
                    <option value="">Escolha o plano...</option>
                    {ativos.map(p => (
                      <option key={p.id_plano} value={p.id_plano}>
                        {p.nome} — {formatarReais(p.valor)}{sufixoPeriodo(p.periodicidade, p.intervalo_dias)}
                      </option>
                    ))}
                  </select>
                  {plano && (
                    <span className="text-xs text-muted">
                      {rotuloPeriodicidade(plano.periodicidade, plano.intervalo_dias)} · {plano.servicos.map(s => `${s.servico} ${s.quantidade}×`).join(', ')}
                    </span>
                  )}
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="assinar-inicio" className="form-label form-label-required">Início</label>
                    <input id="assinar-inicio" type="date" className="form-input" value={inicio} onChange={e => setInicio(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label htmlFor="assinar-forma" className="form-label">Forma de pagamento</label>
                    <select id="assinar-forma" className="form-select" value={forma} onChange={e => setForma(ehFormaPagamento(e.target.value) ? e.target.value : '')}>
                      <option value="">Definir na cobrança</option>
                      {formasAceitas.map(f => <option key={f} value={f}>{ROTULO_FORMA_PAGAMENTO[f]}</option>)}
                    </select>
                  </div>
                </div>
                {plano && (
                  <p className="text-sm" style={{ margin: 0 }}>
                    Primeira cobrança de <strong>{formatarReais(plano.valor)}</strong> em <strong>{dataBR(inicio)}</strong> (pendente até você registrar o pagamento).
                    Depois, uma cobrança no início de cada período.
                  </p>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onFechar} disabled={isPending}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isPending || !idPlano || !idPet || !inicio}>
              {isPending ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
