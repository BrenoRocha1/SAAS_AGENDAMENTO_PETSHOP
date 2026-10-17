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

  // O cadastro de cliente decide (não só o papel do token): a conta pode ter
  // sido convertida pelo painel interno e o token ainda ter o papel antigo
  // por até 1 hora. A foto da conta (migration 085) vem numa consulta à
  // parte: sem a coluna, o menu segue com o nome e as iniciais.
  const metaRole = user.user_metadata?.role
  const [{ data: cliente }, { data: foto }] = await Promise.all([
    supabase.from('cliente').select('nome, ativo').eq('id_cliente', user.id).maybeSingle(),
    supabase.from('cliente').select('foto_url').eq('id_cliente', user.id).maybeSingle(),
  ])

  if (!cliente) {
    // Token diz "cliente", mas o cadastro não existe mais (virou loja):
    // sai e entra de novo, que o login leva para o lugar certo.
    if (metaRole === 'cliente') redirect('/auth/sair')
    // Loja, funcionário ou conta sem perfil: o layout da loja resolve.
    redirect('/lojista/dashboard')
  }

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
