import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// Espelha petshop-app/src/lib/supabase/realtime.ts. Assina o canal só
// DEPOIS de a sessão estar carregada (do AsyncStorage) e entregue ao
// Realtime. Se o canal entrar antes, ele entra como anônimo e a RLS filtra
// todo evento em silêncio (o canal fica "SUBSCRIBED", mas nada chega).
// Devolve uma função pra desfazer, que funciona mesmo se a tela fechar
// antes de a sessão carregar.
export function assinarComSessao(canal: RealtimeChannel): () => void {
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
