'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarReais } from '@/lib/taxidog'

// Bloco "Alterações" do detalhe do agendamento (loja): trocas de serviço/pet
// (agendamento_alteracao, migration 070) e remarcações
// (agendamento_remarcacao, migration 064/071), com quem fez — cliente ou
// loja. Sem nada registrado (ou sem as migrations), não aparece.

interface Linha {
  em: string
  quem: 'Cliente' | 'Loja'
  texto: string
}

function dataCurta(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

function quando(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function HistoricoAlteracoes({ idAgendamento }: { idAgendamento: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [carregado, setCarregado] = useState<{ id: string; linhas: Linha[] } | null>(null)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const [{ data: ag }, { data: alteracoes }, { data: remarcacoes }] = await Promise.all([
        supabase.from('agendamento').select('id_cliente').eq('id_agendamento', idAgendamento).maybeSingle(),
        supabase.from('agendamento_alteracao')
          .select('campo, anterior, novo, valor_anterior, valor_novo, feito_por, created_at')
          .eq('id_agendamento', idAgendamento),
        supabase.from('agendamento_remarcacao')
          .select('dt_anterior, hr_anterior, dt_nova, hr_nova, motivo, id_usuario, created_at')
          .eq('id_agendamento', idAgendamento),
      ])
      if (cancelado) return
      const idCliente = ag?.id_cliente ?? null
      const linhas: Linha[] = []
      for (const a of (alteracoes ?? []) as Array<{
        campo: 'servico' | 'pet'; anterior: string | null; novo: string | null
        valor_anterior: number | null; valor_novo: number | null; feito_por: 'loja' | 'cliente'; created_at: string
      }>) {
        const valores = a.valor_anterior != null && a.valor_novo != null && Number(a.valor_anterior) !== Number(a.valor_novo)
          ? ` (${formatarReais(Number(a.valor_anterior))} → ${formatarReais(Number(a.valor_novo))})`
          : ''
        linhas.push({
          em: a.created_at,
          quem: a.feito_por === 'cliente' ? 'Cliente' : 'Loja',
          texto: `trocou ${a.campo === 'servico' ? 'o serviço' : 'o pet'}: ${a.anterior ?? '—'} → ${a.novo ?? '—'}${valores}`,
        })
      }
      for (const r of (remarcacoes ?? []) as Array<{
        dt_anterior: string; hr_anterior: string; dt_nova: string; hr_nova: string
        motivo: string | null; id_usuario: string | null; created_at: string
      }>) {
        linhas.push({
          em: r.created_at,
          quem: idCliente && r.id_usuario === idCliente ? 'Cliente' : 'Loja',
          texto: `remarcou: ${dataCurta(r.dt_anterior)} ${r.hr_anterior.slice(0, 5)} → ${dataCurta(r.dt_nova)} ${r.hr_nova.slice(0, 5)}${r.motivo ? ` · "${r.motivo}"` : ''}`,
        })
      }
      linhas.sort((x, y) => y.em.localeCompare(x.em))
      setCarregado({ id: idAgendamento, linhas: linhas.slice(0, 10) })
    })()
    return () => { cancelado = true }
  }, [idAgendamento, supabase])

  const linhas = carregado?.id === idAgendamento ? carregado.linhas : []
  if (linhas.length === 0) return null

  return (
    <div className="historico-alteracoes">
      <div className="text-sm font-semibold" style={{ color: 'var(--gray-200)' }}>Alterações</div>
      <ul>
        {linhas.map((l, i) => (
          <li key={i}>
            <span className="text-xs text-muted">{quando(l.em)}</span>{' '}
            <strong className={l.quem === 'Cliente' ? 'text-warning' : undefined}>{l.quem}</strong> {l.texto}
          </li>
        ))}
      </ul>
    </div>
  )
}
