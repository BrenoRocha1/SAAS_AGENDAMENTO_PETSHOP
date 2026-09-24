import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO } from '@/lib/agenda'
import type { Agendamento } from '@/types/database'

// Mesmo select (com embed) que petshop-app/src/app/lojista/kanban/page.tsx
// já usa em produção pra agendamento->pet/servico/cliente/funcionario —
// é uma relação antiga e estável, não uma tabela nova recém-migrada, por
// isso o embed aqui é seguro (ver nota sobre cache de schema do PostgREST
// no repositório do dashboard web).
export function useAgendamentosHoje(idLojista: string | undefined) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idLojista) return
    setErro(null)
    const { data, error } = await supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor, obs, id_funcionario,
        pet:id_pet ( nome, raca, especie, porte, foto_url ),
        servico:id_servico ( nome ),
        cliente:id_cliente ( nome ),
        funcionario:id_funcionario ( nome )
      `)
      .eq('id_lojista', idLojista)
      .eq('dt_agendamento', hojeBrasilISO())
      .order('hr_agendamento')

    if (error) {
      setErro('Não foi possível carregar os agendamentos de hoje.')
    } else {
      setAgendamentos((data ?? []) as unknown as Agendamento[])
    }
    setLoading(false)
  }, [idLojista])

  useEffect(() => {
    setLoading(true)
    carregar()
  }, [carregar])

  // Ao vivo: agendamento novo/alterado na loja recarrega a lista (mesmo
  // canal que o painel web usa). Nome único por tela — Início e
  // Agendamentos usam este hook ao mesmo tempo.
  const idCanal = useId()
  useEffect(() => {
    if (!idLojista) return
    const canal = supabase
      .channel(`agenda-hoje-${idLojista}-${idCanal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamento', filter: `id_lojista=eq.${idLojista}` }, () => carregar())
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [idLojista, idCanal, carregar])

  return { agendamentos, loading, erro, recarregar: carregar }
}
