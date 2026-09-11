import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPlatformAdmin } from '@/lib/admin'
import AdminSidebar from '@/components/layout/AdminSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin — Plataforma' }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Autorização por tabela admin_usuario (migration 009) — não tem relação
  // com role_usuario (cliente/lojista). Quem não é admin da plataforma
  // simplesmente não sabe que essa rota existe: manda pra home, sem
  // mensagem de "acesso negado" que confirmaria a existência do painel.
  const admin = await getPlatformAdmin()
  if (!admin) redirect('/')

  return (
    <div className="app-layout">
      <AdminSidebar nome={admin.nome ?? ''} email={admin.email} />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
