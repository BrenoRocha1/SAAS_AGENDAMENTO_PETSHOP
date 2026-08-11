import { createClient } from '@/lib/supabase/server'
import ServicosList from '@/components/lojista/ServicosList'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Serviços' }

export default async function ServicosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: servicos } = await supabase
    .from('servico')
    .select('*')
    .eq('id_lojista', user!.id)
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Serviços ✂️</h1>
        <p className="page-subtitle">Gerencie os serviços do seu petshop</p>
      </div>
      <ServicosList servicos={servicos ?? []} />
    </>
  )
}
