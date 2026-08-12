import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LojistaSidebar from '@/components/layout/LojistaSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Lojista' }

export default async function LojistaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verifica role: user_metadata primeiro, depois tabela lojista como fallback
  // Isso evita loop de redirect quando user_metadata.role não está definido
  const metaRole = user.user_metadata?.role
  let isLojista = metaRole === 'lojista'

  if (!isLojista && metaRole !== 'cliente') {
    // role indefinido — consulta o banco como fonte de verdade
    const { data: lojistaRow } = await supabase
      .from('lojista')
      .select('id_lojista')
      .eq('id_lojista', user.id)
      .maybeSingle()
    isLojista = !!lojistaRow
  }

  if (!isLojista) redirect('/cliente/dashboard')

  const { data: lojista } = await supabase
    .from('lojista')
    .select('nome_loja')
    .eq('id_lojista', user.id)
    .single()

  return (
    <div className="app-layout">
      <LojistaSidebar
        nomeLoja={lojista?.nome_loja ?? 'Meu Petshop'}
        userEmail={user.email ?? ''}
      />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
