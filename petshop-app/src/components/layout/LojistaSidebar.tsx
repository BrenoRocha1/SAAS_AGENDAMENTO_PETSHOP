'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { logoutAction } from '@/lib/actions'
import { BarraMenuMobile, useMenuMobile } from '@/components/layout/MenuMobile'
import {
  IconPaw,
  IconGrid,
  IconCalendar,
  IconKanban,
  IconChartBar,
  IconDog,
  IconScissors,
  IconPackage,
  IconUsers,
  IconSettings,
  IconLogout,
  IconChevronLeft,
  IconChevronRight,
  IconCar,
  IconRoute,
} from '@/components/icons'

// Perfil da Loja e Horários saíram daqui — agora são acessados via
// Configurações (Loja → Dados da loja / Horários), que já é a central
// de navegação pra essas telas. As telas em si continuam existindo nas
// mesmas rotas de sempre, só não duplicam mais a entrada no menu.
// `restrito` marca os itens que só aparecem pro lojista dono ou pra um
// administrador (acesso_total) — um funcionário comum nunca vê
// Relatórios/Configurações, só a área coberta pelas permissões dele.
const navItemsBase = [
  { href: '/lojista/dashboard',     icon: IconGrid,      label: 'Dashboard', restrito: true },
  { href: '/lojista/agendamentos',  icon: IconCalendar,  label: 'Agendamentos', permissao: 'agenda' as const },
  // Gestor de Agendamentos (o Kanban). Dono/equipe com agenda chegam ao
  // TaxiDog por dentro dele ("Visualizar TaxiDog" → "Rotas do TaxiDog"),
  // então as telas do TaxiDog acendem este item (`tambem`).
  { href: '/lojista/kanban',        icon: IconKanban,    label: 'Gestor de Agendamentos', condicao: 'kanban' as const, permissao: 'agenda' as const, tambem: ['/lojista/taxidog'] },
  // Kanban de corridas e rotas no menu: pro TaxiDog ("Minhas corridas" /
  // "Minhas rotas") e pra loja com o Kanban desativado.
  { href: '/lojista/taxidog',       icon: IconCar,       label: 'TaxiDog', condicao: 'taxidog' as const, permissao: 'agenda' as const },
  { href: '/lojista/taxidog/rotas', icon: IconRoute,     label: 'Rotas do TaxiDog', condicao: 'taxidogRotas' as const },
  { href: '/lojista/taxidog/relatorio', icon: IconChartBar, label: 'Relatório de corridas', condicao: 'taxidogRelatorio' as const },
  { href: '/lojista/relatorios',    icon: IconChartBar,  label: 'Relatórios de Vendas', restrito: true },
  { href: '/lojista/servicos',      icon: IconScissors,  label: 'Serviços', permissao: 'servicos' as const },
  { href: '/lojista/produtos',      icon: IconPackage,   label: 'Produtos', permissao: 'produtos' as const },
  { href: '/lojista/clientes',      icon: IconUsers,     label: 'Clientes', permissao: 'clientesPets' as const },
  { href: '/lojista/pets',          icon: IconDog,       label: 'Pets', permissao: 'clientesPets' as const },
  { href: '/lojista/configuracoes', icon: IconSettings,  label: 'Configurações', restrito: true },
]

const CHAVE_COLAPSADA = 'saip:lojista-sidebar-colapsada'

interface Props {
  nomeLoja: string
  nomeUsuario?: string
  userEmail: string
  kanbanAtivo: boolean
  // taxidog_config.ativo (migration 042) — item "TaxiDog" só aparece ligado.
  taxidogAtivo?: boolean
  role?: 'lojista' | 'funcionario'
  podeGerenciarAgenda?: boolean
  podeGerenciarServicos?: boolean
  podeGerenciarProdutos?: boolean
  podeGerenciarClientesPets?: boolean
  acessoTotal?: boolean
  // Função TaxiDog: vê o item mesmo sem permissão de agenda (só as
  // corridas dele aparecem na tela).
  podeTaxidog?: boolean
}

