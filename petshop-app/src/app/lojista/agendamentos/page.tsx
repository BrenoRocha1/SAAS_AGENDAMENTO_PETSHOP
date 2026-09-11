import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { format, startOfWeek, addDays } from 'date-fns'
import AgendaCalendar, { type AgendamentoCalendario, type FuncionarioFiltro } from '@/components/lojista/AgendaCalendar'
import type { ClienteComPets, ServicoAtivo } from '@/components/lojista/DashboardClient'

export const metadata: Metadata = { title: 'Agendamentos' }

interface Props {
  searchParams: Promise<{ semana?: string }>
}

export default async function AgendamentosLojistaPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const lojistaId = user!.id

  const referencia = params.semana && /^\d{4}-\d{2}-\d{2}$/.test(params.semana)
    ? new Date(`${params.semana}T12:00:00`)
    : new Date()
  const inicioSemana = startOfWeek(referencia, { weekStartsOn: 0 })
  const fimSemana = addDays(inicioSemana, 6)
  const inicioSemanaISO = format(inicioSemana, 'yyyy-MM-dd')
  const fimSemanaISO = format(fimSemana, 'yyyy-MM-dd')

  const [
    { data: agendamentosRaw },
    { data: funcionariosRaw },
    { data: historico },
    { data: servicosRaw },
  ] = await Promise.all([
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor, id_funcionario,
        pet:id_pet ( nome ),
        servico:id_servico ( nome, duracao ),
        cliente:id_cliente ( nome ),
        funcionario:id_funcionario ( nome )
      `)
      .eq('id_lojista', lojistaId)
      .gte('dt_agendamento', inicioSemanaISO)
      .lte('dt_agendamento', fimSemanaISO)
      .neq('status', 'Cancelado'),
    supabase
      .from('funcionario')
      .select('id_funcionario, nome')
      .eq('id_lojista', lojistaId)
      .eq('ativo', true)
      .order('created_at'),
    supabase
      .from('agendamento')
      .select(`
        id_cliente,
        cliente:id_cliente ( id_cliente, nome, telefone ),
        pet:id_pet ( id_pet, nome, raca )
      `)
      .eq('id_lojista', lojistaId)
      .not('status', 'eq', 'Cancelado'),
    supabase
      .from('servico')
      .select('id_servico, nome, preco, duracao')
      .eq('id_lojista', lojistaId)
      .eq('status', 'Ativo')
      .order('nome'),
  ])

  const agendamentos: AgendamentoCalendario[] = ((agendamentosRaw ?? []) as unknown as Array<{
    id_agendamento: string
    dt_agendamento: string
    hr_agendamento: string
    status: 'Pendente' | 'Confirmado' | 'Concluído' | 'Cancelado'
    valor: number
    id_funcionario: string | null
    pet: { nome: string } | null
    servico: { nome: string; duracao: number } | null
    cliente: { nome: string } | null
    funcionario: { nome: string } | null
  }>).map(a => ({
    id_agendamento: a.id_agendamento,
    dt_agendamento: a.dt_agendamento,
    hr_agendamento: a.hr_agendamento,
    duracao: a.servico?.duracao ?? 30,
    status: a.status,
    valor: Number(a.valor),
    nome_pet: a.pet?.nome ?? 'Pet',
    nome_cliente: a.cliente?.nome ?? '—',
    nome_servico: a.servico?.nome ?? 'Serviço',
    id_funcionario: a.id_funcionario,
    nome_funcionario: a.funcionario?.nome ?? null,
  }))

  const funcionarios: FuncionarioFiltro[] = (funcionariosRaw ?? []) as FuncionarioFiltro[]

  const clientesMap = new Map<string, ClienteComPets>()
  for (const row of (historico ?? []) as unknown as Array<{
    id_cliente: string
    cliente: { id_cliente: string; nome: string; telefone: string } | null
    pet: { id_pet: string; nome: string; raca: string } | null
  }>) {
    if (!row.cliente) continue
    if (!clientesMap.has(row.id_cliente)) {
      clientesMap.set(row.id_cliente, { ...row.cliente, pets: [] })
    }
    const entry = clientesMap.get(row.id_cliente)!
    if (row.pet && !entry.pets.some(p => p.id_pet === row.pet!.id_pet)) {
      entry.pets.push(row.pet)
    }
  }
  const clientesComPets = Array.from(clientesMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  const servicos = (servicosRaw ?? []) as ServicoAtivo[]

  return (
    <AgendaCalendar
      lojistaId={lojistaId}
      inicioSemana={inicioSemanaISO}
      agendamentos={agendamentos}
      funcionarios={funcionarios}
      clientesComPets={clientesComPets}
      servicos={servicos}
    />
  )
}
