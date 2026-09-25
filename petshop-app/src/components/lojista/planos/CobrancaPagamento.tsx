'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarCobrancaPlanoAction } from '@/lib/actions-planos'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import { CLASSE_STATUS_COBRANCA, ROTULO_STATUS_COBRANCA, statusCobrancaExibido } from '@/lib/planos'

// Forma + status de uma cobrança do plano. Forma não é status: escolher
// Pix não marca como pago — "Pago" é o que registra o pagamento.
export default function CobrancaPagamento({ idCobranca, forma, status, vencimento, hojeISO, formasAceitas }: {
  idCobranca: string
  forma: string | null
  status: 'pendente' | 'pago' | 'cancelado'
  vencimento: string
  hojeISO: string
  formasAceitas: FormaPagamento[]
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formaAtual = ehFormaPagamento(forma) ? forma : null
  const opcoes = formaAtual && !formasAceitas.includes(formaAtual) ? [formaAtual, ...formasAceitas] : formasAceitas
  const exibido = statusCobrancaExibido(status, vencimento, hojeISO)

  function salvar(novaForma: FormaPagamento | null, novoStatus: 'pendente' | 'pago' | 'cancelado') {
    setErro(null)
    startTransition(async () => {
      const r = await atualizarCobrancaPlanoAction(idCobranca, novaForma, novoStatus)
      if (r.error) setErro(r.error)
      router.refresh()
    })
  }

  return (
    <div className="plano-cobranca-pag">
      <span className={`badge ${CLASSE_STATUS_COBRANCA[exibido]}`}>{ROTULO_STATUS_COBRANCA[exibido]}</span>
      <select
        className="form-select"
        value={formaAtual ?? ''}
        disabled={isPending}
        aria-label="Forma de pagamento"
        onChange={e => { if (ehFormaPagamento(e.target.value)) salvar(e.target.value, status) }}
      >
        {!formaAtual && <option value="">Forma...</option>}
        {opcoes.map(f => <option key={f} value={f}>{ROTULO_FORMA_PAGAMENTO[f]}</option>)}
      </select>
      <select
        className="form-select"
        value={status}
        disabled={isPending}
        aria-label="Status do pagamento"
        onChange={e => salvar(formaAtual, e.target.value as 'pendente' | 'pago' | 'cancelado')}
      >
        <option value="pendente">Pendente</option>
        <option value="pago">Pago</option>
        <option value="cancelado">Cancelado</option>
      </select>
      {erro && <span className="text-xs" style={{ color: 'var(--status-cancelado-fg)', flexBasis: '100%' }}>{erro}</span>}
    </div>
  )
}
