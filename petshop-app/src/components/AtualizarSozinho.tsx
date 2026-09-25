'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Recarrega os dados da página (router.refresh) de tempos em tempos e ao
// voltar pra aba — pra páginas públicas, que não têm Realtime (sem login a
// RLS não entrega nada).
export default function AtualizarSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, segundos * 1000)
    const aoVoltar = () => { if (document.visibilityState === 'visible') router.refresh() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [router, segundos])

  return null
}
