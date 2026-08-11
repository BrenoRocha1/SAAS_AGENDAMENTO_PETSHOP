import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClienteSidebar from '@/components/layout/ClienteSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Cliente' }

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (user.user_metadata?.role !== 'cliente') redirect('/lojista/dashboard')

  const { data: cliente } = await supabase
    .from('cliente')
    .select('nome')
    .eq('id_cliente', user.id)
    .single()

  return (
    <div className="app-layout">
      <ClienteSidebar
        userName={cliente?.nome ?? user.email ?? 'Cliente'}
        userEmail={user.email ?? ''}
      />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
