'use client'

import { useEffect } from 'react'

// Telas de entrada (login, cadastro, senha, acesso interno) são sempre
// claras, mesmo com o tema escuro ligado no painel. Ao sair delas, volta
// o tema que a pessoa tinha escolhido.
export default function ForcarTemaClaro() {
  useEffect(() => {
    const raiz = document.documentElement
    raiz.removeAttribute('data-theme')
    return () => {
      try {
        let t = localStorage.getItem('saip:tema')
        if (!t && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark'
        if (t === 'dark') raiz.setAttribute('data-theme', 'dark')
      } catch { /* sem localStorage: fica claro */ }
    }
  }, [])
  return null
}
