import { createClient } from '@/lib/supabase/server'
import AgendamentosClienteList from '@/components/cliente/AgendamentosClienteList'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Agendamentos' }

export default async function AgendamentosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: agendamentos } = await supabase
    .from('agendamento')
    .select(`
      id_agendamento, dt_agendamento, hr_agendamento, status, valor, obs,
      pet:id_pet ( nome, raca ),
      servico:id_servico ( nome, duracao ),
      lojista:id_lojista ( nome_loja, telefone )
    `)
    .eq('id_cliente', user!.id)
    .order('dt_agendamento', { ascending: false })
    .order('hr_agendamento', { ascending: false })

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Meus Agendamentos 📅</h1>
        <p className="page-subtitle">Histórico e agendamentos futuros</p>
      </div>

      <AgendamentosClienteList agendamentos={agendamentos ?? []} />
    </>
  )
}
