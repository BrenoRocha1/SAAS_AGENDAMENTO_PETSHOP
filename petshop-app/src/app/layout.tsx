import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'PetShop Agenda — Sistema de Agendamento para Pet Shops',
    template: '%s | PetShop Agenda',
  },
  description:
    'Plataforma SaaS completa para agendamento de banho e tosa. Gerencie seu petshop com facilidade e segurança.',
  keywords: ['petshop', 'agendamento', 'banho e tosa', 'pet', 'veterinário'],
  authors: [{ name: 'PetShop Agenda' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#7c3aed',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
