'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { addDays, format, parseISO } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { assinarComSessao } from '@/lib/supabase/realtime'
import { tocarSom } from '@/lib/sons-notificacao'
import { hojeBrasilISO } from '@/lib/agenda'
import { ROTULO_MODALIDADE, normalizarCorrida } from '@/lib/taxidog'
import { IconCar, IconClose } from '@/components/icons'

// Evento/canal que o painel dispara quando o TaxiDog aperta "Atribuir para
// mim": a corrida que chega logo depois como "atribuída a você" foi ele
// mesmo que pegou — não vira notificação. BroadcastChannel cobre outra
// aba aberta do mesmo navegador.
export const EVENTO_CORRIDA_ASSUMIDA = 'saip:corrida-assumida'

type Tipo = 'disponivel' | 'atribuida' | 'pronta'
type Linha = { id_corrida: string; status: string; id_funcionario: string | null }
interface Aviso {
  chave: string
  titulo: string
  mensagem: string
  href: string
}

const TITULO: Record<Tipo, string> = {
  disponivel: 'Nova corrida disponível',
  atribuida: 'Nova corrida para você',
  pronta: 'Pronto para entrega',
}

// Notificação do TaxiDog no painel web (montada no layout só pra quem tem
// a função TaxiDog): corrida nova disponível, corrida atribuída a ele e
// pet pronto para entrega. Mesmo Realtime da atualização ao vivo; a RLS
// (migration 046) só entrega as corridas dele e as ainda sem TaxiDog.
// Não duplica: guarda o último estado de cada corrida e só avisa numa
// transição de verdade, uma vez por (corrida, tipo).
export default function NotificacaoNovaCorrida({ lojistaId, userId, somAtivo, somTipo }: {
  lojistaId: string
  userId: string
  somAtivo: boolean
  somTipo: string
}) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const conhecidas = useRef(new Map<string, { status: string; id_funcionario: string | null }>())
  const jaAvisados = useRef(new Set<string>())
  const assumidasPorMim = useRef(new Map<string, number>())

  useEffect(() => {
    const marcar = (id: unknown) => { if (typeof id === 'string') assumidasPorMim.current.set(id, Date.now()) }
    const noEvento = (e: Event) => marcar((e as CustomEvent).detail)
    window.addEventListener(EVENTO_CORRIDA_ASSUMIDA, noEvento)
    let canalAbas: BroadcastChannel | null = null
    try {
      canalAbas = new BroadcastChannel(EVENTO_CORRIDA_ASSUMIDA)
      canalAbas.onmessage = e => marcar(e.data)
    } catch {
      // Navegador sem BroadcastChannel — só a aba atual fica coberta.
    }
    return () => {
      window.removeEventListener(EVENTO_CORRIDA_ASSUMIDA, noEvento)
      canalAbas?.close()
    }
  }, [])

  const fechar = useCallback((chave: string) => {
    setAvisos(prev => prev.filter(a => a.chave !== chave))
  }, [])

  const avisar = useCallback(async (supabase: SupabaseClient, idCorrida: string, tipo: Tipo) => {
    const chave = `${idCorrida}:${tipo}`
    if (jaAvisados.current.has(chave)) return
    jaAvisados.current.add(chave)

    const hoje = hojeBrasilISO()
    const { data } = await supabase.rpc('fn_listar_corridas', { p_data_ini: hoje, p_data_fim: hoje, p_id_corrida: idCorrida })
    const linha = (data as Record<string, unknown>[] | null)?.[0]
    if (!linha) return
    const c = normalizarCorrida(linha)
    const quando = `${format(parseISO(c.dt_agendamento), 'dd/MM')} às ${c.hr_agendamento.slice(0, 5)}`
    const verbo = c.modalidade === 'entregar' ? 'Entregar' : 'Buscar'

    setAvisos(prev => [...prev.slice(-2), {
      chave,
      titulo: TITULO[tipo],
      mensagem: tipo === 'pronta'
        ? `${c.pet_nome} está pronto para entrega — ${c.logradouro}, ${c.numero}`
        : `${verbo} ${c.pet_nome} · ${quando} · ${ROTULO_MODALIDADE[c.modalidade]}`,
      href: `/lojista/taxidog?data=${c.dt_agendamento}`,
    }])
    if (somAtivo) tocarSom(somTipo)
    setTimeout(() => fechar(chave), 12000)
  }, [somAtivo, somTipo, fechar])

  useEffect(() => {
    const supabase = createClient()
    let cancelado = false

    // Semente: o que já existe ao abrir o painel não gera aviso.
    const hoje = parseISO(hojeBrasilISO())
    supabase
      .rpc('fn_listar_corridas', { p_data_ini: format(addDays(hoje, -1), 'yyyy-MM-dd'), p_data_fim: format(addDays(hoje, 60), 'yyyy-MM-dd') })
      .then(({ data }) => {
        if (cancelado) return
        for (const r of (data ?? []) as Linha[]) {
          if (!conhecidas.current.has(r.id_corrida)) conhecidas.current.set(r.id_corrida, { status: r.status, id_funcionario: r.id_funcionario })
        }
      })

    const canal = supabase
      .channel(`taxidog-notificacao-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${lojistaId}` }, payload => {
        const nova = payload.new as Linha | null
        if (!nova?.id_corrida) return
        const anterior = conhecidas.current.get(nova.id_corrida)
        conhecidas.current.set(nova.id_corrida, { status: nova.status, id_funcionario: nova.id_funcionario })
        if (nova.status === 'concluida' || nova.status === 'cancelada') return

        if (payload.eventType === 'INSERT') {
          if (!nova.id_funcionario) avisar(supabase, nova.id_corrida, 'disponivel')
          else if (nova.id_funcionario === userId) avisar(supabase, nova.id_corrida, 'atribuida')
          return
        }
        if (nova.id_funcionario !== userId) return
        if (anterior?.id_funcionario !== userId) {
          const quando = assumidasPorMim.current.get(nova.id_corrida)
          if (quando && Date.now() - quando < 60_000) return
          avisar(supabase, nova.id_corrida, 'atribuida')
        } else if (anterior.status !== 'pronto_entrega' && nova.status === 'pronto_entrega') {
          avisar(supabase, nova.id_corrida, 'pronta')
        }
      })
    const desfazer = assinarComSessao(supabase, canal)

    return () => {
      cancelado = true
      desfazer()
    }
  }, [lojistaId, userId, avisar])

  if (avisos.length === 0) return null

  return (
    <div className="toast-pilha" role="status" aria-live="polite">
      {avisos.map(a => (
        <div key={a.chave} className="toast">
          <span className="toast-icone"><IconCar style={{ width: 18, height: 18 }} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast-titulo">{a.titulo}</div>
            <div className="toast-mensagem">{a.mensagem}</div>
            <Link href={a.href} className="text-xs text-accent" onClick={() => fechar(a.chave)}>Ver corrida</Link>
          </div>
          <button type="button" className="toast-fechar" onClick={() => fechar(a.chave)} aria-label="Fechar aviso">
            <IconClose style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ))}
    </div>
  )
}
