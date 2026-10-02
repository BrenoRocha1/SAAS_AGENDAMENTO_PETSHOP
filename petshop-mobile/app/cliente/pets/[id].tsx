import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { EmptyState } from '@/components/EmptyState'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Avatar } from '@/components/Avatar'
import { FormularioPet, type DadosPet } from '@/components/FormularioPet'
import { TrocarFoto, acoesFotoPet } from '@/components/TrocarFoto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { acoesDisponiveis } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { mensagemDoBanco } from '@/lib/erros'
import { colors, spacing } from '@/theme/theme'

type PetDoCliente = Partial<DadosPet> & { nome: string; foto_url: string | null }

// Ficha do pet do cliente: foto, dados (os mesmos campos do painel web) e
// remover. Remover só tira o pet da lista — o histórico de atendimentos
// dele continua existindo.
export default function PetClienteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [pet, setPet] = useState<PetDoCliente | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState(false)

  useEffect(() => {
    let cancelado = false
    supabase
      .from('pet')
      .select('nome, raca, sexo, especie, porte, dt_nasc, peso, obs, foto_url')
      .eq('id_pet', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return
        if (error || !data) return setErroCarga('Não foi possível carregar este pet.')
        const d = data as { nome: string; raca: string; sexo: DadosPet['sexo']; especie: DadosPet['especie'] | null; porte: DadosPet['porte'] | null; dt_nasc: string; peso: number | null; obs: string | null; foto_url: string | null }
        setPet({ ...d, especie: d.especie ?? '', porte: d.porte ?? '', peso: d.peso == null ? null : Number(d.peso), obs: d.obs ?? '' })
      })
    return () => { cancelado = true }
  }, [id])

  if (!pet) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Pet" />
        {erroCarga ? (
          <EmptyState icon="alert-circle-outline" title="Pet não encontrado" subtitle={erroCarga} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary600} /></View>
        )}
      </ScreenContainer>
    )
  }

  const foto = acoesFotoPet(id)

  function pedirRemocao() {
    dialogo('Remover pet', `Tirar ${pet?.nome} da sua lista? Os agendamentos já feitos continuam no histórico.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          if (!user) return
          setErro(null)
          setRemovendo(true)
          const { data, error } = await supabase.from('pet').update({ ativo: false }).eq('id_pet', id).eq('id_cliente', user.id).select('id_pet')
          setRemovendo(false)
          if (error || !data || data.length === 0) return setErro(error ? mensagemDoBanco(error, 'Erro ao remover o pet.') : 'Não foi possível remover este pet.')
          router.back()
        },
      },
    ])
  }

  return (
    <ScreenContainer>
      <DetailHeader title={pet.nome} />

      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        {acoesDisponiveis() ? (
          <TrocarFoto nome={pet.nome} fotoUrl={pet.foto_url} enviar={foto.enviar} remover={foto.remover} onMudou={url => setPet({ ...pet, foto_url: url })} />
        ) : (
          <Avatar nome={pet.nome} fotoUrl={pet.foto_url} size={84} />
        )}
      </View>

      <FormularioPet
        inicial={pet}
        rotuloBotao="Salvar"
        onSalvar={async d => {
          if (!user) return 'Sua sessão expirou. Entre de novo.'
          const { data, error } = await supabase
            .from('pet')
            .update({ nome: d.nome, raca: d.raca, sexo: d.sexo, especie: d.especie || null, porte: d.porte || null, dt_nasc: d.dt_nasc, peso: d.peso, obs: d.obs || null })
            .eq('id_pet', id)
            .eq('id_cliente', user.id)
            .select('id_pet')
          if (error || !data || data.length === 0) return error ? mensagemDoBanco(error, 'Erro ao atualizar o pet.') : 'Não foi possível salvar este pet.'
          router.back()
          return null
        }}
      />

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginTop: spacing.md }} />}
      <Botao rotulo="Remover pet" icone="trash-outline" variante="perigo" style={{ marginTop: spacing.lg }} onPress={pedirRemocao} carregando={removendo} />
    </ScreenContainer>
  )
}
