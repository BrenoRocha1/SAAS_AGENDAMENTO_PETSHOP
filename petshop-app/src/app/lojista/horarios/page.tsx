import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import { hojeBrasilISO } from '@/lib/agenda'
import HorariosManager from '@/components/lojista/HorariosManager'
import BloqueiosManager, { type BloqueioComAgendamentos } from '@/components/lojista/BloqueiosManager'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Horários de Funcionamento' }

export default async function HorariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Dono ou administrador da equipe (acesso total) — o id é o da loja.
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null
  const lojistaId = contexto.idLojista

  const [{ data: horarios }, { data: bloqueiosRaw, error: bloqueiosErro }] = await Promise.all([
    supabase
      .from('horario')
      .select('*')
      .eq('id_lojista', lojistaId)
      .order('dia_semana'),
    // Dias fechados (migration 066): tolerante — sem ela, a seção avisa.
    supabase.rpc('fn_bloqueios_da_loja', { p_id_lojista: lojistaId }),
  ])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Horários de Funcionamento</h1>
        <p className="page-subtitle">Configure os dias e horários em que seu petshop atende e os dias em que fica fechado</p>
      </div>
      <HorariosManager lojistaId={lojistaId} horarios={horarios ?? []} />
      <BloqueiosManager
        bloqueios={bloqueiosErro ? [] : ((bloqueiosRaw ?? []) as BloqueioComAgendamentos[])}
        hojeISO={hojeBrasilISO()}
        semMigration={!!bloqueiosErro}
      />
    </>
  )
}
