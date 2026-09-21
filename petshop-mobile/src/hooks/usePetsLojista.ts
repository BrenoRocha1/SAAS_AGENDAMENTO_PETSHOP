import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PetLinha } from '@/types/database'

const PAGE_SIZE = 20

// Mesma função do banco que o dashboard web usa (fn_buscar_pets_lojista,
// migration 018) — busca e paginação inteiras no Postgres.
export function usePetsLojista(idLojista: string | undefined, busca: string) {
  const [pets, setPets] = useState<PetLinha[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMais, setLoadingMais] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [temMais, setTemMais] = useState(false)
  const paginaRef = useRef(0)

  const buscar = useCallback(
    async (pagina: number, modo: 'substituir' | 'anexar') => {
      if (!idLojista) return
      modo === 'substituir' ? setLoading(true) : setLoadingMais(true)
      setErro(null)

      const { data, error } = await supabase.rpc('fn_buscar_pets_lojista', {
        p_id_lojista: idLojista,
        p_busca: busca.trim() || null,
        p_especie: null,
        p_porte: null,
        p_limit: PAGE_SIZE,
        p_offset: pagina * PAGE_SIZE,
      })

      if (error) {
        setErro('Não foi possível carregar os pets.')
      } else {
        const linhas = (data ?? []) as unknown as Array<PetLinha & { total_count: number }>
        setPets(prev => (modo === 'substituir' ? linhas : [...prev, ...linhas]))
        const totalCarregado = pagina * PAGE_SIZE + linhas.length
        setTemMais(totalCarregado < (linhas[0]?.total_count ?? 0))
        paginaRef.current = pagina
      }
      setLoading(false)
      setLoadingMais(false)
    },
    [idLojista, busca]
  )

  useEffect(() => {
    const t = setTimeout(() => buscar(0, 'substituir'), 300)
    return () => clearTimeout(t)
  }, [buscar])

  function carregarMais() {
    if (loadingMais || loading || !temMais) return
    buscar(paginaRef.current + 1, 'anexar')
  }

  function recarregar() {
    buscar(0, 'substituir')
  }

  return { pets, loading, loadingMais, erro, temMais, carregarMais, recarregar }
}
