'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconCopy } from '@/components/icons'

interface Props {
  idLojista: string
  slug: string | null
}

// Reaproveita o mesmo visual de "dash-store-badge" (o badge da loja, ao
// lado) de propósito: um ícone sozinho (versão anterior) não deixava
// claro pra quem não é técnico o que o botão fazia. Com texto do lado,
// fica óbvio — igual todo botão com ação real no resto do dashboard.
export default function BotaoCopiarLinkAgendamento({ idLojista, slug }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [origem, setOrigem] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window só existe pós-montagem; não é "espelhar prop", é sincronizar com um sistema externo (mesmo padrão de LojistaSidebar.tsx)
    setOrigem(window.location.origin)
  }, [])

  async function copiar() {
    const link = `${origem}/agendamento/${slug ?? idLojista}`
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // clipboard indisponível — sem alarde, o lojista ainda acha o link em Configurações
    }
  }

  return (
    <button
      type="button"
      className="dash-store-badge"
      onClick={copiar}
      title="Copiar link de agendamento online"
      style={{ cursor: 'pointer', border: copiado ? '1px solid var(--success-500)' : undefined }}
    >
      {copiado ? <IconCheck style={{ color: 'var(--success-400)' }} /> : <IconCopy />}
      {copiado ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}