export default function LojistaSidebar({
  nomeLoja,
  nomeUsuario,
  userEmail,
  kanbanAtivo,
  taxidogAtivo = false,
  role = 'lojista',
  podeGerenciarAgenda = true,
  podeGerenciarServicos = true,
  podeGerenciarProdutos = true,
  podeGerenciarClientesPets = true,
  acessoTotal = true,
  podeTaxidog = false,
}: Props) {
  const gestorDaAgenda = role === 'lojista' || acessoTotal || podeGerenciarAgenda
  // Quem só é TaxiDog (sem agenda) vê as telas com as corridas/rotas dele
  // — daí os nomes diferentes no menu.
  const soMotorista = podeTaxidog && !gestorDaAgenda

  // Administrador (funcionário com acesso_total) tem a MESMA visão do
  // lojista — nenhum item escondido, exatamente como se `role` fosse
  // 'lojista'. Só um funcionário comum passa pelo corte de permissões.
  const navItems = navItemsBase.filter(item => {
    if (item.condicao === 'kanban' && !kanbanAtivo) return false
    if (item.condicao === 'taxidog') return soMotorista || (gestorDaAgenda && taxidogAtivo && !kanbanAtivo)
    if (item.condicao === 'taxidogRotas') return soMotorista || (gestorDaAgenda && taxidogAtivo && !kanbanAtivo)
    if (item.condicao === 'taxidogRelatorio') return podeTaxidog
    if (role === 'funcionario' && !acessoTotal) {
      if (item.restrito) return false
      if (item.permissao === 'agenda') return podeGerenciarAgenda
      if (item.permissao === 'servicos') return podeGerenciarServicos
      if (item.permissao === 'produtos') return podeGerenciarProdutos
      if (item.permissao === 'clientesPets') return podeGerenciarClientesPets
    }
    return true
  })
  const pathname = usePathname()
  // Item ativo = o de caminho mais específico ("/lojista/taxidog/relatorio"
  // não acende também "/lojista/taxidog"). `tambem` = outras telas que
  // pertencem ao item.
  const hrefAtivo = navItems
    .map(i => ({
      href: i.href,
      alcance: [i.href, ...(i.tambem ?? [])]
        .filter(h => pathname === h || pathname.startsWith(`${h}/`))
        .reduce((maior, h) => Math.max(maior, h.length), -1),
    }))
    .filter(i => i.alcance >= 0)
    .sort((x, y) => y.alcance - x.alcance)[0]?.href
  const [isPending, startTransition] = useTransition()
  const [colapsada, setColapsada] = useState(false)
  const menu = useMenuMobile()

  // Lembrar a preferência entre sessões (só neste navegador — não precisa
  // de servidor pra isso, é só conveniência visual). Só dá pra ler
  // localStorage depois de montar no cliente — ler durante a renderização
  // daria hydration mismatch (o server sempre renderiza "expandida").
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura de localStorage é só possível pós-montagem; não é "espelhar prop", é sincronizar com um sistema externo
      setColapsada(localStorage.getItem(CHAVE_COLAPSADA) === '1')
    } catch {
      // localStorage indisponível (aba privada etc.) — segue expandida
    }
  }, [])

  // A sidebar é position:fixed e .app-main tem margin-left casado com
  // --sidebar-width; ajustando essa variável no root, os dois seguem
  // juntos sem precisar levantar estado pra fora deste componente.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', colapsada ? '76px' : '260px')
    return () => { document.documentElement.style.removeProperty('--sidebar-width') }
  }, [colapsada])

  function alternarColapso() {
    setColapsada(prev => {
      const novo = !prev
      try { localStorage.setItem(CHAVE_COLAPSADA, novo ? '1' : '0') } catch { /* ignora */ }
      return novo
    })
  }

  function handleLogout() {
    startTransition(() => logoutAction())
  }

  const nomeExibido = role === 'funcionario' ? (nomeUsuario ?? nomeLoja) : nomeLoja
  const initial = nomeExibido[0]?.toUpperCase() ?? 'P'

  return (
    <>
    <BarraMenuMobile aberto={menu.aberto} onAbrir={menu.abrir} onFechar={menu.fechar} />
    {/* Aberta no celular, sempre expandida (recolher é coisa do desktop). */}
    <aside className={`app-sidebar ${colapsada && !menu.aberto ? 'is-collapsed' : ''} ${menu.aberto ? 'open' : ''}`}>
      {/* Logo — recolhida, some e fica só o botão de expandir, pra nunca sobrepor nada */}
      <div className="sidebar-logo">
        {!colapsada && (
          <>
            <div className="sidebar-logo-icon">
              <IconPaw style={{ width: 18, height: 18 }} />
            </div>
            <span className="sidebar-logo-text">
              SA<span>IP</span>
            </span>
          </>
        )}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={alternarColapso}
          aria-label={colapsada ? 'Expandir menu' : 'Recolher menu'}
          title={colapsada ? 'Expandir menu' : 'Recolher menu'}
        >
          {colapsada ? <IconChevronRight style={{ width: 12, height: 12 }} /> : <IconChevronLeft style={{ width: 12, height: 12 }} />}
        </button>
      </div>

      {/* Navegação */}
      <nav className="sidebar-nav">
        {!colapsada && <span className="sidebar-section-label">Gestão</span>}
        {navItems.map(item => {
          const Icon = item.icon
          const label = soMotorista && item.condicao === 'taxidog' ? 'Minhas corridas'
            : soMotorista && item.condicao === 'taxidogRotas' ? 'Minhas rotas'
            : item.label
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${item.href === hrefAtivo ? 'active' : ''}`}
              title={colapsada ? label : undefined}
            >
              <span className="sidebar-link-icon">
                <Icon style={{ width: 18, height: 18 }} />
              </span>
              {!colapsada && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Loja + Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user" title={userEmail}>
          <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg, var(--primary-400), var(--primary-700))' }}>
            {initial}
          </div>
          {!colapsada && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{nomeExibido}</div>
              <div className="sidebar-user-role">
                {role === 'lojista' ? 'Lojista' : acessoTotal ? 'Administrador' : 'Funcionário'}
              </div>
            </div>
          )}
        </div>
        <button
          id="btn-logout-lojista"
          onClick={handleLogout}
          disabled={isPending}
          className="btn btn-ghost btn-sm btn-full"
          style={{ marginTop: 'var(--space-2)', justifyContent: colapsada ? 'center' : 'flex-start' }}
          title={colapsada ? 'Sair' : undefined}
        >
          <IconLogout style={{ width: 15, height: 15 }} />
          {!colapsada && (isPending ? 'Saindo...' : 'Sair')}
        </button>
      </div>
    </aside>
    </>
  )
}
