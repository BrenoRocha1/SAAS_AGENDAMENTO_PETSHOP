'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { assinarComSessao } from '@/lib/supabase/realtime'
import { tocarSom } from '@/lib/sons-notificacao'
import { hojeBrasilISO } from '@/lib/agenda'
import { EVENTO_ROTA_PROPRIA } from '@/lib/taxidog-rotas'
import { IconCar, IconClose } from '@/components/icons'

type LinhaRota = { id_rota: string; numero: number; id_funcionario: string | null; status: string; versao: number; ultima_alteracao: string | null }
type LinhaCorrida = { id_corrida: string; status: string; id_funcionario: string | null }

interface Aviso {
  chave: string
  titulo: string
  mensagem: string
  href: string
}

// Avisos do TaxiDog no painel web (montado no layout só pra quem tem a
// função TaxiDog):
//   • "Nova rota atribuída" — a loja criou uma rota pra ele ou passou uma
//     rota pra ele;
//   • "Rota atualizada" — a rota dele mudou (parada removida/adicionada,
//     ordem nova, cancelamento);
//   • "Pronto para entrega" — um pet de rota dele terminou o serviço.
// Não duplica: guarda o último estado de cada rota e só avisa uma vez por
// (rota, versão). Mudança feita por ele mesmo não vira aviso.
export default function NotificacaoRotaTaxiDog({ lojistaId, userId, somAtivo, somTipo }: {
  lojistaId: string
  userId: string
  somAtivo: boolean
  somTipo: string
}) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const rotas = useRef(new Map<string, LinhaRota>())
  const corridas = useRef(new Map<string, LinhaCorrida>())
  const jaAvisados = useRef(new Set<string>())
  const mudancasProprias = useRef(new Map<string, number>())

  useEffect(() => {
    const marcar = (id: unknown) => { if (typeof id === 'string') mudancasProprias.current.set(id, Date.now()) }
    const noEvento = (e: Event) => marcar((e as CustomEvent).detail)
    window.addEventListener(EVENTO_ROTA_PROPRIA, noEvento)
    let canalAbas: BroadcastChannel | null = null
    try {
      canalAbas = new BroadcastChannel(EVENTO_ROTA_PROPRIA)
      canalAbas.onmessage = e => marcar(e.data)
    } catch {
      // Navegador sem BroadcastChannel — só a aba atual fica coberta.
    }
    return () => {
      window.removeEventListener(EVENTO_ROTA_PROPRIA, noEvento)
      canalAbas?.close()
    }
  }, [])

  const fechar = useCallback((chave: string) => {
    setAvisos(prev => prev.filter(a => a.chave !== chave))
  }, [])

  const avisar = useCallback((aviso: Aviso) => {
    if (jaAvisados.current.has(aviso.chave)) return
    jaAvisados.current.add(aviso.chave)
    setAvisos(prev => [...prev.slice(-2), aviso])
    if (somAtivo) tocarSom(somTipo)
    setTimeout(() => fechar(aviso.chave), 15000)
  }, [somAtivo, somTipo, fechar])

  useEffect(() => {
    const supabase = createClient()
    let cancelado = false

    // Semente: o que já existe ao abrir o painel não gera aviso.
    supabase
      .from('taxidog_rota')
      .select('id_rota, numero, id_funcionario, status, versao, ultima_alteracao')
      .eq('id_funcionario', userId)
      .in('status', ['planejamento', 'aguardando_saida', 'em_andamento'])
      .then(({ data }) => {
        if (cancelado) return
        for (const r of (data ?? []) as LinhaRota[]) if (!rotas.current.has(r.id_rota)) rotas.current.set(r.id_rota, r)
      })

    const avisoNovaRota = async (r: LinhaRota) => {
      const { count } = await supabase.from('taxidog_parada').select('id_parada', { count: 'exact', head: true }).eq('id_rota', r.id_rota)
      avisar({
        chave: `${r.id_rota}:atribuida`,
        titulo: 'Nova rota atribuída',
        mensagem: count ? `Você tem uma nova rota com ${count} ${count === 1 ? 'parada' : 'paradas'} (Rota #${r.numero}).` : `Rota #${r.numero} é sua.`,
        href: `/lojista/taxidog?rota=${r.id_rota}`,
      })
    }

    const canal = supabase
      .channel(`taxidog-rotas-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_rota', filter: `id_lojista=eq.${lojistaId}` }, payload => {
        const nova = payload.new as LinhaRota | null
        if (!nova?.id_rota) return
        const anterior = rotas.current.get(nova.id_rota)
        rotas.current.set(nova.id_rota, nova)
        if (nova.id_funcionario !== userId) return

        if (!anterior || anterior.id_funcionario !== userId) {
          if (nova.status === 'aguardando_saida' || nova.status === 'em_andamento') avisoNovaRota(nova)
          return
        }

        // Toda mudança de verdade traz o que mudou em ultima_alteracao (os
        // passos internos da criação da rota, não).
        const cancelou = nova.status === 'cancelada' && anterior.status !== 'cancelada'
        const mudou = cancelou || (nova.versao > anterior.versao && !!nova.ultima_alteracao)
        if (!mudou || nova.status === 'concluida') return
        const propria = mudancasProprias.current.get(nova.id_rota)
        if (propria && Date.now() - propria < 60_000) return
        avisar({
          chave: `${nova.id_rota}:v${nova.versao}:${nova.status}`,
          titulo: 'Rota atualizada',
          mensagem: nova.status === 'cancelada'
            ? `A loja cancelou a Rota #${nova.numero}.`
            : `Rota #${nova.numero}: ${nova.ultima_alteracao ?? 'as paradas mudaram'}.`,
          href: `/lojista/taxidog?rota=${nova.id_rota}`,
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${lojistaId}` }, payload => {
        const nova = payload.new as LinhaCorrida | null
        if (!nova?.id_corrida) return
        const anterior = corridas.current.get(nova.id_corrida)
        corridas.current.set(nova.id_corrida, nova)
        if (nova.id_funcionario !== userId || nova.status !== 'pronto_entrega' || anterior?.status === 'pronto_entrega') return
        const hoje = hojeBrasilISO()
        supabase
          .rpc('fn_listar_corridas', { p_data_ini: hoje, p_data_fim: hoje, p_id_corrida: nova.id_corrida })
          .then(({ data }) => {
            const pet = (data as { pet_nome?: string }[] | null)?.[0]?.pet_nome
            avisar({
              chave: `${nova.id_corrida}:pronta`,
              titulo: 'Pronto para entrega',
              mensagem: `${pet ?? 'Um pet da sua rota'} terminou o serviço e está pronto para entrega.`,
              href: '/lojista/taxidog',
            })
          })
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
            <Link href={a.href} className="text-xs text-accent" onClick={() => fechar(a.chave)}>Ver rota</Link>
          </div>
          <button type="button" className="toast-fechar" onClick={() => fechar(a.chave)} aria-label="Fechar aviso">
            <IconClose style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ))}
    </div>
  )
}
