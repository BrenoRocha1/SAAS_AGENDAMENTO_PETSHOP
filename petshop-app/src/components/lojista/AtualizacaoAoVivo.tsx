'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { assinarComSessao } from '@/lib/supabase/realtime'

// Telas que mostram agendamentos/corridas e por isso se atualizam sozinhas
// quando algo muda na loja (novo agendamento, aceite, TaxiDog andou...).
const TELAS_AO_VIVO = ['/lojista/agendamentos', '/lojista/kanban', '/lojista/dashboard', '/lojista/taxidog']

// Um canal só pro painel inteiro (montado no layout do lojista), no lugar
// de cada tela assinar o seu. Quem recebe o quê a RLS decide: dono e
// equipe com agenda recebem os agendamentos; o TaxiDog, as corridas dele
// e as ainda sem TaxiDog (migration 046). A tela aberta é recarregada com
// router.refresh() — os componentes das telas já re-sincronizam o estado
// quando os dados do servidor mudam.
export default function AtualizacaoAoVivo({ lojistaId }: { lojistaId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | undefined

    // Várias mudanças juntas (um carrinho vira N agendamentos + a corrida)
    // viram um recarregamento só.
    const atualizar = () => {
      if (!TELAS_AO_VIVO.some(t => pathnameRef.current === t || pathnameRef.current.startsWith(`${t}/`))) return
      clearTimeout(timer)
      timer = setTimeout(() => router.refresh(), 400)
    }

    const canal = supabase
      .channel(`painel-ao-vivo-${lojistaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamento', filter: `id_lojista=eq.${lojistaId}` }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${lojistaId}` }, atualizar)
    const desfazer = assinarComSessao(supabase, canal)

    return () => {
      clearTimeout(timer)
      desfazer()
    }
  }, [lojistaId, router])

  return null
}
