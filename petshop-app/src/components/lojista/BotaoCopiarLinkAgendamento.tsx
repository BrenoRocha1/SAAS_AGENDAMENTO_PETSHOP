'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconLink } from '@/components/icons'

interface Props {
  idLojista: string
  slug: string | null
}

// Botão compacto (mesmo estilo dos ícones da topbar do dashboard) só pra
// copiar o link — a edição/personalização do link em si mora em
// Configurações > Agendamentos (ver LinkAgendamentoOnline.tsx).
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
      className="dash-icon-btn"
      onClick={copiar}
      title={copiado ? 'Copiado!' : 'Copiar link de agendamento'}
      aria-label="Copiar link de agendamento"
    >
      {copiado ? <IconCheck /> : <IconLink />}
    </button>
  )
}
