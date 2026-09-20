import { useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SearchField } from '@/components/SearchField'
import { ClienteRow } from '@/components/ClienteRow'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { useAuth } from '@/contexts/AuthContext'
import { useClientesLojista } from '@/hooks/useClientesLojista'
import { colors, spacing, typography } from '@/theme/theme'

export default function ClientesScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const { clientes, loading, loadingMais, erro, temMais, carregarMais, recarregar } = useClientesLojista(
    contexto?.idLojista,
    busca
  )

  if (!contexto?.podeGerenciarClientesPets) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Clientes</Text>
        </View>
        <SemPermissao area="ver clientes" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Clientes</Text>
        <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar por nome ou telefone..." />
      </View>

      <FlatList
        data={clientes}
        keyExtractor={item => item.id_cliente}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ClienteRow cliente={item} onPress={() => router.push(`/clientes/${item.id_cliente}`)} />
        )}
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
              icon="people-outline"
              title={busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              subtitle={busca ? 'Tente outro nome ou telefone.' : 'Os clientes da sua loja aparecem aqui.'}
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
