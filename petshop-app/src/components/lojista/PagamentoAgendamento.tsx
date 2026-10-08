'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarPagamentoAction } from '@/lib/actions-pagamento'
import {
  CLASSE_STATUS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_FORMA_PLANO,
  ROTULO_STATUS_PAGAMENTO,
  ehFormaPagamento,
  ehFormaPlano,
  ehStatusPagamento,
  type FormaPagamento,
  type StatusPagamento,
} from '@/lib/pagamento'
import { IconCreditCard, IconMoney, IconQrCode } from '@/components/icons'
import './novo-agendamento.css'

// O desenho de cada forma de pagamento (aqui e na janela "Novo agendamento").
export const ICONE_FORMA: Record<FormaPagamento, typeof IconMoney> = {
  pix: IconQrCode,
  cartao_credito: IconCreditCard,
  cartao_debito: IconCreditCard,
  dinheiro: IconMoney,
}

const STATUS_QUE_A_LOJA_ESCOLHE: StatusPagamento[] = ['pendente', 'pago', 'cancelado']

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

  // Pedido coberto pelo plano (migration 082): não há forma a escolher nem
  // pagamento a receber.
  if (ehFormaPlano(forma)) {
    return (
      <div className="transporte-bloco">
        <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--gray-200)' }}>
          <IconMoney style={{ width: 14, height: 14 }} /> Pagamento
        </span>
        <span className="text-sm">{ROTULO_FORMA_PLANO}</span>
        <span className="text-xs text-muted">Coberto pelo plano — nada a pagar neste agendamento.</span>
      </div>
    )
  }

  return (
    <div className="transporte-bloco">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--gray-200)' }}>
          <IconMoney style={{ width: 14, height: 14 }} /> Pagamento
        </span>
        {/* Quem pode alterar vê o status na escolha logo abaixo. */}
        {statusAtual && !podeAlterar && (
          <span className={`badge ${CLASSE_STATUS_PAGAMENTO[statusAtual]}`}>{ROTULO_STATUS_PAGAMENTO[statusAtual]}</span>
        )}
      </div>

      {podeAlterar ? (
        <div className="pag-detalhe-campos">
          <div className="na-formas" role="group" aria-label="Forma de pagamento">
            {opcoesForma.map(f => {
              const Icone = ICONE_FORMA[f]
              return (
                <button
                  key={f}
                  type="button"
                  className={`na-forma ${formaAtual === f ? 'is-ativa' : ''}`}
                  disabled={isPending}
                  aria-pressed={formaAtual === f}
                  onClick={() => { if (f !== formaAtual) salvar(f, null) }}
                >
                  <Icone />
                  {ROTULO_FORMA_PAGAMENTO[f]}
                </button>
              )
            })}
          </div>
          <div className="na-seg is-cheio" role="group" aria-label="Status do pagamento">
            {STATUS_QUE_A_LOJA_ESCOLHE.map(st => (
              <button
                key={st}
                type="button"
                className={statusAtual === st ? 'is-ativo' : ''}
                disabled={isPending || !formaAtual}
                aria-pressed={statusAtual === st}
                onClick={() => { if (st !== statusAtual) salvar(null, st) }}
              >
                {ROTULO_STATUS_PAGAMENTO[st]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <span className="text-sm">
          {formaAtual ? ROTULO_FORMA_PAGAMENTO[formaAtual] : 'Não informada'}
        </span>
      )}
      {!formaAtual && podeAlterar && <span className="text-xs text-muted">Sem forma de pagamento registrada — escolha a forma.</span>}
      {erro && <span className="text-xs" style={{ color: 'var(--status-cancelado-fg)' }}>{erro}</span>}
    </div>
  )
}
