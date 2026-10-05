'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import FiltroPeriodo, { PERIODO_PERSONALIZADO } from '@/components/lojista/FiltroPeriodo'

interface Props {
  // Períodos prontos ("Hoje", "Últimos 7 dias"…), já calculados no servidor.
  presets: { rotulo: string; de: string; ate: string }[]
  // Período que está valendo (AAAA-MM-DD).
  de: string
  ate: string
  // Filtro por TaxiDog em vigor — acompanha a troca de período.
  filtroTaxidog: string
  // Último dia que dá pra escolher (o TaxiDog não vê dia que ainda não chegou).
  dataMax?: string
}

// Período do relatório de corridas do TaxiDog. Lá o período mora na URL
// como de/até (sem "periodo="): vale o pronto que bate com as datas e,
// se nenhum bate, "Personalizado".
export default function PeriodoRelatorioTaxiDog({ presets, de, ate, filtroTaxidog, dataMax }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // A pessoa escolheu "Personalizado" e ainda não aplicou um período.
  const [personalizando, setPersonalizando] = useState(false)

  const pronto = presets.find(p => p.de === de && p.ate === ate)
  const valor = personalizando || !pronto ? PERIODO_PERSONALIZADO : pronto.rotulo

  function ir(novoDe: string, novoAte: string) {
    const qs = new URLSearchParams({ de: novoDe, ate: novoAte })
    if (filtroTaxidog) qs.set('taxidog', filtroTaxidog)
    startTransition(() => router.push(`/lojista/taxidog/relatorio?${qs}`))
  }

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms', pointerEvents: isPending ? 'none' : 'auto', minWidth: 0, maxWidth: '100%' }}>
      <FiltroPeriodo
        opcoes={[
          ...presets.map(p => ({ value: p.rotulo, label: p.rotulo })),
          { value: PERIODO_PERSONALIZADO, label: 'Personalizado' },
        ]}
        valor={valor}
        onMudar={novo => {
          const escolhido = presets.find(p => p.rotulo === novo)
          setPersonalizando(!escolhido)
          if (escolhido) ir(escolhido.de, escolhido.ate)
        }}
        ini={de}
        fim={ate}
        onPersonalizado={ir}
        dataMax={dataMax}
      />
    </div>
  )
}
