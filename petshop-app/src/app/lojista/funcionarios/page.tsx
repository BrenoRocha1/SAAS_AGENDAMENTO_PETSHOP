import { createClient } from '@/lib/supabase/server'
import FuncionariosList from '@/components/lojista/FuncionariosList'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Funcionários — Lojista' }

export default async function FuncionariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: funcionarios } = await supabase
    .from('funcionario')
    .select('*')
    .eq('id_lojista', user!.id)
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Funcionários</h1>
          <p className="page-subtitle">Gerencie a equipe do seu petshop</p>
        </div>
      </div>

      <FuncionariosList funcionarios={funcionarios ?? []} />
    </>
  )
}
