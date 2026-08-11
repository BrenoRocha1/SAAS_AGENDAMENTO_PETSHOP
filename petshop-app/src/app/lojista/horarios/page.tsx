import { createClient } from '@/lib/supabase/server'
import HorariosManager from '@/components/lojista/HorariosManager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Horários de Funcionamento' }

export default async function HorariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: horarios } = await supabase
    .from('horario')
    .select('*')
    .eq('id_lojista', user!.id)
    .order('dia_semana')

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Horários de Funcionamento ⏰</h1>
        <p className="page-subtitle">Configure os dias e horários em que seu petshop atende</p>
      </div>
      <HorariosManager horarios={horarios ?? []} />
    </>
  )
}
