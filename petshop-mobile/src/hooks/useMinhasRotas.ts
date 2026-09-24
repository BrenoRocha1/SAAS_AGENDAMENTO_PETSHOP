import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { formatarEnderecoLoja } from '@/lib/format'
import { normalizarRota, type Rota } from '@/lib/taxidog-rotas'
import { useAuth } from '@/contexts/AuthContext'
import { useRotasTempoReal } from '@/contexts/RotasContext'

function mensagemErro(error: { message: string; code?: string }): string {
  return error.message.includes('Could not find') || error.code === 'PGRST202'
    ? 'As rotas do TaxiDog ainda não foram ativadas no sistema da loja.'
    : 'Não foi possível carregar as rotas.'
}

// Rotas do TaxiDog logado num intervalo de datas. fn_listar_rotas
// (migration 052) já traz paradas, pets, tutores e endereços; quem também
// gerencia a agenda recebe as da loja toda — aqui ficam só as dele.
// Recarrega ao voltar pra tela e a cada mudança recebida pelo Realtime.
export function useMinhasRotas(dataIni: string, dataFim: string) {
  const { session } = useAuth()
  const { versao } = useRotasTempoReal()
  const [rotas, setRotas] = useState<Rota[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const userId = session?.user.id

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_listar_rotas', { p_data_ini: dataIni, p_data_fim: dataFim })
    if (error) {
      setErro(mensagemErro(error))
    } else {
      setErro(null)
      setRotas(((data ?? []) as Record<string, unknown>[]).map(normalizarRota).filter(r => r.id_funcionario === userId))
    }
    setLoading(false)
  }, [dataIni, dataFim, userId])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  useEffect(() => {
    if (versao > 0) carregar()
  }, [versao, carregar])

  return { rotas, loading, erro, recarregar: carregar }
}

// Uma rota só (tela da rota).
export function useRota(idRota: string) {
  const { versao } = useRotasTempoReal()
  const [rota, setRota] = useState<Rota | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_listar_rotas', { p_data_ini: '2000-01-01', p_data_fim: '2000-01-01', p_id_rota: idRota })
    if (error) {
      setErro(mensagemErro(error))
    } else {
      setErro(null)
      const linha = (data as Record<string, unknown>[] | null)?.[0]
      setRota(linha ? normalizarRota(linha) : null)
    }
    setLoading(false)
  }, [idRota])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  useEffect(() => {
    if (versao > 0) carregar()
  }, [versao, carregar])

  return { rota, loading, erro, recarregar: carregar }
}

// Endereço da loja numa linha (parada "Pet Shop" e o Google Maps). A RLS
// deixa o funcionário ler a própria loja (migration 031).
export function useEnderecoLoja(): string {
  const { contexto } = useAuth()
  const [endereco, setEndereco] = useState('')
  const idLojista = contexto?.idLojista

  useEffect(() => {
    if (!idLojista) return
    let cancelado = false
    supabase
      .from('lojista')
      .select('endereco, numero, complemento, bairro, cidade, estado')
      .eq('id_lojista', idLojista)
      .maybeSingle()
      .then(async ({ data, error }) => {
        // Sem a migration 045: só a rua em texto livre.
        const linha = error
          ? (await supabase.from('lojista').select('endereco, cidade, estado').eq('id_lojista', idLojista).maybeSingle()).data
          : data
        if (!cancelado && linha) setEndereco(formatarEnderecoLoja(linha))
      })
    return () => { cancelado = true }
  }, [idLojista])

  return endereco
}
