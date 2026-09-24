'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { assinarComSessao } from '@/lib/supabase/realtime'
import { tocarSom } from '@/lib/sons-notificacao'

interface Props {
  lojistaId: string
  somAtivo: boolean
  somTipo: string
}

// Sem UI de propósito — fica montado o tempo todo em QUALQUER página do
// painel (é renderizado no layout, não numa tela específica), porque a
// recepção pode estar olhando o Kanban, a Agenda ou o Dashboard no
// momento em que um agendamento novo chega.
//
// O disparo é Supabase Realtime (Postgres Changes) ouvindo só INSERT em
// `agendamento` — por construção, isso já resolve as duas exigências
// mais delicadas do pedido:
//   • nunca toca em UPDATE (editar, mudar status, trocar cliente/pet) —
//     não estamos nem escutando esse evento, só INSERT;
//   • nunca toca ao só abrir/atualizar a página — um refresh não gera
//     INSERT nenhum no banco, só uma leitura.
// E como não depende de QUEM criou o agendamento (Server Action do
// lojista, RPC do walk-in, ou futuramente o agendamento online do
// cliente), qualquer caminho que termine num INSERT na tabela já soa —
// não precisa de nenhum código extra quando o Agendamento Online for
// implementado de verdade.
export default function NotificacaoNovoAgendamento({ lojistaId, somAtivo, somTipo }: Props) {
  // Deduplica: se o Realtime reconectar e reenviar o mesmo evento, ou se
  // o efeito rodar de novo por alguma razão, o mesmo agendamento não toca
  // o som duas vezes.
  const jaNotificados = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!somAtivo || !lojistaId) return

    const supabase = createClient()
    const canal = supabase
      .channel(`novo-agendamento-${lojistaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agendamento', filter: `id_lojista=eq.${lojistaId}` },
        payload => {
          const id = (payload.new as { id_agendamento?: string } | null)?.id_agendamento
          if (id) {
            if (jaNotificados.current.has(id)) return
            jaNotificados.current.add(id)
          }
          tocarSom(somTipo)
        }
      )
    return assinarComSessao(supabase, canal)
  }, [lojistaId, somAtivo, somTipo])

  return null
}
