import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { SearchField } from '@/components/SearchField'
import { ClienteRow } from '@/components/ClienteRow'
import { EmptyState } from '@/components/EmptyState'
import { FormularioPet, camposDoPet } from '@/components/FormularioPet'
import { useAuth } from '@/contexts/AuthContext'
import { useClientesLojista } from '@/hooks/useClientesLojista'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { colors, spacing, typography } from '@/theme/theme'

// Pet cadastrado pela loja para um cliente que já está na base
// (criarPetLojistaAction → fn_criar_pet_lojista, migration 015).
//
// Chega-se aqui de dois jeitos: pela ficha do cliente ("Novo pet"), com o
// tutor já na rota (?cliente=), ou pela aba Pets ("Novo"), sem tutor — aí a
// primeira coisa é escolher de quem é o pet.
export default function NovoPetScreen() {
  const { cliente: clienteDaRota } = useLocalSearchParams<{ cliente?: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(null)
  const [nomeDaRota, setNomeDaRota] = useState<string | null>(null)
  const cliente = clienteDaRota || escolhido?.id

  useEffect(() => {
    if (!clienteDaRota) return
    let cancelado = false
    supabase.from('cliente').select('nome').eq('id_cliente', clienteDaRota).maybeSingle().then(({ data }) => {
      if (!cancelado) setNomeDaRota((data as { nome: string } | null)?.nome ?? null)
    })
    return () => { cancelado = true }
  }, [clienteDaRota])

  if (!contexto?.podeGerenciarAgenda) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Novo pet" />
        <SemPermissao area="cadastrar pets" />
      </ScreenContainer>
    )
  }

  if (!cliente) {
    return <EscolherTutor idLojista={contexto.idLojista} onEscolher={setEscolhido} />
  }

  const nomeCliente = clienteDaRota ? nomeDaRota : escolhido?.nome

  return (
    <ScreenContainer>
      <DetailHeader title="Novo pet" />
      {nomeCliente && (
        <View style={styles.tutorLinha}>
          <Text style={styles.tutor} numberOfLines={1}>Tutor: {nomeCliente}</Text>
          {/* Só troca quem escolheu aqui; vindo da ficha do cliente, o tutor é ele. */}
          {!clienteDaRota && (
            <Pressable onPress={() => setEscolhido(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Trocar o tutor">
              <Text style={styles.trocar}>Trocar</Text>
            </Pressable>
          )}
        </View>
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

// Primeiro passo de quem veio pela aba Pets: de quem é o pet. Todo pet
// precisa de um tutor já cadastrado (o cliente não é criado aqui).
function EscolherTutor({ idLojista, onEscolher }: { idLojista: string; onEscolher: (tutor: { id: string; nome: string }) => void }) {
  const [busca, setBusca] = useState('')
  const { clientes, loading, loadingMais, erro, temMais, carregarMais, recarregar } = useClientesLojista(idLojista, busca)

  return (
    <ScreenContainer scroll={false} contentStyle={styles.escolher}>
      <DetailHeader title="Novo pet" />
      <Text style={styles.ajuda}>De quem é o pet? Escolha o tutor.</Text>
      <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar tutor por nome ou telefone..." />
      <FlatList
        data={clientes}
        keyExtractor={item => item.id_cliente}
        style={styles.lista}
        contentContainerStyle={styles.listaConteudo}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ClienteRow cliente={item} onPress={() => onEscolher({ id: item.id_cliente, nome: item.nome })} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshing={loading}
        onRefresh={recarregar}
        onEndReachedThreshold={0.4}
        onEndReached={carregarMais}
        ListFooterComponent={temMais && loadingMais ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary600} /> : null}
        ListEmptyComponent={
          loading ? null : erro ? (
            <EmptyState icon="alert-circle-outline" ilustracao="erro" title="Não foi possível carregar" subtitle={erro} />
          ) : (
            <EmptyState
              icon="people-outline"
              ilustracao={busca ? undefined : 'clientes'}
              title={busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              subtitle={busca ? 'Tente outro nome ou telefone.' : 'Cadastre o cliente na aba Clientes antes de cadastrar o pet.'}
            />
          )
        }
      />
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  tutorLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  tutor: { ...typography.body.lg, color: colors.textMuted, flex: 1 },
  trocar: { ...typography.label.md, color: colors.primary600 },
  // A lista rola sozinha e vai até o fim da tela.
  escolher: { flex: 1, paddingBottom: 0 },
  ajuda: { ...typography.body.lg, color: colors.textMuted, marginBottom: spacing.md },
  lista: { flex: 1, marginTop: spacing.md },
  listaConteudo: { paddingBottom: spacing['3xl'], flexGrow: 1 },
})
