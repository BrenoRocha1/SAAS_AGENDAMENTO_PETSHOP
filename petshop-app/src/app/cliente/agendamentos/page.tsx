import { createClient } from '@/lib/supabase/server'
import AgendamentosClienteList, { type AgendamentoCliente } from '@/components/cliente/AgendamentosClienteList'
import type { AvaliacaoExistente } from '@/components/cliente/AvaliacaoModal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Agendamentos' }

export default async function AgendamentosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: agendamentos }, { data: avaliacoesRaw }] = await Promise.all([
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor, obs,
        pet:id_pet ( nome, raca ),
        servico:id_servico ( nome, duracao ),
        lojista:id_lojista ( nome_loja, telefone )
      `)
      .eq('id_cliente', user!.id)
      .order('dt_agendamento', { ascending: false })
      .order('hr_agendamento', { ascending: false }),
    // Só as avaliações que o próprio cliente escreveu — a policy
    // "avaliacao: cliente ve proprias" (migration 034) já garante isso;
    // o .eq é a segunda camada, não a única.
    supabase
      .from('avaliacao')
      .select('id_avaliacao, id_agendamento, nota, comentario')
      .eq('id_cliente', user!.id),
  ])

  const avaliacoes: Record<string, AvaliacaoExistente> = {}
  for (const a of (avaliacoesRaw ?? []) as Array<AvaliacaoExistente & { id_agendamento: string }>) {
    avaliacoes[a.id_agendamento] = { id_avaliacao: a.id_avaliacao, nota: a.nota, comentario: a.comentario }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Meus Agendamentos</h1>
        <p className="page-subtitle">Histórico e agendamentos futuros</p>
      </div>

      <AgendamentosClienteList
        agendamentos={(agendamentos ?? []) as unknown as AgendamentoCliente[]}
        avaliacoes={avaliacoes}
      />
    </>
  )
}
