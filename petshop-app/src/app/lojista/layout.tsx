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

  // kanban_ativo (migration 013) decide se o item "Kanban" aparece no menu.
  // Se a migration ainda não rodou, a coluna não existe e o select abaixo
  // falha — nesse caso caímos pra uma consulta sem ela e assumimos o
  // padrão (true), sem derrubar o layout inteiro (usado por toda página
  // do lojista) por causa de uma coluna que ainda não existe no banco.
  let nomeLoja = 'Meu Petshop'
  let kanbanAtivo = true
  const { data: lojista, error: lojistaError } = await supabase
    .from('lojista')
    .select('nome_loja, kanban_ativo')
    .eq('id_lojista', user.id)
    .single()

  if (lojistaError) {
    const { data: fallback } = await supabase
      .from('lojista')
      .select('nome_loja')
      .eq('id_lojista', user.id)
      .single()
    nomeLoja = fallback?.nome_loja ?? nomeLoja
  } else {
    nomeLoja = lojista?.nome_loja ?? nomeLoja
    kanbanAtivo = lojista?.kanban_ativo ?? true
  }

  return (
    <div className="app-layout lojista-shell">
      <LojistaSidebar
        nomeLoja={nomeLoja}
        userEmail={user.email ?? ''}
        kanbanAtivo={kanbanAtivo}
      />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
