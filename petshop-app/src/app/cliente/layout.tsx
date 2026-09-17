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

  // Verifica role: user_metadata primeiro, depois tabela cliente como fallback
  // Isso evita loop de redirect quando user_metadata.role não está definido
  const metaRole = user.user_metadata?.role
  let isCliente = metaRole === 'cliente'

  if (!isCliente && metaRole !== 'lojista') {
    // role indefinido — consulta o banco como fonte de verdade
    const { data: clienteRow } = await supabase
      .from('cliente')
      .select('id_cliente')
      .eq('id_cliente', user.id)
      .maybeSingle()
    isCliente = !!clienteRow
  }

  if (!isCliente) redirect('/lojista/dashboard')

  const { data: cliente } = await supabase
    .from('cliente')
    .select('nome')
    .eq('id_cliente', user.id)
    .single()

  return (
    <div className="app-layout cliente-shell">
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
