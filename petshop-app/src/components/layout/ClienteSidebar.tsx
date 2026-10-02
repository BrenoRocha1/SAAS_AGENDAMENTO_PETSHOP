'use client'

import { usePathname } from 'next/navigation'
import BarraLateral from '@/components/layout/BarraLateral'
import {
  IconPaw,
  IconHome,
  IconGrid,
  IconCalendar,
  IconPlus,
  IconDog,
  IconUser,
  IconStore,
  IconRepeat,
} from '@/components/icons'

const navItems = [
  { href: '/cliente/dashboard', icon: IconGrid, label: 'Dashboard' },
  { href: '/cliente/agendamentos', icon: IconCalendar, label: 'Meus Agendamentos' },
  { href: '/cliente/novo-agendamento', icon: IconPlus, label: 'Novo Agendamento' },
  { href: '/cliente/petshops', icon: IconStore, label: 'Petshops' },
  { href: '/cliente/pets', icon: IconDog, label: 'Meus Pets' },
  { href: '/cliente/planos', icon: IconRepeat, label: 'Meus Planos' },
  { href: '/cliente/perfil', icon: IconUser, label: 'Meu Perfil' },
]

const CHAVE_COLAPSADA = 'saip:cliente-sidebar-colapsada'

// Barra de baixo no celular: as mesmas 4 abas do app.
const ABAS_CELULAR = [
  { href: '/cliente/dashboard', label: 'Início', icon: IconHome },
  { href: '/cliente/agendamentos', label: 'Agendamentos', icon: IconCalendar },
  { href: '/cliente/pets', label: 'Pets', icon: IconPaw },
  { href: '/cliente/petshops', label: 'Petshops', icon: IconStore },
]

interface Props {
  userName: string
  userEmail: string
}

export default function ClienteSidebar({ userName, userEmail }: Props) {
  const pathname = usePathname()

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

  return (
    <BarraLateral
      secao="Menu"
      itens={navItems.map(item => ({
        ...item,
        ativo: pathname === item.href || pathname.startsWith(`${item.href}/`),
      }))}
      abas={ABAS_CELULAR.map(aba => ({
        ...aba,
        ativo: pathname === aba.href || pathname.startsWith(`${aba.href}/`),
      }))}
      iconeMarca={IconPaw}
      usuario={{ nome: userName, papel: 'Cliente', iniciais: initials, dica: userEmail }}
      chaveColapso={CHAVE_COLAPSADA}
      idBotaoSair="btn-logout-cliente"
    />
  )
}
