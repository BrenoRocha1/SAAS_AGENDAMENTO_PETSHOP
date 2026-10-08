import type { Metadata } from 'next'
// Tailwind (só dos componentes em src/components/ui) vem antes do
// globals.css de propósito — ver o cabeçalho de tailwind.css.
import './tailwind.css'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'SAIP — Sistema de agendamento inteligente para petshop',
    template: '%s | SAIP',
  },
  description:
    'Plataforma SaaS completa para agendamento de banho e tosa. Gerencie seu petshop com facilidade e segurança.',
  keywords: ['petshop', 'agendamento', 'banho e tosa', 'pet', 'veterinário'],
  authors: [{ name: 'SAIP' }],
  openGraph: { images: [{ url: '/logo-saip.webp', width: 1774, height: 887, alt: 'SAIP' }] },
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#4f46e5',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Tema escuro: decidido antes da primeira pintura (sem piscar). Vale
            a escolha salva no navegador; sem escolha, o tema do sistema. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('saip:tema');if(/^\\/(login|cadastro|esqueci-senha|redefinir-senha|completar-cadastro|central-k7x2q9\\/entrar)/.test(location.pathname))t='light';else if(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}",
          }}
        />
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
