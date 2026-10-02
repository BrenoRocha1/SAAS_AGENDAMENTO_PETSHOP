'use client'

import { useEffect, useState, useTransition, type ComponentType, type SVGProps } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { logoutAction } from '@/lib/actions'
import { BarraMenuMobile, useMenuMobile, useTituloInterno } from '@/components/layout/MenuMobile'
import { IconLogout } from '@/components/icons'
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarNav,
  SidebarSection,
  SidebarToggle,
} from '@/components/ui/sidebar'

type Icone = ComponentType<SVGProps<SVGSVGElement>>

export interface ItemBarraLateral {
  href: string
  label: string
  icon: Icone
  ativo: boolean
}

interface Props {
  // Rótulo acima dos itens ("Gestão", "Menu"...).
  secao: string
  itens: ItemBarraLateral[]
  // Abas da barra de baixo no celular (a "pílula" do app). Sem elas (ou
  // com uma só), a barra não aparece.
  abas?: ItemBarraLateral[]
  iconeMarca: Icone
  // Texto depois de "SAIP" na marca (ex.: "Admin").
  sufixoMarca?: string
  tituloMobile?: string
  usuario: { nome: string; papel: string; iniciais: string; dica: string }
  // Chave do localStorage que lembra se o menu ficou recolhido.
  chaveColapso: string
  idBotaoSair?: string
}

const LARGURA = 260
const LARGURA_RECOLHIDA = 60

// Casca comum aos menus da loja, do cliente e do admin: barra do celular,
// recolher/expandir lembrado no navegador e o rodapé com o usuário e o
// "Sair". O visual é o do componente em src/components/ui/sidebar.tsx.
export default function BarraLateral({
  secao,
  itens,
  abas,
  iconeMarca: IconeMarca,
  sufixoMarca,
  tituloMobile,
  usuario,
  chaveColapso,
  idBotaoSair,
}: Props) {
  const [saindo, startTransition] = useTransition()
  const [colapsada, setColapsada] = useState(false)
  const menu = useMenuMobile()
  // Aberta no celular, sempre expandida (recolher é coisa do desktop).
  const recolhida = colapsada && !menu.aberto

  // Lembrar a preferência entre sessões (só neste navegador). Só dá pra ler
  // localStorage depois de montar no cliente — ler durante a renderização
  // daria hydration mismatch (o server sempre renderiza "expandida").
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura de localStorage é só possível pós-montagem; não é "espelhar prop", é sincronizar com um sistema externo
      setColapsada(localStorage.getItem(chaveColapso) === '1')
    } catch {
      // localStorage indisponível (aba privada etc.) — segue expandida
    }
  }, [chaveColapso])

  // A barra é position:fixed e .app-main tem margin-left casado com
  // --sidebar-width; ajustando essa variável no root, os dois seguem
  // juntos sem precisar levantar estado pra fora deste componente.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${colapsada ? LARGURA_RECOLHIDA : LARGURA}px`)
    return () => { document.documentElement.style.removeProperty('--sidebar-width') }
  }, [colapsada])

  function aoMudarColapso(nova: boolean) {
    setColapsada(nova)
    try { localStorage.setItem(chaveColapso, nova ? '1' : '0') } catch { /* ignora */ }
  }

  function sair() {
    startTransition(() => logoutAction())
  }

  // Celular: fora das abas, a barra do topo vira o cabeçalho do app (seta
  // de voltar + nome da tela), como nas telas de dentro de lá.
  const pathname = usePathname()
  const router = useRouter()
  const tituloInterno = useTituloInterno()
  const telaInterna = !!abas && abas.length > 1 && !abas.some(a => a.href === pathname)
  function voltar() {
    if (window.history.length > 1) router.back()
    else router.push(pathname.split('/').slice(0, -1).join('/') || '/')
  }

  return (
    <>
      <BarraMenuMobile
        aberto={menu.aberto}
        onAbrir={menu.abrir}
        onFechar={menu.fechar}
        titulo={tituloMobile}
        interna={telaInterna ? { titulo: tituloInterno, onVoltar: voltar } : null}
      />
      <aside className={`app-sidebar ${menu.aberto ? 'open' : ''}`}>
        <Sidebar
          variant="collapsible"
          collapsed={recolhida}
          onCollapsedChange={aoMudarColapso}
          width={LARGURA}
          collapsedWidth={LARGURA_RECOLHIDA}
          aria-label="Menu principal"
        >
          {/* Recolhida, a marca inteira vira o botão de expandir. */}
          <SidebarHeader
            aria-label={recolhida ? 'Expandir menu' : undefined}
            title={recolhida ? 'Expandir menu' : undefined}
          >
            <div className="sidebar-marca">
              <div className="sidebar-logo-icon">
                <IconeMarca style={{ width: 16, height: 16 }} />
              </div>
              {!recolhida && (
                <span className="sidebar-logo-text">
                  SA<span>IP</span>{sufixoMarca ? ` ${sufixoMarca}` : ''}
                </span>
              )}
            </div>
            <SidebarToggle style={{ marginLeft: 'auto' }} aria-label="Recolher menu" title="Recolher menu" />
          </SidebarHeader>

          <SidebarNav>
            <SidebarSection label={secao}>
              {itens.map(item => {
                const Icon = item.icon
                return (
                  <SidebarItem
                    key={item.href}
                    href={item.href}
                    active={item.ativo}
                    icon={<Icon style={{ width: 20, height: 20 }} />}
                  >
                    {item.label}
                  </SidebarItem>
                )
              })}
            </SidebarSection>
          </SidebarNav>

          <SidebarFooter>
            <div className="sidebar-user" title={usuario.dica}>
              <div className="sidebar-avatar">{usuario.iniciais}</div>
              {!recolhida && (
                <div className="sidebar-user-info">
                  <div className="sidebar-user-name">{usuario.nome}</div>
                  <div className="sidebar-user-role">{usuario.papel}</div>
                </div>
              )}
            </div>
            <SidebarItem
              id={idBotaoSair}
              icon={<IconLogout style={{ width: 20, height: 20 }} />}
              onClick={sair}
              disabled={saindo}
            >
              {saindo ? 'Saindo...' : 'Sair'}
            </SidebarItem>
          </SidebarFooter>
        </Sidebar>
      </aside>

      {/* Celular: a mesma barra de baixo do app — só ícones, e a aba aberta
          se estica pra mostrar o nome. Some no computador (globals.css). */}
      {abas && abas.length > 1 && (
        <nav className="barra-inferior" aria-label="Abas">
          <div className="barra-inferior-pilula">
            {abas.map(aba => {
              const Icon = aba.icon
              return (
                <Link
                  key={aba.href}
                  href={aba.href}
                  className={`barra-inferior-item ${aba.ativo ? 'is-ativa' : ''}`}
                  aria-current={aba.ativo ? 'page' : undefined}
                  aria-label={aba.label}
                >
                  <Icon style={{ width: 22, height: 22, flexShrink: 0 }} />
                  <span>{aba.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
