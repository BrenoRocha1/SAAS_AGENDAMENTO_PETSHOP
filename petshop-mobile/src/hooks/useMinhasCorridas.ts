import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { normalizarCorrida, type Corrida } from '@/lib/taxidog'
import { useCorridasTempoReal } from '@/contexts/CorridasContext'

// Corridas do TaxiDog logado num intervalo de datas. fn_listar_corridas
// (migration 042) já devolve só as dele quando quem chama não gerencia a
// agenda — e traz pet, tutor e endereço sem precisar de RLS nessas tabelas.
// Recarrega ao voltar pra tela e a cada mudança recebida pelo Realtime.
export function useMinhasCorridas(dataIni: string, dataFim: string) {
  const { versao } = useCorridasTempoReal()
  const [corridas, setCorridas] = useState<Corrida[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_listar_corridas', { p_data_ini: dataIni, p_data_fim: dataFim })
    if (error) {
      setErro(error.message.includes('Could not find') || error.code === 'PGRST202'
        ? 'O TaxiDog ainda não foi ativado no sistema da loja.'
        : 'Não foi possível carregar as corridas.')
    } else {
      setErro(null)
      setCorridas(((data ?? []) as Record<string, unknown>[]).map(normalizarCorrida))
    }
    setLoading(false)
  }, [dataIni, dataFim])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  useEffect(() => {
    if (versao > 0) carregar()
  }, [versao, carregar])

  return { corridas, loading, erro, recarregar: carregar }
}

export async function buscarCorrida(idCorrida: string, hojeISO: string): Promise<Corrida | null> {
  const { data } = await supabase.rpc('fn_listar_corridas', { p_data_ini: hojeISO, p_data_fim: hojeISO, p_id_corrida: idCorrida })
  const linha = (data as Record<string, unknown>[] | null)?.[0]
  return linha ? normalizarCorrida(linha) : null
}
