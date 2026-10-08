import { notFound } from 'next/navigation'
import { getPlatformAdmin } from '@/lib/admin'
import InternoSidebar from '@/components/interno/InternoSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Interno — SAIP',
  robots: { index: false, follow: false },
}

export default async function InternoLayout({ children }: { children: React.ReactNode }) {
  // Quem não é admin da plataforma (ou nem está logado) recebe um 404
  // comum: nada na resposta confirma que este painel existe.
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  return (
    <div className="app-layout">
      <InternoSidebar nome={admin.nome ?? ''} email={admin.email} />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
