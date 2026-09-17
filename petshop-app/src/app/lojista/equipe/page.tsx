import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista, ehResponsavelPelaConta } from '@/lib/lojista-context'
import FuncionariosList from '@/components/lojista/FuncionariosList'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Equipe — Lojista' }

export default async function EquipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  const { data: funcionarios } = await supabase
    .from('funcionario')
    .select('*')
    .eq('id_lojista', contexto.idLojista)
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Equipe</h1>
          <p className="page-subtitle">Gerencie quem tem acesso ao painel do seu petshop</p>
        </div>
      </div>

      <FuncionariosList funcionarios={funcionarios ?? []} podeConcederAcessoTotal={ehResponsavelPelaConta(contexto)} />
    </>
  )
}
