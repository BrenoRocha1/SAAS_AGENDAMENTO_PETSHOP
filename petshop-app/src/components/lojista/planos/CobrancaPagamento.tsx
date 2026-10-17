'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarCobrancaPlanoAction } from '@/lib/actions-planos'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import { ROTULO_STATUS_COBRANCA, statusCobrancaExibido } from '@/lib/planos'
import { IconCheck } from '@/components/icons'
import './planos-tela.css'

const CLASSE: Record<string, string> = { pago: 'is-sucesso', vencido: 'is-perigo', pendente: 'is-aviso', cancelado: 'is-neutro' }

// Situação de uma cobrança do plano e o que dá para fazer com ela. Só
// "Confirmar" num pagamento marca como pago — escolher a forma sozinha não.
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
  const [registrando, setRegistrando] = useState(false)
  const formaAtual = ehFormaPagamento(forma) ? forma : null
  const [escolhida, setEscolhida] = useState<FormaPagamento | null>(formaAtual)
  const [isPending, startTransition] = useTransition()
  const opcoes = formaAtual && !formasAceitas.includes(formaAtual) ? [formaAtual, ...formasAceitas] : formasAceitas
  const exibido = statusCobrancaExibido(status, vencimento, hojeISO)

  function salvar(novaForma: FormaPagamento | null, novoStatus: 'pendente' | 'pago' | 'cancelado') {
    setErro(null)
    startTransition(async () => {
      const r = await atualizarCobrancaPlanoAction(idCobranca, novaForma, novoStatus)
      if (r.error) { setErro(r.error); return }
      setRegistrando(false)
      router.refresh()
    })
  }

  return (
    <div className="pl-pag">
      <div className="pl-pag-linha">
        <span className={`pl-pilula ${CLASSE[exibido]}`}>
          {status === 'pago' && formaAtual ? `Pago · ${ROTULO_FORMA_PAGAMENTO[formaAtual]}` : ROTULO_STATUS_COBRANCA[exibido]}
        </span>
        {status === 'pendente' && !registrando && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setRegistrando(true)} disabled={isPending}>Registrar pagamento</button>
        )}
        {status === 'pago' && (
          <button type="button" className="pl-pag-link" onClick={() => salvar(formaAtual, 'pendente')} disabled={isPending}>
            {isPending ? 'Desfazendo…' : 'Desfazer'}
          </button>
        )}
        {status === 'cancelado' && (
          <button type="button" className="pl-pag-link" onClick={() => salvar(formaAtual, 'pendente')} disabled={isPending}>
            {isPending ? 'Reabrindo…' : 'Reabrir'}
          </button>
        )}
      </div>

      {registrando && (
        <div className="pl-pag-form">
          <span className="pl-rotulo">Como pagou</span>
          <div className="pl-pag-formas">
            {opcoes.map(f => (
              <button key={f} type="button" className={`pl-pag-forma ${escolhida === f ? 'is-ativa' : ''}`} onClick={() => setEscolhida(f)} aria-pressed={escolhida === f}>
                {ROTULO_FORMA_PAGAMENTO[f]}
              </button>
            ))}
          </div>
          <div className="pl-pag-botoes">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRegistrando(false)} disabled={isPending}>Voltar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => salvar(escolhida, 'pago')} disabled={isPending || !escolhida}>
              <IconCheck style={{ width: 14, height: 14 }} /> {isPending ? 'Salvando…' : 'Confirmar pagamento'}
            </button>
          </div>
          <button type="button" className="pl-pag-link is-perigo" onClick={() => salvar(formaAtual, 'cancelado')} disabled={isPending}>
            Cancelar esta cobrança
          </button>
        </div>
      )}
      {erro && <span className="pl-pag-erro">{erro}</span>}
    </div>
  )
}
