'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { whatsappRetiradaCancelada, type RetiradaCancelada } from '@/lib/taxidog'

interface Espera {
  status: string
  chegou_em: string | null
  limite_min: number | null
  agora: string
}

function mmss(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Tempo limite de espera na retirada (migration 093). Enquanto o TaxiDog
// espera no endereço do cliente, mostra quanto falta; passado o limite que a
// loja definiu, aparece "Cancelar retirada" — que cancela o agendamento no
// banco (que confere o tempo de novo) e abre o WhatsApp com o aviso pronto.
export default function EsperaRetirada({ idCorrida, pet }: { idCorrida: string; pet?: string }) {
  const router = useRouter()
  const [espera, setEspera] = useState<Espera | null>(null)
  const [diferenca, setDiferenca] = useState(0) // relógio do servidor − relógio do aparelho
  const [agora, setAgora] = useState(() => Date.now())
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await createClient().rpc('fn_espera_retirada', { p_id_corrida: idCorrida })
    if (error || !data) return // sem a migration 093 ou sem acesso: não mostra nada
    const e = data as Espera
    setEspera(e)
    setDiferenca(new Date(e.agora).getTime() - Date.now())
  }, [idCorrida])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca no banco (sistema externo); o setState só acontece quando a resposta chega
    void carregar()
    const recarregar = setInterval(() => void carregar(), 60_000)
    const relogio = setInterval(() => setAgora(Date.now()), 1_000)
    return () => { clearInterval(recarregar); clearInterval(relogio) }
  }, [carregar])

  if (!espera || espera.status !== 'no_endereco' || !espera.limite_min || !espera.chegou_em) return null

  const esperando = (agora + diferenca - new Date(espera.chegou_em).getTime()) / 1000
  const falta = espera.limite_min * 60 - esperando

  async function cancelar() {
    const quem = pet ? `de ${pet}` : 'do pet'
    if (!window.confirm(`Cancelar a retirada ${quem}? O agendamento de hoje será cancelado e o WhatsApp abre com o aviso para o cliente.`)) return
    setErro(null)
    setCancelando(true)
    const { data, error } = await createClient().rpc('fn_cancelar_retirada_por_espera', { p_id_corrida: idCorrida })
    setCancelando(false)
    if (error) {
      setErro(error.message.replace(/^.*?EXCEPTION:\s*/, ''))
      void carregar()
      return
    }
    const link = whatsappRetiradaCancelada(data as RetiradaCancelada)
    if (link) {
      const aba = window.open(link, '_blank', 'noopener,noreferrer')
      if (!aba) window.location.href = link
    }
    router.refresh()
  }

  return (
    <div className="espera-retirada" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      {falta > 0 ? (
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Aguardando o cliente · tempo limite em <strong>{mmss(falta)}</strong>
        </p>
      ) : (
        <>
          <p className="text-xs" style={{ margin: 0, color: 'var(--danger-400)' }}>
            Tempo de espera de {espera.limite_min} min esgotado.
          </p>
          <button type="button" className={`btn btn-danger btn-sm btn-full ${cancelando ? 'btn-loading' : ''}`} disabled={cancelando} onClick={cancelar}>
            Cancelar retirada
          </button>
        </>
      )}
      {erro && <p className="text-xs" style={{ margin: 0, color: 'var(--danger-400)' }}>{erro}</p>}
    </div>
  )
}
