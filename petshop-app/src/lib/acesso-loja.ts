import type { createClient } from '@/lib/supabase/server'

// Período de teste / acesso da loja (migration 088). Tolerante de
// propósito: se a coluna ainda não existe (migration não rodou) ou a
// consulta falha, a loja segue LIBERADA — nunca bloquear por erro nosso.

type Db = Awaited<ReturnType<typeof createClient>>

export interface AcessoLoja {
  liberado: boolean          // pode usar agora
  livre: boolean             // isenta de cobrança
  diasRestantes: number | null
  acessoAte: string | null
}

const SEM_LIMITE: AcessoLoja = { liberado: true, livre: false, diasRestantes: null, acessoAte: null }

export function calcularAcesso(acessoAte: string | null | undefined, livre: boolean | null | undefined, agora = Date.now()): AcessoLoja {
  if (livre) return { liberado: true, livre: true, diasRestantes: null, acessoAte: acessoAte ?? null }
  if (!acessoAte) return SEM_LIMITE
  const ms = new Date(acessoAte).getTime() - agora
  return {
    liberado: ms > 0,
    livre: false,
    diasRestantes: Math.max(0, Math.ceil(ms / 86_400_000)),
    acessoAte,
  }
}

export async function acessoDaLoja(db: Db, idLojista: string): Promise<AcessoLoja> {
  const { data, error } = await db
    .from('lojista')
    .select('acesso_ate, acesso_livre')
    .eq('id_lojista', idLojista)
    .maybeSingle()
  if (error || !data) return SEM_LIMITE
  return calcularAcesso(data.acesso_ate, data.acesso_livre)
}
