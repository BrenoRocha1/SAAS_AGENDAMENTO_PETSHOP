'use client'

import { usePathname } from 'next/navigation'
import BarraLateral from '@/components/layout/BarraLateral'
import {
  IconPaw,
  IconHome,
  IconGrid,
  IconCalendar,
  IconKanban,
  IconChartBar,
  IconDog,
  IconScissors,
  IconPackage,
  IconUsers,
  IconSettings,
  IconCar,
  IconRoute,
  IconRepeat,
  IconCart,
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
  { href: '/lojista/agendamentos',  icon: IconCalendar,  label: 'Agenda', permissao: 'agenda' as const },
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
  // Planos recorrentes (migration 060) — financeiro: dono/administrador.
  { href: '/lojista/planos',        icon: IconRepeat,    label: 'Planos', restrito: true },
  { href: '/lojista/servicos',      icon: IconScissors,  label: 'Serviços', permissao: 'servicos' as const },
  { href: '/lojista/produtos',      icon: IconPackage,   label: 'Produtos', permissao: 'produtos' as const },
  { href: '/lojista/pdv',           icon: IconCart,      label: 'Caixa (PDV)', permissao: 'produtos' as const, tambem: ['/lojista/pdv/vendas'] },
  { href: '/lojista/clientes',      icon: IconUsers,     label: 'Clientes', permissao: 'clientesPets' as const },
  { href: '/lojista/pets',          icon: IconDog,       label: 'Pets', permissao: 'clientesPets' as const },
  { href: '/lojista/configuracoes', icon: IconSettings,  label: 'Configurações', restrito: true },
]

const CHAVE_COLAPSADA = 'saip:lojista-sidebar-colapsada'

// Barra de baixo no celular: as mesmas 4 abas do app (Início,
// Agendamentos, Clientes, Pets) — cada uma só aparece se a pessoa tem
// acesso àquela tela.
const ABAS_CELULAR = [
  { href: '/lojista/dashboard', label: 'Início', icon: IconHome },
  { href: '/lojista/agendamentos', label: 'Agenda', icon: IconCalendar },
  { href: '/lojista/clientes', label: 'Clientes', icon: IconUsers },
  { href: '/lojista/pets', label: 'Pets', icon: IconPaw },
]

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
  const nomeExibido = role === 'funcionario' ? (nomeUsuario ?? nomeLoja) : nomeLoja
  const initial = nomeExibido[0]?.toUpperCase() ?? 'P'

  const rotulo = (item: (typeof navItems)[number]) =>
    soMotorista && item.condicao === 'taxidog' ? 'Minhas corridas'
      : soMotorista && item.condicao === 'taxidogRotas' ? 'Minhas rotas'
      : item.label
  const abasPermitidas = ABAS_CELULAR.filter(aba => navItems.some(i => i.href === aba.href))
  // Quem não tem essas telas (ex.: só TaxiDog) fica com as primeiras do
  // próprio menu.
  const abas = (abasPermitidas.length > 1
    ? abasPermitidas
    : navItems.slice(0, 4).map(i => ({ href: i.href, label: rotulo(i), icon: i.icon }))
  ).map(aba => ({ ...aba, ativo: aba.href === hrefAtivo }))

  return (
    <BarraLateral
      secao="Gestão"
      itens={navItems.map(item => ({
        href: item.href,
        icon: item.icon,
        label: rotulo(item),
        ativo: item.href === hrefAtivo,
      }))}
      abas={abas}
      iconeMarca={IconPaw}
      usuario={{
        nome: nomeExibido,
        papel: role === 'lojista' ? 'Lojista' : acessoTotal ? 'Administrador' : 'Funcionário',
        iniciais: initial,
        dica: userEmail,
      }}
      chaveColapso={CHAVE_COLAPSADA}
      idBotaoSair="btn-logout-lojista"
    />
  )
}
