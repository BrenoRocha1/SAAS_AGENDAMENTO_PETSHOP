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
      <head>
        {/* Inter/Plus Jakarta Sans (usadas em --font-body/--font-heading, ver
            globals.css) — carregadas aqui via <link>, não via @import dentro
            do CSS: o Turbopack não estava baixando o @import externo (zero
            requisição pra fonts.googleapis.com), fazendo tudo cair pra fonte
            genérica do sistema. <link> é o jeito confiável recomendado pra
            fontes externas quando não se usa next/font. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- essa regra é pra pages/_document.js (Pages Router); aqui é o root layout do App Router, que já envolve todas as rotas */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
