import { useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SearchField } from '@/components/SearchField'
import { PetRow } from '@/components/PetRow'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { useAuth } from '@/contexts/AuthContext'
import { usePetsLojista } from '@/hooks/usePetsLojista'
import { colors, spacing, typography } from '@/theme/theme'

export default function PetsScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const { pets, loading, loadingMais, erro, temMais, carregarMais, recarregar } = usePetsLojista(
    contexto?.idLojista,
    busca
  )

  if (!contexto?.podeGerenciarClientesPets) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Pets</Text>
        </View>
        <SemPermissao area="ver pets" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Pets</Text>
        <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar pet, raça ou tutor..." />
      </View>

      <FlatList
        data={pets}
        keyExtractor={item => item.id_pet}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PetRow pet={item} onPress={() => router.push(`/pets/${item.id_pet}`)} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshing={loading}
        onRefresh={recarregar}
        onEndReachedThreshold={0.4}
        onEndReached={carregarMais}
        ListFooterComponent={temMais && loadingMais ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primary600} /> : null}
        ListEmptyComponent={
          loading ? null : erro ? (
            <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
          ) : (
            <EmptyState
              icon="paw-outline"
              title={busca ? 'Nenhum pet encontrado' : 'Nenhum pet cadastrado'}
              subtitle={busca ? 'Tente outro nome, raça ou tutor.' : 'Os pets da sua loja aparecem aqui.'}
            />
          )
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  title: { ...typography.heading.xl, color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], flexGrow: 1 },
})
