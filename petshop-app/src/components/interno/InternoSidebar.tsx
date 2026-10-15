'use client'

import { usePathname } from 'next/navigation'
import BarraLateral from '@/components/layout/BarraLateral'
import { IconGrid, IconStore, IconUsers, IconCalendar, IconShield, IconList } from '@/components/icons'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { sairDoPainelAction } from '@/lib/actions-interno'

const navItems = [
  { href: ROTA_INTERNA, icon: IconGrid, label: 'Visão geral' },
  { href: `${ROTA_INTERNA}/empresas`, icon: IconStore, label: 'Empresas' },
  { href: `${ROTA_INTERNA}/clientes`, icon: IconUsers, label: 'Clientes' },
  { href: `${ROTA_INTERNA}/agendamentos`, icon: IconCalendar, label: 'Agendamentos' },
  { href: `${ROTA_INTERNA}/admins`, icon: IconShield, label: 'Administradores' },
  { href: `${ROTA_INTERNA}/registro`, icon: IconList, label: 'Registro de ações' },
]

const CHAVE_COLAPSADA = 'saip:interno-sidebar-colapsada'

interface Props {
  nome: string
  email: string
}

export default function InternoSidebar({ nome, email }: Props) {
  const pathname = usePathname()
  const initial = (nome || email)[0]?.toUpperCase() ?? 'A'

  return (
    <BarraLateral
      secao="Plataforma"
      itens={navItems.map(item => ({
        ...item,
        ativo: item.href === ROTA_INTERNA ? pathname === item.href : pathname.startsWith(item.href),
      }))}
      iconeMarca={IconStore}
      sufixoMarca="Interno"
      tituloMobile="SAIP Interno"
      usuario={{ nome: nome || email, papel: 'Dono da plataforma', iniciais: initial, dica: email }}
      chaveColapso={CHAVE_COLAPSADA}
      // Sair do painel volta para a entrada do painel, não para o login de clientes e lojas.
      acaoSair={sairDoPainelAction}
    />
  )
}
