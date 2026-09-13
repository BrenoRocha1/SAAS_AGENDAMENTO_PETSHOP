import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { format, subDays } from 'date-fns'
import { agoraBrasil } from '@/lib/agenda'
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

  // agoraBrasil(), não new Date(): o servidor roda em UTC, e "hoje"/"agora"
  // precisam refletir o horário da loja (Brasil), não o do servidor —
  // ver src/lib/agenda.ts.
  const hoje = agoraBrasil()
  const hojeISO = toISODate(hoje)
  const ontemISO = toISODate(subDays(hoje, 1))
  const selectedDate = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO

  // Todas as consultas abaixo são independentes entre si (só precisam do
  // lojistaId) — disparadas juntas numa única leva em vez de uma atrás da
  // outra, que é o que fazia a navegação entre páginas parecer lenta
  // (cada troca de página refaz essas 9 idas ao banco em sequência).
  const [
    { data: lojista },
    { data: metricas },
    { data: agendaHoje },
    { data: agendaOntem },
    { data: agendaSelecionada },
    { data: slotsHoje },
    { data: pendentesRaw },
    { data: vinculos },
    { data: petsVisiveis },
    { data: servicosRaw },
  ] = await Promise.all([
    supabase.from('lojista').select('nome_loja').eq('id_lojista', lojistaId).single(),
    supabase.rpc('fn_metricas_lojista', { p_id_lojista: lojistaId }),
    supabase.rpc('fn_agenda_dia', { p_id_lojista: lojistaId, p_data: hojeISO }),
    supabase.rpc('fn_agenda_dia', { p_id_lojista: lojistaId, p_data: ontemISO }),
    selectedDate === hojeISO
      ? Promise.resolve({ data: null })
      : supabase.rpc('fn_agenda_dia', { p_id_lojista: lojistaId, p_data: selectedDate }),
    supabase.rpc('fn_horarios_disponiveis', { p_id_lojista: lojistaId, p_data: hojeISO, p_duracao: 30 }),
    supabase
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
      .limit(12),
    // Todo cliente "conhecido" pelo lojista (migration 014) — inclui
    // quem já agendou E quem foi cadastrado direto pelo botão "Novo
    // Cliente" em /lojista/clientes, mesmo sem nenhum agendamento ainda.
    supabase
      .from('cliente_lojista')
      .select('cliente:id_cliente ( id_cliente, nome, telefone )')
      .eq('id_lojista', lojistaId),
    // Pets desses clientes — a policy de RLS (migration 015) já filtra
    // pra só trazer pet de cliente vinculado a este lojista.
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

  const m = (metricas as Record<string, number>) ?? {}

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
  const slots = (slotsHoje ?? []) as { hr_slot: string; disponivel: boolean }[]
  const horaAtualStr = format(hoje, 'HH:mm:ss')
  const livres = slots.filter(s => s.disponivel)
  const proximoLivre = livres.find(s => s.hr_slot > horaAtualStr) ?? null

  // ── Fila de espera: agendamentos Pendente (qualquer data futura) ──
  const pendentes = ((pendentesRaw ?? []) as unknown as PendenteItem[])

  // ── Clientes vinculados + seus pets (base para o modal "Novo Agendamento") ──
  // Todo cliente em cliente_lojista entra na lista, mesmo sem pet ainda
  // (o lojista cadastra o pet na hora, pelo próprio modal, se faltar).
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

  // ── Serviços ativos (para o modal) ──
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
