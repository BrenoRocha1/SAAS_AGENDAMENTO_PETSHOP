import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { redirect } from 'next/navigation'
import ClienteSidebar from '@/components/layout/ClienteSidebar'
import ContaDesativada from '@/components/acesso/ContaDesativada'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Cliente' }

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = await obterUsuario()

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

  // A foto da conta (migration 085) vem numa consulta à parte: enquanto a
  // coluna não existir no banco, o menu segue com o nome e as iniciais.
  const [{ data: cliente }, { data: foto }] = await Promise.all([
    supabase.from('cliente').select('nome, ativo').eq('id_cliente', user.id).single(),
    supabase.from('cliente').select('foto_url').eq('id_cliente', user.id).maybeSingle(),
  ])

  // Conta desativada pela equipe do SAIP (painel interno).
  if (cliente && cliente.ativo === false) {
    return <ContaDesativada titulo="Conta desativada" texto="Sua conta no SAIP foi desativada. Seus dados estão guardados — fale com o petshop ou com a gente para reativar." />
  }

  return (
    <div className="app-layout cliente-shell">
      <ClienteSidebar
        userName={cliente?.nome ?? user.email ?? 'Cliente'}
        userEmail={user.email ?? ''}
        userFoto={foto?.foto_url ?? null}
      />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
