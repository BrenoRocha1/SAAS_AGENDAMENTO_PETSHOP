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
  if (user.user_metadata?.role !== 'lojista') redirect('/cliente/dashboard')

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
