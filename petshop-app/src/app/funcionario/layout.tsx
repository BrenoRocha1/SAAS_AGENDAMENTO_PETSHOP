import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FuncionarioSidebar from '@/components/layout/FuncionarioSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Funcionário' }

export default async function FuncionarioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verifica role: user_metadata primeiro, depois tabela funcionario como fallback
  const metaRole = user.user_metadata?.role
  let isFuncionario = metaRole === 'funcionario'

  if (!isFuncionario && metaRole !== 'lojista' && metaRole !== 'cliente') {
    // role indefinido — consulta o banco como fonte de verdade
    const { data: funcRow } = await supabase
      .from('funcionario')
      .select('id_funcionario')
      .eq('id_funcionario', user.id)
      .eq('ativo', true)
      .maybeSingle()
    isFuncionario = !!funcRow
  }

  if (!isFuncionario) {
    // Redirecionar baseado no role real
    if (metaRole === 'lojista') redirect('/lojista/dashboard')
    redirect('/cliente/dashboard')
  }

  // Buscar dados do funcionário + nome da loja
  const { data: funcionario } = await supabase
    .from('funcionario')
    .select('nome, cargo, pode_gerenciar_agenda, pode_gerenciar_servicos, ativo, id_lojista')
    .eq('id_funcionario', user.id)
    .single()

  if (!funcionario || !funcionario.ativo) {
    // Funcionário desativado — fazer logout
    await supabase.auth.signOut()
    redirect('/login')
  }

  // Buscar nome do petshop
  const { data: lojista } = await supabase
    .from('lojista')
    .select('nome_loja')
    .eq('id_lojista', funcionario.id_lojista)
    .single()

  return (
    <div className="app-layout">
      <FuncionarioSidebar
        nomeFunc={funcionario.nome ?? 'Funcionário'}
        nomeLoja={lojista?.nome_loja ?? 'Petshop'}
        userEmail={user.email ?? ''}
        podeAgenda={funcionario.pode_gerenciar_agenda}
        podeServicos={funcionario.pode_gerenciar_servicos}
      />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
