'use client'

import { useEffect, useState } from 'react'
import { SidebarItem } from '@/components/ui/sidebar'

const CHAVE = 'saip:tema'

function aplicar(tema: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', tema)
  try { localStorage.setItem(CHAVE, tema) } catch { /* sem localStorage: vale só nesta visita */ }
}

// Item do menu que alterna claro/escuro. O tema inicial é definido antes
// da página pintar (script no <head> do layout raiz), então aqui só lemos.
export default function TemaToggle() {
  const [escuro, setEscuro] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o atributo definido pelo script do <head> (sistema externo), só possível após montar
    setEscuro(document.documentElement.getAttribute('data-theme') === 'dark')
  }, [])

  function alternar() {
    const novo = escuro ? 'light' : 'dark'
    aplicar(novo)
    setEscuro(novo === 'dark')
  }

  return (
    <SidebarItem
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }} aria-hidden="true">
          {escuro
            ? <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>
            : <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />}
        </svg>
      }
      onClick={alternar}
    >
      {escuro ? 'Tema claro' : 'Tema escuro'}
    </SidebarItem>
  )
}
