import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { format, subDays } from 'date-fns'
import DashboardClient, { type AgendaItem, type ClienteComPets, type PendenteItem, type ServicoAtivo } from '@/components/lojista/DashboardClient'

export const metadata: Metadata = { title: 'Dashboard — Lojista' }

interface Props {
  searchParams: Promise<{ data?: string }>
}

function toISODate(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export default async function LojistaDashboard({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const lojistaId = user!.id

  const { data: lojista } = await supabase
    .from('lojista')
    .select('nome_loja')
    .eq('id_lojista', lojistaId)
    .single()

  const hoje = new Date()
  const hojeISO = toISODate(hoje)
  const ontemISO = toISODate(subDays(hoje, 1))
  const selectedDate = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO

  // ── Métricas gerais (RPC existente) ─────────────────────────────
  const { data: metricas } = await supabase.rpc('fn_metricas_lojista', {
    p_id_lojista: lojistaId,
  })
  const m = (metricas as Record<string, number>) ?? {}

  // ── Agenda de hoje (para os cards) + de ontem (para o comparativo) ──
  const [{ data: agendaHoje }, { data: agendaOntem }, { data: agendaSelecionada }] = await Promise.all([
    supabase.rpc('fn_agenda_dia', { p_id_lojista: lojistaId, p_data: hojeISO }),
    supabase.rpc('fn_agenda_dia', { p_id_lojista: lojistaId, p_data: ontemISO }),
    selectedDate === hojeISO
      ? Promise.resolve({ data: null })
      : supabase.rpc('fn_agenda_dia', { p_id_lojista: lojistaId, p_data: selectedDate }),
  ])

  const listaHoje = (agendaHoje ?? []) as AgendaItem[]
  const listaOntem = (agendaOntem ?? []) as AgendaItem[]
  const listaSelecionada = selectedDate === hojeISO ? listaHoje : ((agendaSelecionada ?? []) as AgendaItem[])

  const faturamentoHoje = listaHoje.reduce((acc, a) => acc + Number(a.valor), 0)
  const faturamentoOntem = listaOntem.reduce((acc, a) => acc + Number(a.valor), 0)

  // "Pets em atendimento agora": confirmados cujo horário de hoje já começou e ainda não terminou
  const agoraMin = hoje.getHours() * 60 + hoje.getMinutes()
  function minutos(hhmmss: string) {
    const [h, mm] = hhmmss.split(':').map(Number)
    return h * 60 + mm
  }
  const emAtendimento = listaHoje.filter(a => {
    if (a.status !== 'Confirmado') return false
    const inicio = minutos(a.hr_agendamento)
    return agoraMin >= inicio && agoraMin < inicio + a.duracao
  })

  // ── Horários livres hoje (reaproveita fn_horarios_disponiveis com slot-base de 30min) ──
  const { data: slotsHoje } = await supabase.rpc('fn_horarios_disponiveis', {
    p_id_lojista: lojistaId,
    p_data: hojeISO,
    p_duracao: 30,
  })
  const slots = (slotsHoje ?? []) as { hr_slot: string; disponivel: boolean }[]
  const horaAtualStr = format(hoje, 'HH:mm:ss')
  const livres = slots.filter(s => s.disponivel)
  const proximoLivre = livres.find(s => s.hr_slot > horaAtualStr) ?? null

  // ── Fila de espera: agendamentos Pendente (qualquer data futura) ──
  const { data: pendentesRaw } = await supabase
    .from('agendamento')
    .select(`
      id_agendamento, dt_agendamento, hr_agendamento, valor,
      pet:id_pet ( nome, raca ),
      servico:id_servico ( nome ),
      cliente:id_cliente ( nome )
    `)
    .eq('id_lojista', lojistaId)
    .eq('status', 'Pendente')
    .order('dt_agendamento', { ascending: true })
    .order('hr_agendamento', { ascending: true })
    .limit(12)

  const pendentes = ((pendentesRaw ?? []) as unknown as PendenteItem[])

  // ── Clientes + pets já atendidos por este lojista (base para o modal) ──
  // Mesma lógica de agrupamento usada em /lojista/clientes.
  const { data: historico } = await supabase
    .from('agendamento')
    .select(`
      id_cliente,
      cliente:id_cliente ( id_cliente, nome, telefone ),
      pet:id_pet ( id_pet, nome, raca )
    `)
    .eq('id_lojista', lojistaId)
    .not('status', 'eq', 'Cancelado')

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

  // ── Serviços ativos (para o modal) ──
  const { data: servicosRaw } = await supabase
    .from('servico')
    .select('id_servico, nome, preco, duracao')
    .eq('id_lojista', lojistaId)
    .eq('status', 'Ativo')
    .order('nome')

  const servicos = (servicosRaw ?? []) as ServicoAtivo[]

  return (
    <DashboardClient
      nomeLoja={lojista?.nome_loja ?? 'Meu Petshop'}
      lojistaId={lojistaId}
      hojeISO={hojeISO}
      selectedDate={selectedDate}
      stats={{
        agendamentosHoje: m.hoje ?? listaHoje.length,
        agendamentosOntem: listaOntem.length,
        faturamentoHoje,
        faturamentoOntem,
        petsEmAtendimento: emAtendimento.map(a => a.nome_pet),
        horariosLivresHoje: livres.length,
        proximoHorarioLivre: proximoLivre?.hr_slot ?? null,
        pendentesTotal: m.pendentes ?? pendentes.length,
      }}
      agendaSelecionada={listaSelecionada}
      pendentes={pendentes}
      clientesComPets={clientesComPets}
      servicos={servicos}
    />
  )
}
