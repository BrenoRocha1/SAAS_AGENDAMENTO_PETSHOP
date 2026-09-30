'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizarBloqueios, type BloqueioLoja } from '@/lib/bloqueios'

// Fechamentos da loja num dia (migration 066) — para os modais explicarem
// por que não há horário. null enquanto carrega; [] sem a migration.
export function useBloqueiosDoDia(idLojista: string | null, data: string): BloqueioLoja[] | null {
  const supabase = useMemo(() => createClient(), [])
  const chave = idLojista && data ? `${idLojista}|${data}` : null
  const [carregado, setCarregado] = useState<{ chave: string; lista: BloqueioLoja[] } | null>(null)

  useEffect(() => {
    if (!idLojista || !data) return
    let cancelado = false
    supabase
      .rpc('fn_bloqueios_loja', { p_id_lojista: idLojista, p_de: data, p_ate: data })
      .then(({ data: rows }) => {
        if (!cancelado) setCarregado({ chave: `${idLojista}|${data}`, lista: normalizarBloqueios(rows) })
      })
    return () => { cancelado = true }
  }, [idLojista, data, supabase])

  if (!chave) return []
  return carregado?.chave === chave ? carregado.lista : null
}
