'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { IconChevronLeft, IconMenu } from '@/components/icons'
import LogoSaip from '@/components/LogoSaip'

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

// Título das telas de dentro no celular — os mesmos nomes do app
// (DetailHeader). O que não está aqui usa o título da própria página.
const TITULOS_DO_APP: [RegExp, string][] = [
  [/^\/lojista\/servicos/, 'Serviços'],
  [/^\/lojista\/produtos/, 'Produtos'],
  [/^\/lojista\/planos/, 'Planos'],
  [/^\/lojista\/equipe$/, 'Funcionários'],
  [/^\/lojista\/relatorios/, 'Relatórios'],
  [/^\/lojista\/configuracoes$/, 'Configurações'],
  [/^\/lojista\/configuracoes\/pagamentos/, 'Formas de pagamento'],
  [/^\/lojista\/configuracoes\/taxidog/, 'TaxiDog'],
  [/^\/lojista\/perfil/, 'Dados da loja'],
  [/^\/cliente\/novo-agendamento/, 'Novo agendamento'],
  [/^\/cliente\/pets\/novo/, 'Novo pet'],
  [/^\/cliente\/pets\/[^/]+\/editar/, 'Editar pet'],
  [/^\/cliente\/planos/, 'Meus planos'],
  [/^\/cliente\/perfil/, 'Meu perfil'],
]

// Título que a página mostra no computador (.page-title) — acompanha a
// troca de tela e o conteúdo que chega depois do esqueleto.
function assinarConteudo(aoMudar: () => void) {
  const observador = new MutationObserver(aoMudar)
  observador.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => observador.disconnect()
}
const tituloNaPagina = () => document.querySelector('.app-content .page-title')?.textContent?.trim() ?? ''

export function useTituloInterno(): string {
  const pathname = usePathname()
  const daPagina = useSyncExternalStore(assinarConteudo, tituloNaPagina, () => '')
  return TITULOS_DO_APP.find(([rota]) => rota.test(pathname))?.[1] ?? daPagina
}

export function BarraMenuMobile({ aberto, onAbrir, onFechar, titulo = 'SAIP', interna }: {
  aberto: boolean
  onAbrir: () => void
  onFechar: () => void
  titulo?: string
  // Tela de dentro (não é uma das abas): no celular a barra vira o
  // cabeçalho do app — seta de voltar e o nome da tela.
  interna?: { titulo: string; onVoltar: () => void } | null
}) {
  return (
    <>
      <div className={`menu-mobile-barra ${interna ? 'is-interna' : ''}`}>
        <div className="menu-mobile-raiz">
          <button type="button" className="menu-mobile-botao" onClick={onAbrir} aria-label="Abrir menu" aria-expanded={aberto}>
            <IconMenu style={{ width: 22, height: 22 }} />
          </button>
          {/* Mesma marca da barra do topo do app. */}
          <LogoSaip altura={22} sufixo={titulo.replace(/^SAIP\s*/, '') || undefined} />
        </div>
        {interna && (
          <div className="menu-mobile-interna">
            <button type="button" className="menu-mobile-botao" onClick={interna.onVoltar} aria-label="Voltar">
              <IconChevronLeft style={{ width: 22, height: 22 }} />
            </button>
            <span className="menu-mobile-interna-titulo">{interna.titulo}</span>
          </div>
        )}
      </div>
      {aberto && <div className="menu-mobile-fundo" onClick={onFechar} aria-hidden="true" />}
    </>
  )
}
