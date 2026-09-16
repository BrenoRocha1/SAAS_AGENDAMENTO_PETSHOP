'use client'

import { useEffect, useState } from 'react'
import { IconCheck, IconCopy, IconLink } from '@/components/icons'

interface Props {
  idLojista: string
}

export default function LinkAgendamentoOnline({ idLojista }: Props) {
  const [copiado, setCopiado] = useState(false)
  // window.location.origin só existe no navegador — evita hardcodar
  // domínio (funciona igual em dev, preview e produção). Fica vazio no
  // primeiro render do servidor e preenche assim que monta no cliente.
  const [link, setLink] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window só existe pós-montagem; não é "espelhar prop", é sincronizar com um sistema externo (mesmo padrão de LojistaSidebar.tsx)
    setLink(`${window.location.origin}/agendamento/${idLojista}`)
  }, [idLojista])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // clipboard indisponível (http sem TLS, permissão negada etc.) — sem alarde, o link já está selecionável no input
    }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-3)' }}>
        <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconLink style={{ width: 17, height: 17 }} /></span>
        <div>
          <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>Link de agendamento</div>
          <div className="text-sm text-muted">Compartilhe com seus clientes (WhatsApp, Instagram, etc.) para eles agendarem direto.</div>
        </div>
      </div>
      <div className="flex gap-2">
        <input className="form-input" value={link} readOnly onFocus={e => e.target.select()} />
        <button type="button" className="btn btn-secondary" onClick={copiar} style={{ flexShrink: 0 }}>
          {copiado ? <IconCheck style={{ width: 14, height: 14 }} /> : <IconCopy style={{ width: 14, height: 14 }} />}
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}
