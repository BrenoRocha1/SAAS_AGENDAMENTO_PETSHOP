'use server'

// Dias fechados da loja (migration 066). Quem pode e as regras ficam nas
// funções do banco — aqui só validação de formato.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import { mensagemErroBloqueio } from '@/lib/bloqueios'

type Resultado = { error?: string; success?: boolean }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^\d{2}:\d{2}$/
const MSG_MIGRATION = 'Para fechar dias, execute a migration 066_bloqueio_datas.sql.'

function erroDoBanco(msg: string | undefined, padrao: string): string {
  if (msg && /fn_\w+|does not exist|schema cache|Could not find/i.test(msg)) return MSG_MIGRATION
  return mensagemErroBloqueio(msg) ?? padrao
}

function revalidarBloqueios() {
  revalidatePath('/lojista/horarios')
  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/dashboard')
}

export interface DadosBloqueio {
  dt_inicio: string
  dt_fim: string
  // Vazios = dia inteiro.
  hr_inicio: string
  hr_fim: string
  motivo: string
}

export async function salvarBloqueioAction(dados: DadosBloqueio): Promise<Resultado> {
  const motivo = (dados.motivo ?? '').trim()
  if (!motivo) return { error: 'Informe o motivo (ex.: Feriado de Natal).' }
  if (motivo.length > 80) return { error: 'Motivo muito longo (até 80 letras).' }
  if (!DATA_RE.test(dados.dt_inicio)) return { error: 'Escolha a data.' }
  const dtFim = dados.dt_fim || dados.dt_inicio
  if (!DATA_RE.test(dtFim)) return { error: 'Data final inválida.' }
  if (dtFim < dados.dt_inicio) return { error: 'A data final vem antes da inicial.' }
  const comHorario = !!(dados.hr_inicio || dados.hr_fim)
  if (comHorario) {
    if (!HORA_RE.test(dados.hr_inicio) || !HORA_RE.test(dados.hr_fim)) return { error: 'Informe o horário de início e de fim.' }
    if (dados.hr_fim <= dados.hr_inicio) return { error: 'O horário final precisa ser depois do inicial.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }

  const { error } = await supabase.rpc('fn_salvar_bloqueio', {
    p_id_lojista: contexto.idLojista,
    p_dt_inicio: dados.dt_inicio,
    p_dt_fim: dtFim,
    p_hr_inicio: comHorario ? dados.hr_inicio : null,
    p_hr_fim: comHorario ? dados.hr_fim : null,
    p_motivo: motivo,
  })
  if (error) return { error: erroDoBanco(error.message, 'Não foi possível fechar esse período.') }
  revalidarBloqueios()
  return { success: true }
}

export async function excluirBloqueioAction(idBloqueio: string): Promise<Resultado> {
  if (!UUID_RE.test(idBloqueio)) return { error: 'Bloqueio inválido.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_excluir_bloqueio', { p_id_bloqueio: idBloqueio })
  if (error) return { error: erroDoBanco(error.message, 'Não foi possível reabrir esse período.') }
  revalidarBloqueios()
  return { success: true }
}
