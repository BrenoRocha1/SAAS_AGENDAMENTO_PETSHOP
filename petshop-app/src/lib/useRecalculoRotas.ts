'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { recalcularRotaAction } from '@/lib/actions-rotas'
import type { Rota } from '@/lib/taxidog-rotas'

// Espera a rota "sossegar" antes de chamar o Google Maps: arrastar três
// paradas seguidas vira um cálculo só (a cota grátis é por chamada).
const ESPERA_MS = 4000

// Recalcula distância/tempo das rotas cuja versão mudou desde o último
// cálculo. Usado por quem está com a rota aberta (loja ou TaxiDog).
// Devolve os motivos das rotas em que o Google não calculou.
export function useRecalculoRotas(rotas: Rota[], googleConfigurado: boolean): Record<string, string> {
  const router = useRouter()
  const [falhas, setFalhas] = useState<Record<string, string>>({})
  const tentadas = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    if (!googleConfigurado) return
    const mapa = timers.current
    for (const r of rotas) {
      const chave = `${r.id_rota}:${r.versao}`
      const precisa = r.status !== 'cancelada' && r.status !== 'concluida' && r.paradas.length > 0 && r.calculo_versao !== r.versao
      const anterior = mapa.get(r.id_rota)
      if (!precisa || tentadas.current.has(chave)) continue
      if (anterior) clearTimeout(anterior)
      mapa.set(r.id_rota, setTimeout(() => {
        mapa.delete(r.id_rota)
        tentadas.current.add(chave)
        recalcularRotaAction(r.id_rota).then(res => {
          if (res.error) setFalhas(prev => ({ ...prev, [r.id_rota]: res.error! }))
          else router.refresh()
        })
      }, ESPERA_MS))
    }
  }, [rotas, googleConfigurado, router])

  useEffect(() => {
    const mapa = timers.current
    return () => {
      for (const t of mapa.values()) clearTimeout(t)
      mapa.clear()
    }
  }, [])

  return falhas
}
