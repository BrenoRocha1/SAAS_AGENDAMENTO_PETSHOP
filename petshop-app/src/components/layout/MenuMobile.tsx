'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { IconMenu } from '@/components/icons'

// Até 1024px a barra lateral fica fora da tela (globals.css, "RESPONSIVO").
// Esta barra do topo tem o botão que abre ela; o fundo escuro, o Esc e a
// troca de página fecham.
export function useMenuMobile() {
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)
  const [pathAnterior, setPathAnterior] = useState(pathname)
  if (pathAnterior !== pathname) {
    setPathAnterior(pathname)
    setAberto(false)
  }

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  return { aberto, abrir: () => setAberto(true), fechar: () => setAberto(false) }
}

export function BarraMenuMobile({ aberto, onAbrir, onFechar, titulo = 'SAIP' }: {
  aberto: boolean
  onAbrir: () => void
  onFechar: () => void
  titulo?: string
}) {
  return (
    <>
      <div className="menu-mobile-barra">
        <button type="button" className="menu-mobile-botao" onClick={onAbrir} aria-label="Abrir menu" aria-expanded={aberto}>
          <IconMenu style={{ width: 22, height: 22 }} />
        </button>
        <span className="menu-mobile-titulo">{titulo}</span>
      </div>
      {aberto && <div className="menu-mobile-fundo" onClick={onFechar} aria-hidden="true" />}
    </>
  )
}
