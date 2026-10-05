'use client'

import { useState } from 'react'
import SegmentedControl from '@/components/ui/segmented-control'
import SeletorPeriodo from '@/components/SeletorPeriodo'

// Valor da opção que abre o calendário ("Personalizado").
export const PERIODO_PERSONALIZADO = 'personalizado'

interface Props<T extends string> {
  opcoes: { value: T; label: string }[]
  valor: T
  onMudar: (valor: T) => void
  // Período que está valendo (AAAA-MM-DD) — é o que o calendário mostra.
  ini: string
  fim: string
  onPersonalizado: (ini: string, fim: string) => void
  // Último dia que dá pra escolher no calendário.
  dataMax?: string
  rotulo?: string
}

// Filtro de período dos relatórios: as opções num controle segmentado e, ao
// lado, quando a escolhida é "Personalizado", o período num calendário.
export default function FiltroPeriodo<T extends string>({
  opcoes, valor, onMudar, ini, fim, onPersonalizado, dataMax, rotulo = 'Período',
}: Props<T>) {
  const [calendarioAberto, setCalendarioAberto] = useState(false)

  return (
    <div className="filtro-periodo">
      <SegmentedControl
        label={rotulo}
        options={opcoes}
        value={valor}
        onValueChange={novo => {
          // Ao escolher "Personalizado" o calendário já abre.
          setCalendarioAberto(novo === PERIODO_PERSONALIZADO)
          if (novo !== valor) onMudar(novo as T)
        }}
      />
      {valor === PERIODO_PERSONALIZADO && (
        <SeletorPeriodo
          ini={ini}
          fim={fim}
          dataMax={dataMax}
          aberto={calendarioAberto}
          onAberto={setCalendarioAberto}
          onAplicar={(novoIni, novoFim) => {
            setCalendarioAberto(false)
            onPersonalizado(novoIni, novoFim)
          }}
        />
      )}
    </div>
  )
}
