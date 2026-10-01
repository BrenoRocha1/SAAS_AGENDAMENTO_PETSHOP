'use client'

import { usePathname } from 'next/navigation'
import BarraLateral from '@/components/layout/BarraLateral'
import { IconGrid, IconStore } from '@/components/icons'

const navItems = [
  { href: '/admin', icon: IconGrid, label: 'Empresas' },
]

const CHAVE_COLAPSADA = 'saip:admin-sidebar-colapsada'

interface Props {
  nome: string
  email: string
}

export default function AdminSidebar({ nome, email }: Props) {
  const pathname = usePathname()

  const initial = (nome || email)[0]?.toUpperCase() ?? 'A'

  return (
    <BarraLateral
      secao="Plataforma"
      itens={navItems.map(item => ({ ...item, ativo: pathname === item.href }))}
      iconeMarca={IconStore}
      sufixoMarca="Admin"
      tituloMobile="SAIP Admin"
      usuario={{ nome: nome || email, papel: 'Admin da plataforma', iniciais: initial, dica: email }}
      chaveColapso={CHAVE_COLAPSADA}
    />
  )
}
