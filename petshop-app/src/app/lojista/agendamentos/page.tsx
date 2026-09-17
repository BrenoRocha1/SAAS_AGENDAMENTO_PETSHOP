import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { format, startOfWeek, addDays } from 'date-fns'
import { agoraBrasil } from '@/lib/agenda'
import { obterContextoLojista } from '@/lib/lojista-context'
import AgendaCalendar, { type AgendamentoCalendario, type FuncionarioFiltro } from '@/components/lojista/AgendaCalendar'
import type { ClienteComPets, ServicoAtivo } from '@/components/lojista/DashboardClient'
import { IconCalendar } from '@/components/icons'

export const metadata: Metadata = { title: 'Agendamentos' }

interface Props {
  searchParams: Promise<{ semana?: string; novoAgendamentoTutor?: string; novoAgendamentoProfissional?: string }>
}

export default async function AgendamentosLojistaPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarAgenda) {
    return (
      <div className="empty-state card">
        <IconCalendar style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Sem permissão para gerenciar a agenda</div>
        <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
      </div>
    )
  }

  const lojistaId = contexto.idLojista

  const referencia = params.semana && /^\d{4}-\d{2}-\d{2}$/.test(params.semana)
    ? new Date(`${params.semana}T12:00:00`)
    : agoraBrasil()
  const inicioSemana = startOfWeek(referencia, { weekStartsOn: 0 })
  const fimSemana = addDays(inicioSemana, 6)
  const inicioSemanaISO = format(inicioSemana, 'yyyy-MM-dd')
  const fimSemanaISO = format(fimSemana, 'yyyy-MM-dd')

  const [
    { data: agendamentosRaw },
    { data: funcionariosRaw },
    { data: vinculos },
    { data: petsVisiveis },
    { data: servicosRaw },
  ] = await Promise.all([
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor, id_funcionario, obs,
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
    // Todo cliente "conhecido" pelo lojista (migration 014) — inclui
    // quem já agendou e quem foi cadastrado direto em Clientes → Novo
    // Cliente, mesmo sem nenhum agendamento ainda.
    supabase
      .from('cliente_lojista')
      .select('cliente:id_cliente ( id_cliente, nome, telefone )')
      .eq('id_lojista', lojistaId),
    // Pets desses clientes — RLS (migration 015) já filtra pra só
    // trazer pet de cliente vinculado a este lojista.
    supabase
      .from('pet')
      .select('id_pet, id_cliente, nome, raca')
      .eq('ativo', true),
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
    obs: string | null
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
    obs: a.obs,
  }))

  const funcionarios: FuncionarioFiltro[] = (funcionariosRaw ?? []) as FuncionarioFiltro[]

  const clientesMap = new Map<string, ClienteComPets>()
  for (const v of (vinculos ?? []) as unknown as Array<{
    cliente: { id_cliente: string; nome: string; telefone: string } | null
  }>) {
    if (!v.cliente) continue
    if (!clientesMap.has(v.cliente.id_cliente)) {
      clientesMap.set(v.cliente.id_cliente, { ...v.cliente, pets: [] })
    }
  }
  for (const p of (petsVisiveis ?? []) as unknown as Array<{
    id_pet: string
    id_cliente: string
    nome: string
    raca: string
  }>) {
    const entry = clientesMap.get(p.id_cliente)
    if (entry) entry.pets.push({ id_pet: p.id_pet, nome: p.nome, raca: p.raca })
  }
  const clientesComPets = Array.from(clientesMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  const servicos = (servicosRaw ?? []) as ServicoAtivo[]

  // ?novoAgendamentoTutor=<id> (vem de "Novo agendamento" no perfil do
  // cliente) — o cliente já está em clientesComPets, não precisa de
  // outra consulta.
  const clienteFixoInicial = params.novoAgendamentoTutor
    ? clientesComPets.find(c => c.id_cliente === params.novoAgendamentoTutor) ?? null
    : null

  // ?novoAgendamentoProfissional=<id> (vem de "Novo Agendamento" no
  // perfil do funcionário) — confere que é mesmo um funcionário desta
  // loja antes de repassar como valor padrão do select.
  const funcionarioIdPadraoInicial = params.novoAgendamentoProfissional
    && funcionarios.some(f => f.id_funcionario === params.novoAgendamentoProfissional)
    ? params.novoAgendamentoProfissional
    : null

  return (
    <AgendaCalendar
      lojistaId={lojistaId}
      inicioSemana={inicioSemanaISO}
      agendamentos={agendamentos}
      funcionarios={funcionarios}
      clientesComPets={clientesComPets}
      servicos={servicos}
      clienteFixoInicial={clienteFixoInicial}
      funcionarioIdPadraoInicial={funcionarioIdPadraoInicial}
    />
  )
}
