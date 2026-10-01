import { supabase } from '@/lib/supabase'

// Nome da loja pra mensagens (WhatsApp). O contexto traz o nome de quem
// está logado — pro funcionário, é o nome dele, não o da loja. A RLS
// deixa o funcionário ler a própria loja (migration 031).
const cache = new Map<string, string>()

export async function nomeDaLoja(idLojista: string): Promise<string> {
  const salvo = cache.get(idLojista)
  if (salvo) return salvo
  const { data } = await supabase.from('lojista').select('nome_loja').eq('id_lojista', idLojista).maybeSingle()
  const nome = (data as { nome_loja: string } | null)?.nome_loja ?? 'loja'
  if (data) cache.set(idLojista, nome)
  return nome
}
