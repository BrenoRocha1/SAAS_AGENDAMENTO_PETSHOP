import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Text } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { FormularioPet, camposDoPet } from '@/components/FormularioPet'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { colors, spacing, typography } from '@/theme/theme'

// Pet cadastrado pela loja para um cliente que já está na base
// (criarPetLojistaAction → fn_criar_pet_lojista, migration 015).
export default function NovoPetScreen() {
  const { cliente } = useLocalSearchParams<{ cliente: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const [nomeCliente, setNomeCliente] = useState<string | null>(null)

  useEffect(() => {
    if (!cliente) return
    let cancelado = false
    supabase.from('cliente').select('nome').eq('id_cliente', cliente).maybeSingle().then(({ data }) => {
      if (!cancelado) setNomeCliente((data as { nome: string } | null)?.nome ?? null)
    })
    return () => { cancelado = true }
  }, [cliente])

  if (!contexto?.podeGerenciarAgenda || !cliente) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Novo pet" />
        <SemPermissao area="cadastrar pets" />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Novo pet" />
      {nomeCliente && (
        <Text style={{ ...typography.body.lg, color: colors.textMuted, marginBottom: spacing.lg }}>Tutor: {nomeCliente}</Text>
      )}
      {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} style={{ marginBottom: spacing.md }} />}
      <FormularioPet
        rotuloBotao="Cadastrar pet"
        onSalvar={async dados => {
          const r = await chamarAcao('criarPetLojistaAction', form(camposDoPet(cliente, dados)))
          if (r.error) return r.error
          router.back()
          return null
        }}
      />
    </ScreenContainer>
  )
}
