// ============================================================
// Pagamento dos agendamentos nas telas da loja (migration 057)
// ============================================================
// Consultas tolerantes: sem a migration, as colunas não existem e as
// telas só ficam sem o pagamento (em vez de quebrar a consulta principal).

import type { createClient } from '@/lib/supabase/server'
import { formasAtivas, normalizarFormasLoja, type FormaPagamento } from '@/lib/pagamento'

type Supabase = Awaited<ReturnType<typeof createClient>>

export async function carregarPagamentos(supabase: Supabase, idLojista: string, idsAgendamentos: string[]): Promise<{
  porAgendamento: Map<string, { forma: string | null; status: string | null }>
  formasAceitas: FormaPagamento[]
}> {
  const [linhasRes, formasRes] = await Promise.all([
    idsAgendamentos.length > 0
      ? supabase.from('agendamento').select('id_agendamento, forma_pagamento, status_pagamento').in('id_agendamento', idsAgendamentos)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }),
  ])
  const linhas = (linhasRes.error ? [] : linhasRes.data ?? []) as { id_agendamento: string; forma_pagamento: string | null; status_pagamento: string | null }[]
  return {
    porAgendamento: new Map(linhas.map(l => [l.id_agendamento, { forma: l.forma_pagamento, status: l.status_pagamento }])),
    formasAceitas: formasRes.error ? [] : formasAtivas(normalizarFormasLoja(formasRes.data)),
  }
}
