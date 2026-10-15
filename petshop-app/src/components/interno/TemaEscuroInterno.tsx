'use client'

import { useLayoutEffect } from 'react'

// O tema escuro existe só no painel interno. Liga ao entrar nele e desliga
// ao sair (inclusive quando a equipe "entra na conta" de uma loja, que é
// sempre clara).
export default function TemaEscuroInterno() {
  useLayoutEffect(() => {
    const raiz = document.documentElement
    raiz.setAttribute('data-theme', 'dark')
    return () => raiz.removeAttribute('data-theme')
  }, [])
  return null
}
