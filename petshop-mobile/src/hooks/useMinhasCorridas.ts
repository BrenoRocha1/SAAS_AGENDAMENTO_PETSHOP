import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { normalizarCorrida, type Corrida } from '@/lib/taxidog'
import { useTaxiDogTempoReal } from '@/contexts/TaxiDogContext'

// Rota ativa em que a corrida ainda tem parada por fazer (migration 053):
// ela só anda pela tela da rota.
export interface RotaDaCorrida {
  id_rota: string
  numero: number
}

// Corridas (id → rota) das que estão numa rota ativa. Tolerante: sem a
// migration 052 a tabela não existe e nenhuma aparece em rota.
async function rotasDasCorridas(ids: string[]): Promise<Record<string, RotaDaCorrida>> {
  const resultado: Record<string, RotaDaCorrida> = {}
  if (ids.length === 0) return resultado
  const { data } = await supabase
    .from('taxidog_parada_item')
    .select('id_corrida, id_rota, rota:id_rota ( numero, status )')
    .eq('feito', false)
    .in('id_corrida', ids)
  for (const i of (data ?? []) as unknown as { id_corrida: string; id_rota: string; rota: { numero: number; status: string } | null }[]) {
    if (!i.rota || i.rota.status === 'concluida' || i.rota.status === 'cancelada') continue
    resultado[i.id_corrida] = { id_rota: i.id_rota, numero: i.rota.numero }
  }
  return resultado
}

// Corridas do TaxiDog logado num intervalo de datas. fn_listar_corridas
// (migration 042) já devolve só as dele (e as ainda sem TaxiDog) quando
// quem chama não gerencia a agenda — e traz pet, tutor e endereço sem
// precisar de RLS nessas tabelas. Recarrega ao voltar pra tela e a cada
// mudança recebida pelo Realtime.
export function useMinhasCorridas(dataIni: string, dataFim: string) {
  const { versao } = useTaxiDogTempoReal()
  const [corridas, setCorridas] = useState<Corrida[]>([])
  const [rotaPorCorrida, setRotaPorCorrida] = useState<Record<string, RotaDaCorrida>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_listar_corridas', { p_data_ini: dataIni, p_data_fim: dataFim })
    if (error) {
      setErro(error.message.includes('Could not find') || error.code === 'PGRST202'
        ? 'O TaxiDog ainda não foi ativado no sistema da loja.'
        : 'Não foi possível carregar as corridas.')
    } else {
      const lista = ((data ?? []) as Record<string, unknown>[]).map(normalizarCorrida)
      setErro(null)
      setCorridas(lista)
      setRotaPorCorrida(await rotasDasCorridas(lista.map(c => c.id_corrida)))
    }
    setLoading(false)
  }, [dataIni, dataFim])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  useEffect(() => {
    if (versao > 0) carregar()
  }, [versao, carregar])

  return { corridas, rotaPorCorrida, loading, erro, recarregar: carregar }
}

export async function buscarCorrida(idCorrida: string, hojeISO: string): Promise<{ corrida: Corrida | null; rota: RotaDaCorrida | null }> {
  const { data } = await supabase.rpc('fn_listar_corridas', { p_data_ini: hojeISO, p_data_fim: hojeISO, p_id_corrida: idCorrida })
  const linha = (data as Record<string, unknown>[] | null)?.[0]
  if (!linha) return { corrida: null, rota: null }
  const rotas = await rotasDasCorridas([idCorrida])
  return { corrida: normalizarCorrida(linha), rota: rotas[idCorrida] ?? null }
}
