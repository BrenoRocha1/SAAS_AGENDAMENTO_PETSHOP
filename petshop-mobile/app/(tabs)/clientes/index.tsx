import { useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarraTopo } from '@/components/BarraTopo'
import { SearchField } from '@/components/SearchField'
import { ClienteRow } from '@/components/ClienteRow'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { useAuth } from '@/contexts/AuthContext'
import { useClientesLojista } from '@/hooks/useClientesLojista'
import { acoesDisponiveis } from '@/lib/acoes'
import { colors, radius, spacing, typography } from '@/theme/theme'

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
        <BarraTopo />
        <View style={styles.header}>
          <Text style={styles.title}>Clientes</Text>
        </View>
        <SemPermissao area="ver clientes" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BarraTopo />
      <View style={styles.header}>
        <View style={styles.tituloLinha}>
          <Text style={styles.title}>Clientes</Text>
          {contexto.acessoTotal && acoesDisponiveis() && (
            <Pressable
              onPress={() => router.push('/clientes/novo')}
              accessibilityRole="button"
              accessibilityLabel="Novo cliente"
              style={({ pressed }) => [styles.novo, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.novoTexto}>Novo</Text>
            </Pressable>
          )}
        </View>
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
            <EmptyState icon="alert-circle-outline" ilustracao="erro" title="Não foi possível carregar" subtitle={erro} />
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
  tituloLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  novo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary600,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  novoTexto: { ...typography.label.md, color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], flexGrow: 1 },
})
