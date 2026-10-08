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

// Sem tela, montado no layout (como o aviso de novo agendamento): toca o
// som da loja quando chega mensagem de um cliente no WhatsApp, em qualquer
// página do painel. Usa o mesmo som e o mesmo liga/desliga de Configurações
// → Notificações — não há outro sistema de aviso.
//
// Ouve só INSERT de mensagem de ENTRADA: resposta da equipe, mudança de
// status (entregue, lida) e aviso de sistema não tocam. Cada mensagem toca
// uma vez, mesmo que o tempo real reconecte e repita o evento.
export default function NotificacaoWhatsApp({ lojistaId, somAtivo, somTipo }: Props) {
  const jaAvisadas = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!somAtivo || !lojistaId) return

    const supabase = createClient()
    const canal = supabase
      .channel(`whatsapp-aviso-${lojistaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_mensagem', filter: `id_lojista=eq.${lojistaId}` },
        payload => {
          const nova = payload.new as { id_mensagem?: string; direcao?: string; tipo?: string } | null
          if (!nova?.id_mensagem || nova.direcao !== 'entrada' || nova.tipo === 'sistema') return
          if (jaAvisadas.current.has(nova.id_mensagem)) return
          jaAvisadas.current.add(nova.id_mensagem)
          tocarSom(somTipo)
        }
      )
    return assinarComSessao(supabase, canal)
  }, [lojistaId, somAtivo, somTipo])

  return null
}
