import { createClient } from '@/lib/supabase/server'
import PerfilLojistaForm from '@/components/lojista/PerfilLojistaForm'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Perfil da Loja' }

export default async function PerfilLojistaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: lojista } = await supabase
    .from('lojista')
    .select('*')
    .eq('id_lojista', user!.id)
    .single()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Perfil da Loja 🏪</h1>
        <p className="page-subtitle">Atualize as informações do seu estabelecimento</p>
      </div>
      <PerfilLojistaForm lojista={lojista} />
    </>
  )
}
