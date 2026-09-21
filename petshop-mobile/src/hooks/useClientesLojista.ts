import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClienteLinha } from '@/types/database'

const PAGE_SIZE = 20

// Mesma função do banco que o dashboard web usa
// (fn_buscar_clientes_lojista, migration 019) — busca e paginação
// inteiras no Postgres, nada de carregar tudo pro app e filtrar em JS.
export function useClientesLojista(idLojista: string | undefined, busca: string) {
  const [clientes, setClientes] = useState<ClienteLinha[]>([])
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

      const { data, error } = await supabase.rpc('fn_buscar_clientes_lojista', {
        p_id_lojista: idLojista,
        p_busca: busca.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: pagina * PAGE_SIZE,
      })

      if (error) {
        setErro('Não foi possível carregar os clientes.')
      } else {
        const linhas = (data ?? []) as unknown as Array<ClienteLinha & { total_count: number }>
        setClientes(prev => (modo === 'substituir' ? linhas : [...prev, ...linhas]))
        const totalCarregado = pagina * PAGE_SIZE + linhas.length
        setTemMais(totalCarregado < (linhas[0]?.total_count ?? 0))
        paginaRef.current = pagina
      }
      setLoading(false)
      setLoadingMais(false)
    },
    [idLojista, busca]
  )

  // Busca de novo (do zero) sempre que o termo digitado muda — debounce
  // simples pra não disparar uma consulta a cada tecla.
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

  return { clientes, loading, loadingMais, erro, temMais, carregarMais, recarregar }
}
