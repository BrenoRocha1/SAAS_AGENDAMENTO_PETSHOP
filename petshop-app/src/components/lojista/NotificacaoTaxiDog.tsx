'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { assinarComSessao } from '@/lib/supabase/realtime'
import { tocarSom } from '@/lib/sons-notificacao'
import { hojeBrasilISO } from '@/lib/agenda'
import { ROTULO_MODALIDADE, normalizarCorrida } from '@/lib/taxidog'
import { EVENTO_CORRIDA_ASSUMIDA, EVENTO_ROTA_PROPRIA } from '@/lib/taxidog-rotas'
import { IconCar, IconClose } from '@/components/icons'

type LinhaRota = {
  id_rota: string
  numero: number
  data: string
  id_funcionario: string | null
  status: string
  versao: number
  ultima_alteracao: string | null
  criada_por: string | null
}
type LinhaCorrida = { id_corrida: string; status: string; id_funcionario: string | null }

interface Aviso {
  chave: string
  titulo: string
  mensagem: string
  href: string
  link: string
}

// Avisos do TaxiDog no painel web (montado no layout):
// • pra quem é TaxiDog (`taxidog`):
//     Kanban — "Nova corrida disponível", "Nova corrida para você";
//     rotas  — "Nova rota atribuída", "Rota aprovada", "Rota atualizada";
//     e "Pronto para entrega" de um pet dele;
// • pra gestão (`gestor`): "Rota para aprovar" quando um TaxiDog monta uma
//   rota que precisa de aprovação (migration 053).
// Não duplica: guarda o último estado de cada corrida/rota e avisa uma vez
// por (item, tipo/versão). O que a própria pessoa fez não vira aviso.
export default function NotificacaoTaxiDog({ lojistaId, userId, taxidog, gestor, somAtivo, somTipo }: {
  lojistaId: string
  userId: string
  taxidog: boolean
  gestor: boolean
  somAtivo: boolean
  somTipo: string
}) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const rotas = useRef(new Map<string, LinhaRota>())
  const corridas = useRef(new Map<string, LinhaCorrida>())
  const jaAvisados = useRef(new Set<string>())
  const feitoPorMim = useRef(new Map<string, number>())
  // Última vez que chegou mudança numa rota dele: corrida atribuída junto
  // com a rota não ganha aviso próprio (o aviso é o da rota).
  const ultimaRotaMinha = useRef(0)

  // Corrida que ele mesmo pegou / rota que ele mesmo mexeu (nesta aba ou
  // em outra do mesmo navegador).
  useEffect(() => {
    const marcar = (id: unknown) => { if (typeof id === 'string') feitoPorMim.current.set(id, Date.now()) }
    const noEvento = (e: Event) => marcar((e as CustomEvent).detail)
    const canais: BroadcastChannel[] = []
    for (const nome of [EVENTO_CORRIDA_ASSUMIDA, EVENTO_ROTA_PROPRIA]) {
      window.addEventListener(nome, noEvento)
      try {
        const canal = new BroadcastChannel(nome)
        canal.onmessage = e => marcar(e.data)
        canais.push(canal)
      } catch {
        // Navegador sem BroadcastChannel — só a aba atual fica coberta.
      }
    }
    return () => {
      for (const nome of [EVENTO_CORRIDA_ASSUMIDA, EVENTO_ROTA_PROPRIA]) window.removeEventListener(nome, noEvento)
      for (const c of canais) c.close()
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

  const recente = useCallback((id: string) => {
    const quando = feitoPorMim.current.get(id)
    return !!quando && Date.now() - quando < 60_000
  }, [])

  const avisoCorrida = useCallback(async (supabase: SupabaseClient, idCorrida: string, tipo: 'disponivel' | 'atribuida' | 'pronta') => {
    const hoje = hojeBrasilISO()
    const { data } = await supabase.rpc('fn_listar_corridas', { p_data_ini: hoje, p_data_fim: hoje, p_id_corrida: idCorrida })
    const linha = (data as Record<string, unknown>[] | null)?.[0]
    if (!linha) return
    const c = normalizarCorrida(linha)
    const quando = `${format(parseISO(c.dt_agendamento), 'dd/MM')} às ${c.hr_agendamento.slice(0, 5)}`
    const verbo = c.modalidade === 'entregar' ? 'Entregar' : 'Buscar'
    avisar({
      chave: `${idCorrida}:${tipo}`,
      titulo: tipo === 'disponivel' ? 'Nova corrida disponível' : tipo === 'atribuida' ? 'Nova corrida para você' : 'Pronto para entrega',
      mensagem: tipo === 'pronta'
        ? `${c.pet_nome} terminou o serviço e está pronto para entrega — ${c.logradouro}, ${c.numero}`
        : `${verbo} ${c.pet_nome} · ${quando} · ${ROTULO_MODALIDADE[c.modalidade]}`,
      href: `/lojista/taxidog?data=${c.dt_agendamento}`,
      link: 'Ver corrida',
    })
  }, [avisar])

  useEffect(() => {
    const supabase = createClient()
    let cancelado = false

    // Semente: o que já existe ao abrir o painel não gera aviso.
    supabase
      .from('taxidog_rota')
      .select('id_rota, numero, data, id_funcionario, status, versao, ultima_alteracao, criada_por')
      .in('status', ['planejamento', 'aguardando_aprovacao', 'aguardando_saida', 'em_andamento'])
      .then(({ data }) => {
        if (cancelado) return
        for (const r of (data ?? []) as LinhaRota[]) if (!rotas.current.has(r.id_rota)) rotas.current.set(r.id_rota, r)
      })

    const avisoNovaRota = async (r: LinhaRota) => {
      const { count } = await supabase.from('taxidog_parada').select('id_parada', { count: 'exact', head: true }).eq('id_rota', r.id_rota)
      avisar({
        chave: `${r.id_rota}:atribuida`,
        titulo: 'Nova rota atribuída',
        mensagem: count ? `Você tem uma nova rota com ${count} ${count === 1 ? 'parada' : 'paradas'} (Rota #${r.numero}).` : `A Rota #${r.numero} é sua.`,
        href: `/lojista/taxidog/rotas?rota=${r.id_rota}`,
        link: 'Ver rota',
      })
    }

    const canal = supabase
      .channel(`taxidog-avisos-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_rota', filter: `id_lojista=eq.${lojistaId}` }, payload => {
        const nova = payload.new as LinhaRota | null
        if (!nova?.id_rota) return
        const anterior = rotas.current.get(nova.id_rota)
        rotas.current.set(nova.id_rota, nova)

        // Gestão: rota montada por um TaxiDog esperando aprovação.
        if (gestor && nova.status === 'aguardando_aprovacao' && anterior?.status !== 'aguardando_aprovacao' && nova.criada_por !== userId && nova.id_funcionario !== userId) {
          avisar({
            chave: `${nova.id_rota}:aprovar:${nova.versao}`,
            titulo: 'Rota para aprovar',
            mensagem: `Um TaxiDog montou a Rota #${nova.numero} e ela está aguardando sua aprovação.`,
            href: `/lojista/taxidog/rotas?data=${nova.data}`,
            link: 'Revisar rota',
          })
        }

        if (!taxidog || nova.id_funcionario !== userId) return
        ultimaRotaMinha.current = Date.now()

        if (!anterior || anterior.id_funcionario !== userId) {
          // Rota que ele mesmo montou não é novidade.
          if (nova.criada_por !== userId && (nova.status === 'aguardando_saida' || nova.status === 'em_andamento')) avisoNovaRota(nova)
          return
        }
        if (anterior.status === 'aguardando_aprovacao' && nova.status === 'aguardando_saida') {
          avisar({
            chave: `${nova.id_rota}:aprovada:${nova.versao}`,
            titulo: 'Rota aprovada',
            mensagem: `A Rota #${nova.numero} foi aprovada — você já pode iniciar.`,
            href: `/lojista/taxidog/rotas?rota=${nova.id_rota}`,
            link: 'Ver rota',
          })
          return
        }
        // Mudança que ele mesmo fez não é novidade.
        if (recente(nova.id_rota)) return
        // Toda mudança de verdade traz o que mudou em ultima_alteracao (os
        // passos internos da criação da rota, não).
        const cancelou = nova.status === 'cancelada' && anterior.status !== 'cancelada'
        const mudou = cancelou || (nova.versao > anterior.versao && !!nova.ultima_alteracao)
        if (!mudou || nova.status === 'concluida') return
        avisar({
          chave: `${nova.id_rota}:v${nova.versao}:${nova.status}`,
          titulo: 'Rota atualizada',
          mensagem: cancelou
            ? `Rota #${nova.numero}: ${nova.ultima_alteracao ?? 'cancelada pela loja'}.`
            : `Rota #${nova.numero}: ${nova.ultima_alteracao ?? 'as paradas mudaram'}.`,
          href: `/lojista/taxidog/rotas?rota=${nova.id_rota}`,
          link: 'Ver rota',
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${lojistaId}` }, payload => {
        if (!taxidog) return
        const nova = payload.new as LinhaCorrida | null
        if (!nova?.id_corrida) return
        const anterior = corridas.current.get(nova.id_corrida)
        corridas.current.set(nova.id_corrida, nova)
        if (nova.status === 'concluida' || nova.status === 'cancelada') return

        // A RLS (migration 046) só entrega as dele e as ainda sem TaxiDog.
        if (payload.eventType === 'INSERT') {
          if (!nova.id_funcionario) avisoCorrida(supabase, nova.id_corrida, 'disponivel')
          else if (nova.id_funcionario === userId) avisoCorrida(supabase, nova.id_corrida, 'atribuida')
          return
        }
        if (nova.id_funcionario !== userId) return
        if (anterior && anterior.id_funcionario !== userId) {
          // Ele mesmo pegou, ou ela veio junto com uma rota (o aviso é o da rota).
          if (recente(nova.id_corrida) || nova.status !== 'agendada') return
          setTimeout(() => {
            if (Date.now() - ultimaRotaMinha.current > 5000) avisoCorrida(supabase, nova.id_corrida, 'atribuida')
          }, 1500)
        } else if (anterior && anterior.status !== 'pronto_entrega' && nova.status === 'pronto_entrega') {
          avisoCorrida(supabase, nova.id_corrida, 'pronta')
        }
      })
    const desfazer = assinarComSessao(supabase, canal)

    return () => {
      cancelado = true
      desfazer()
    }
  }, [lojistaId, userId, taxidog, gestor, avisar, avisoCorrida, recente])

  if (avisos.length === 0) return null

  return (
    <div className="toast-pilha" role="status" aria-live="polite">
      {avisos.map(a => (
        <div key={a.chave} className="toast">
          <span className="toast-icone"><IconCar style={{ width: 18, height: 18 }} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast-titulo">{a.titulo}</div>
            <div className="toast-mensagem">{a.mensagem}</div>
            <Link href={a.href} className="text-xs text-accent" onClick={() => fechar(a.chave)}>{a.link}</Link>
          </div>
          <button type="button" className="toast-fechar" onClick={() => fechar(a.chave)} aria-label="Fechar aviso">
            <IconClose style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ))}
    </div>
  )
}
