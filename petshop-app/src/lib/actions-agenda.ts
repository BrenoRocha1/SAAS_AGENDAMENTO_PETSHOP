'use server'

// Configurações da agenda da loja. Quem pode e os limites ficam nas
// funções do banco — aqui só validação de formato.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Quantos agendamentos a loja aceita ao mesmo tempo (migration 076).
export async function definirAgendamentosSimultaneosAction(quantidade: number): Promise<{ error?: string; success?: boolean }> {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
    return { error: 'Escolha um número de 1 a 20.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.rpc('fn_definir_agendamentos_simultaneos', { p_quantidade: quantidade })
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function|does not exist|schema cache/i.test(error.message)) {
      return { error: 'Para usar agendamentos simultâneos, execute a migration 076_agendamentos_simultaneos.sql.' }
    }
    if (error.message.includes('Acesso não autorizado')) return { error: 'Só o dono ou um administrador da loja muda essa configuração.' }
    const m = error.message.match(/Simultâneos: ([^\n]+)/)
    return { error: m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : 'Não foi possível salvar. Tente novamente.' }
  }

  revalidatePath('/lojista/configuracoes/agendamentos')
  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/dashboard')
  return { success: true }
}
