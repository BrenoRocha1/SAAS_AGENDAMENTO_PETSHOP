import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

// Assina o canal só DEPOIS de a sessão do navegador estar carregada e
// entregue ao Realtime. Se o canal entrar antes, ele entra como anônimo e
// a RLS filtra todo evento em silêncio (o canal fica "SUBSCRIBED", mas
// nada chega) — foi o que deixava o painel do TaxiDog sem atualizar.
// Devolve uma função pra desfazer, que funciona mesmo se o componente
// desmontar antes de a sessão carregar.
export function assinarComSessao(supabase: SupabaseClient, canal: RealtimeChannel): () => void {
  let cancelado = false
  supabase.auth.getSession().then(async ({ data }) => {
    if (cancelado) return
    if (data.session) await supabase.realtime.setAuth(data.session.access_token)
    if (!cancelado) canal.subscribe()
  })
  return () => {
    cancelado = true
    supabase.removeChannel(canal)
  }
}
