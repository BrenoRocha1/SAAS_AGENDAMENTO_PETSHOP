'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { beneficioDoAgendamentoAction, estornarBeneficioAction, usarBeneficioAction } from '@/lib/actions-planos'
import type { BeneficioDoAgendamento } from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { IconRepeat } from '@/components/icons'

// Bloco "Plano" no detalhe do agendamento: mostra se o serviço está no
// plano do pet e deixa usar (ou desfazer) o benefício. Sem plano, não
// aparece nada — o agendamento segue avulso como sempre.
export default function BeneficioAgendamento({ idAgendamento, status }: { idAgendamento: string; status: string }) {
  const router = useRouter()
  const [info, setInfo] = useState<BeneficioDoAgendamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let cancelado = false
    beneficioDoAgendamentoAction(idAgendamento).then(r => { if (!cancelado) setInfo(r) })
    return () => { cancelado = true }
  }, [idAgendamento, status, versao])

  if (!info || (!info.usado && !info.disponivel) || status === 'Cancelado') return null

  function executar(acao: () => Promise<{ error?: string }>) {
    setErro(null)
    startTransition(async () => {
      const r = await acao()
      if (r.error) setErro(r.error)
      setVersao(v => v + 1)
      router.refresh()
    })
  }

  const d = info.disponivel
  const restantes = d ? d.quantidade - d.usados : 0

  return (
    <div className="transporte-bloco">
      <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--gray-200)' }}>
        <IconRepeat style={{ width: 14, height: 14 }} /> Plano
      </span>
      {info.usado ? (
        <>
          <span className="text-sm">
            Incluído no plano <strong>{info.usado.plano}</strong>
            {Number(info.usado.valor_abatido) > 0 && <> — {formatarReais(info.usado.valor_abatido)} do serviço saíram deste agendamento</>}.
          </span>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} disabled={isPending}
            onClick={() => executar(() => estornarBeneficioAction(idAgendamento))}>
            {isPending ? 'Desfazendo...' : 'Desfazer uso do benefício'}
          </button>
        </>
      ) : d && restantes > 0 ? (
        <>
          <span className="text-sm">
            Este serviço está incluído no plano do cliente (<strong>{d.plano}</strong>: {restantes} de {d.quantidade} restante{restantes !== 1 ? 's' : ''} no período).
          </span>
          <button type="button" className="btn btn-success btn-sm" style={{ alignSelf: 'flex-start' }} disabled={isPending}
            onClick={() => executar(() => usarBeneficioAction(idAgendamento))}>
            {isPending ? 'Usando...' : 'Usar benefício do plano'}
          </button>
        </>
      ) : d ? (
        <span className="text-sm text-muted">
          Os usos deste serviço no plano {d.plano} acabaram neste período ({d.usados} de {d.quantidade}) — ele fica como avulso.
        </span>
      ) : null}
      {erro && <span className="text-xs" style={{ color: 'var(--status-cancelado-fg)' }}>{erro}</span>}
    </div>
  )
}
