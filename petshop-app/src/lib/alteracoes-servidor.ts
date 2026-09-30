// Agendamentos que o CLIENTE alterou (trocou serviço/pet — migration 070 —
// ou remarcou — migration 071): a loja vê "Alterado pelo cliente" antes de
// aceitar. Consultas tolerantes: sem as migrations, volta vazio.

import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function idsAlteradosPeloCliente(
  supabase: Supabase,
  agendamentos: { id_agendamento: string; id_cliente: string | null }[],
): Promise<Set<string>> {
  const ids = agendamentos.map(a => a.id_agendamento)
  const resultado = new Set<string>()
  if (ids.length === 0) return resultado

  const clientePorId = new Map(agendamentos.map(a => [a.id_agendamento, a.id_cliente]))
  const [{ data: alteracoes }, { data: remarcacoes }] = await Promise.all([
    supabase.from('agendamento_alteracao').select('id_agendamento').eq('feito_por', 'cliente').in('id_agendamento', ids),
    supabase.from('agendamento_remarcacao').select('id_agendamento, id_usuario').in('id_agendamento', ids),
  ])
  for (const a of (alteracoes ?? []) as { id_agendamento: string }[]) resultado.add(a.id_agendamento)
  for (const r of (remarcacoes ?? []) as { id_agendamento: string; id_usuario: string | null }[]) {
    const cliente = clientePorId.get(r.id_agendamento)
    if (cliente && r.id_usuario === cliente) resultado.add(r.id_agendamento)
  }
  return resultado
}
