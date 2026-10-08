import { notFound, redirect } from 'next/navigation'
import { getPlatformAdmin, segundoFatorOk } from '@/lib/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
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
  // Sem o código do app autenticador (2º fator), não entra.
  if (!(await segundoFatorOk())) redirect(`${ROTA_INTERNA}/verificar`)

  return (
    <div className="app-layout">
      <InternoSidebar nome={admin.nome ?? ''} email={admin.email} />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
