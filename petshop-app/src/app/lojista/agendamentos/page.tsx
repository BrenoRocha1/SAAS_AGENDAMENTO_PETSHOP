import { createClient } from '@/lib/supabase/server'
import AgendamentosLojistaList from '@/components/lojista/AgendamentosLojistaList'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Agendamentos' }

export default async function AgendamentosLojistaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: agendamentos } = await supabase
    .from('agendamento')
    .select(`
      id_agendamento, dt_agendamento, hr_agendamento, status, valor, obs,
      cancelado_por, motivo_cancelamento,
      pet:id_pet ( nome, raca, sexo ),
      servico:id_servico ( nome, duracao ),
      cliente:id_cliente ( nome, telefone )
    `)
    .eq('id_lojista', user!.id)
    .order('dt_agendamento', { ascending: false })
    .order('hr_agendamento', { ascending: false })

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Agendamentos 📅</h1>
        <p className="page-subtitle">Gerencie todos os agendamentos do seu petshop</p>
      </div>
      <AgendamentosLojistaList agendamentos={agendamentos ?? []} />
    </>
  )
}
