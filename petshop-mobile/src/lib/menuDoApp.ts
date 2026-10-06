import type { ComponentType } from 'react'
import {
  IconeAgenda,
  IconeCachorro,
  IconeClientes,
  IconeConfiguracoes,
  IconeCorridas,
  IconeHistorico,
  IconeMais,
  IconePainel,
  IconePerfil,
  IconePetshops,
  IconePlanos,
  IconeProdutos,
  IconeRelatorios,
  IconeRotas,
  IconeServicos,
  type IconeAbaProps,
} from '@/components/IconesAbas'
import type { ModoApp } from '@/contexts/AuthContext'
import type { ContextoLojista } from '@/lib/lojistaContext'

export interface ItemMenu {
  icone: ComponentType<IconeAbaProps>
  label: string
  rota: string
  // Aba da área (troca de aba) — as demais são telas abertas por cima.
  aba?: boolean
}

interface ItemLoja extends ItemMenu {
  // Só o dono ou um administrador (acesso total) vê — igual ao site.
  restrito?: boolean
  permissao?: 'agenda' | 'servicos' | 'produtos' | 'clientesPets'
}

// Menu da loja: os MESMOS itens, ícones e ordem da barra lateral do site
// (petshop-app/src/components/layout/LojistaSidebar.tsx → navItemsBase).
// Mudou lá, muda aqui. Ficam de fora só as telas que o app não tem: o
// Gestor de Agendamentos (o quadro) e as do TaxiDog, que aqui é uma área à
// parte. Funcionários e Dados da loja ficam dentro de Configurações, como
// no site.
const ITENS_LOJA: ItemLoja[] = [
  { icone: IconePainel, label: 'Dashboard', rota: '/', aba: true },
  { icone: IconeAgenda, label: 'Agendamentos', rota: '/agendamentos', aba: true, permissao: 'agenda' },
  { icone: IconeRelatorios, label: 'Relatórios de Vendas', rota: '/mais/relatorios', restrito: true },
  { icone: IconePlanos, label: 'Planos', rota: '/mais/planos', restrito: true },
  { icone: IconeServicos, label: 'Serviços', rota: '/mais/servicos', permissao: 'servicos' },
  { icone: IconeProdutos, label: 'Produtos', rota: '/mais/produtos', permissao: 'produtos' },
  { icone: IconeClientes, label: 'Clientes', rota: '/clientes', aba: true, permissao: 'clientesPets' },
  { icone: IconeCachorro, label: 'Pets', rota: '/pets', aba: true, permissao: 'clientesPets' },
  { icone: IconeConfiguracoes, label: 'Configurações', rota: '/mais/configuracoes', restrito: true },
]

// Quem só é TaxiDog vê no site "Minhas corridas" e "Minhas rotas", nessa
// ordem e com esses ícones; o app tem ainda a Início e o Histórico.
const ITENS_TAXIDOG: ItemMenu[] = [
  { icone: IconePainel, label: 'Dashboard', rota: '/taxidog', aba: true },
  { icone: IconeCorridas, label: 'Minhas corridas', rota: '/taxidog/corridas', aba: true },
  { icone: IconeRotas, label: 'Minhas rotas', rota: '/taxidog/rotas', aba: true },
  { icone: IconeHistorico, label: 'Histórico', rota: '/taxidog/historico', aba: true },
]

// Menu do cliente: os mesmos itens, ícones e ordem do site
// (petshop-app/src/components/layout/ClienteSidebar.tsx → navItems).
const ITENS_CLIENTE: ItemMenu[] = [
  { icone: IconePainel, label: 'Dashboard', rota: '/cliente', aba: true },
  { icone: IconeAgenda, label: 'Meus Agendamentos', rota: '/cliente/agendamentos', aba: true },
  { icone: IconeMais, label: 'Novo Agendamento', rota: '/cliente/agendamentos/novo' },
  { icone: IconePetshops, label: 'Petshops', rota: '/cliente/petshops', aba: true },
  { icone: IconeCachorro, label: 'Meus Pets', rota: '/cliente/pets', aba: true },
  { icone: IconePlanos, label: 'Meus Planos', rota: '/cliente/menu/planos' },
  { icone: IconePerfil, label: 'Meu Perfil', rota: '/cliente/menu/perfil' },
]

export const MENU_DA_AREA: Record<ModoApp, { secao: string; inicio: string }> = {
  loja: { secao: 'Gestão', inicio: '/' },
  taxidog: { secao: 'TaxiDog', inicio: '/taxidog' },
  cliente: { secao: 'Menu', inicio: '/cliente' },
}

// Itens que a pessoa vê, já com o corte de permissões do site: dono e
// administrador veem tudo; funcionário comum não vê o que é `restrito` e
// só vê o resto se tiver a permissão. A Início fica pra todo mundo porque,
// no app, é a tela de entrada da equipe inteira.
export function itensDoMenu(modo: ModoApp, contexto: ContextoLojista | null): ItemMenu[] {
  if (modo === 'cliente') return ITENS_CLIENTE
  if (modo === 'taxidog') return ITENS_TAXIDOG
  if (!contexto || contexto.role === 'lojista' || contexto.acessoTotal) return ITENS_LOJA
  return ITENS_LOJA.filter(item => {
    if (item.restrito) return false
    if (item.permissao === 'agenda') return contexto.podeGerenciarAgenda
    if (item.permissao === 'servicos') return contexto.podeGerenciarServicos
    if (item.permissao === 'produtos') return contexto.podeGerenciarProdutos
    if (item.permissao === 'clientesPets') return contexto.podeGerenciarClientesPets
    return true
  })
}

// Item da tela atual = o de rota mais específica ("/cliente/agendamentos/novo"
// não acende também "/cliente/agendamentos") — mesma regra do site.
export function rotaAtiva(itens: ItemMenu[], pathname: string, inicio: string): string | undefined {
  return itens
    .filter(i => (i.rota === inicio ? pathname === i.rota : pathname === i.rota || pathname.startsWith(`${i.rota}/`)))
    .sort((a, b) => b.rota.length - a.rota.length)[0]?.rota
}
