'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarPagamentoAction } from '@/lib/actions-pagamento'
import {
  CLASSE_STATUS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_STATUS_PAGAMENTO,
  ehFormaPagamento,
  ehStatusPagamento,
  type FormaPagamento,
  type StatusPagamento,
} from '@/lib/pagamento'
import { IconMoney } from '@/components/icons'

// Bloco "Pagamento" do detalhe do agendamento (Gestor de Agendamentos e
// Agenda): forma e status do pedido (migration 057). Mudar aqui vale pros
// serviços criados juntos.
export default function PagamentoAgendamento({ idAgendamento, forma, status, formasAceitas, podeAlterar }: {
  idAgendamento: string
  forma: string | null
  status: string | null
  formasAceitas: FormaPagamento[]
  podeAlterar: boolean
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formaAtual = ehFormaPagamento(forma) ? forma : null
  const statusAtual: StatusPagamento | null = ehStatusPagamento(status) ? status : null
  // A forma atual aparece mesmo que a loja tenha desligado ela depois.
  const opcoesForma = formaAtual && !formasAceitas.includes(formaAtual) ? [formaAtual, ...formasAceitas] : formasAceitas

  function salvar(novaForma: FormaPagamento | null, novoStatus: StatusPagamento | null) {
    setErro(null)
    startTransition(async () => {
      const r = await atualizarPagamentoAction(idAgendamento, novaForma, novoStatus)
      if (r.error) setErro(r.error)
      router.refresh()
    })
  }

  return (
    <div className="transporte-bloco">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--gray-200)' }}>
          <IconMoney style={{ width: 14, height: 14 }} /> Pagamento
        </span>
        {statusAtual && (
          <span className={`badge ${CLASSE_STATUS_PAGAMENTO[statusAtual]}`}>{ROTULO_STATUS_PAGAMENTO[statusAtual]}</span>
        )}
      </div>

      {podeAlterar ? (
        <div className="pag-detalhe-campos">
          <select
            className="form-select"
            value={formaAtual ?? ''}
            disabled={isPending}
            onChange={e => { if (ehFormaPagamento(e.target.value)) salvar(e.target.value, null) }}
            aria-label="Forma de pagamento"
          >
            {!formaAtual && <option value="">Não informada</option>}
            {opcoesForma.map(f => <option key={f} value={f}>{ROTULO_FORMA_PAGAMENTO[f]}</option>)}
          </select>
          <select
            className="form-select"
            value={statusAtual ?? ''}
            disabled={isPending || !formaAtual}
            onChange={e => { if (ehStatusPagamento(e.target.value)) salvar(null, e.target.value) }}
            aria-label="Status do pagamento"
          >
            {!statusAtual && <option value="">—</option>}
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      ) : (
        <span className="text-sm">
          {formaAtual ? ROTULO_FORMA_PAGAMENTO[formaAtual] : 'Não informada'}
        </span>
      )}
      {!formaAtual && podeAlterar && <span className="text-xs text-muted">Agendamento antigo — escolha a forma para registrar.</span>}
      {erro && <span className="text-xs" style={{ color: 'var(--status-cancelado-fg)' }}>{erro}</span>}
    </div>
  )
}
