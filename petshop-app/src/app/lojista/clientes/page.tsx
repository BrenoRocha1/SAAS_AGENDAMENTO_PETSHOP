import { createClient } from '@/lib/supabase/server'
import ClientesList, { type ClienteLinha } from '@/components/lojista/ClientesList'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Clientes' }

interface ClienteBasico {
  id_cliente: string
  nome: string
  telefone: string
  email: string
}

interface AgendamentoRow {
  cliente: ClienteBasico | null
  pet: { nome: string; raca: string } | null
}

interface VinculoRow {
  cliente: ClienteBasico | null
}

interface ClienteAcumulado extends ClienteBasico {
  pets: Set<string>
  totalAgendamentos: number
}

export default async function ClientesLojistaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Duas fontes, buscadas em paralelo:
  // 1) agendamentos — dá pets e contagem de quem já agendou.
  // 2) cliente_lojista (migration 014) — todo cliente "conhecido" pelo
  //    lojista, incluindo quem ele acabou de cadastrar e ainda não tem
  //    nenhum agendamento (sem isso, um cliente novo cadastrado pelo
  //    botão "Novo Cliente" não apareceria aqui).
  const [{ data: agendamentos }, { data: vinculos }] = await Promise.all([
    supabase
      .from('agendamento')
      .select(`
        cliente:id_cliente ( id_cliente, nome, telefone, email ),
        pet:id_pet ( nome, raca )
      `)
      .eq('id_lojista', user!.id)
      .not('status', 'eq', 'Cancelado')
      .returns<AgendamentoRow[]>(),
    supabase
      .from('cliente_lojista')
      .select('cliente:id_cliente ( id_cliente, nome, telefone, email )')
      .eq('id_lojista', user!.id)
      .returns<VinculoRow[]>(),
  ])

  // Agrupar por cliente único
  const clientesMap = new Map<string, ClienteAcumulado>()

  for (const v of vinculos ?? []) {
    const c = v.cliente
    if (!c) continue
    if (!clientesMap.has(c.id_cliente)) {
      clientesMap.set(c.id_cliente, { ...c, pets: new Set<string>(), totalAgendamentos: 0 })
    }
  }

  for (const ag of agendamentos ?? []) {
    const c = ag.cliente
    if (!c) continue
    if (!clientesMap.has(c.id_cliente)) {
      clientesMap.set(c.id_cliente, { ...c, pets: new Set<string>(), totalAgendamentos: 0 })
    }
    const entry = clientesMap.get(c.id_cliente)!
    entry.totalAgendamentos++
    if (ag.pet) entry.pets.add(`${ag.pet.nome} (${ag.pet.raca})`)
  }

  const clientes: ClienteLinha[] = Array.from(clientesMap.values())
    .map(c => ({ ...c, pets: Array.from(c.pets) }))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <p className="page-subtitle">Clientes do seu petshop</p>
      </div>

      <ClientesList clientes={clientes} />
    </>
  )
}
