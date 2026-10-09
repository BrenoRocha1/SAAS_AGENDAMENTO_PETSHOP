'use client'

import { useLayoutEffect } from 'react'

// O tema escuro existe só no painel interno. Liga ao entrar nele e desliga
// ao sair (inclusive quando a equipe "entra na conta" de uma loja ou cliente,
// que são sempre claras).
export default function TemaEscuroInterno() {
  useLayoutEffect(() => {
    const raiz = document.documentElement
    raiz.setAttribute('data-theme', 'dark')
    return () => raiz.removeAttribute('data-theme')
  }, [])
  return null
}
