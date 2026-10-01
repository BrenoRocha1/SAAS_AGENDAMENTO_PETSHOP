import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { FormularioPet, camposDoPet, type DadosPet } from '@/components/FormularioPet'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { chamarAcao, form } from '@/lib/acoes'
import { colors } from '@/theme/theme'

// Edição do pet pela loja (editarPetLojistaAction → fn_editar_pet_lojista,
// migration 018) — dono ou administrador.
export default function EditarPetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const [pet, setPet] = useState<(Partial<DadosPet> & { id_cliente: string }) | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    supabase
      .from('pet')
      .select('id_cliente, nome, raca, sexo, especie, porte, dt_nasc, peso, obs')
      .eq('id_pet', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return
        if (error || !data) return setErro('Não foi possível carregar este pet.')
        const d = data as { id_cliente: string; nome: string; raca: string; sexo: DadosPet['sexo']; especie: DadosPet['especie'] | null; porte: DadosPet['porte'] | null; dt_nasc: string; peso: number | null; obs: string | null }
        setPet({ ...d, especie: d.especie ?? '', porte: d.porte ?? '', peso: d.peso == null ? null : Number(d.peso), obs: d.obs ?? '' })
      })
    return () => { cancelado = true }
  }, [id])

  if (!contexto?.acessoTotal) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Editar pet" />
        <SemPermissao area="editar pets" />
      </ScreenContainer>
    )
  }

  if (!pet) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Editar pet" />
        {erro ? (
          <EmptyState icon="alert-circle-outline" title="Pet não encontrado" subtitle={erro} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary600} /></View>
        )}
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Editar pet" />
      <FormularioPet
        inicial={pet}
        rotuloBotao="Salvar"
        onSalvar={async dados => {
          const r = await chamarAcao('editarPetLojistaAction', id, form(camposDoPet(pet.id_cliente, dados)))
          if (r.error) return r.error
          router.back()
          return null
        }}
      />
    </ScreenContainer>
  )
}
