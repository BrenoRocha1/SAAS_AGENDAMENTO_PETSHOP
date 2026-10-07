import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { EmptyState } from '@/components/EmptyState'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { CartaoFotoPet } from '@/components/CartaoFotoPet'
import { IconTrash } from '@/components/IconesDoSite'
import { FormularioPet, type DadosPet } from '@/components/FormularioPet'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { acoesDisponiveis } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { mensagemDoBanco } from '@/lib/erros'
import { colors } from '@/theme/theme'

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
          <EmptyState icon="alert-circle-outline" ilustracao="nao-encontrado" title="Pet não encontrado" subtitle={erroCarga} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary600} /></View>
        )}
      </ScreenContainer>
    )
  }

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
      <DetailHeader title="Editar pet" />

      {/* Os mesmos blocos da página do site, com 24 entre eles: a foto, os
          dados e, embaixo, tirar o pet da lista. */}
      <View style={{ gap: 24 }}>
        {/* A foto vai pelo site (envio de arquivo): sem ele configurado, o cartão não aparece. */}
        {acoesDisponiveis() && <CartaoFotoPet idPet={id} fotoUrl={pet.foto_url} onMudou={url => setPet({ ...pet, foto_url: url })} />}

        <FormularioPet
          inicial={pet}
          editando
          onCancelar={() => router.back()}
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

        <View style={{ gap: 12 }}>
          {erro && <Aviso tipo="erro" texto={erro} />}
          <BotaoPequeno normal variante="perigoClaro" rotulo="Remover pet" icone={IconTrash} onPress={pedirRemocao} carregando={removendo} />
        </View>
      </View>
    </ScreenContainer>
  )
}
