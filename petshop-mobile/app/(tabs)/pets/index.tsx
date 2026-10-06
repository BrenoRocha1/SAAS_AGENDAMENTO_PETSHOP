import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarraTopo } from '@/components/BarraTopo'
import { SearchField } from '@/components/SearchField'
import { PetRow } from '@/components/PetRow'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { useAuth } from '@/contexts/AuthContext'
import { usePetsLojista } from '@/hooks/usePetsLojista'
import { acoesDisponiveis } from '@/lib/acoes'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function PetsScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const { pets, loading, loadingMais, erro, temMais, carregarMais, recarregar } = usePetsLojista(
    contexto?.idLojista,
    busca
  )

  // Voltando pra lista (depois de cadastrar ou editar um pet), ela é
  // recarregada — na primeira vez quem carrega é o próprio hook.
  const recarregarAtual = useRef(recarregar)
  useEffect(() => { recarregarAtual.current = recarregar })
  const jaAbriu = useRef(false)
  useFocusEffect(useCallback(() => {
    if (!jaAbriu.current) { jaAbriu.current = true; return }
    recarregarAtual.current()
  }, []))

  if (!contexto?.podeGerenciarClientesPets) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BarraTopo />
        <View style={styles.header}>
          <Text style={styles.title}>Pets</Text>
        </View>
        <SemPermissao area="ver pets" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BarraTopo />
      <View style={styles.header}>
        <View style={styles.tituloLinha}>
          <Text style={styles.title}>Pets</Text>
          {/* Mesma regra do "Novo pet" da ficha do cliente (o servidor exige a agenda). */}
          {contexto.podeGerenciarAgenda && acoesDisponiveis() && (
            <Pressable
              onPress={() => router.push('/pets/novo')}
              accessibilityRole="button"
              accessibilityLabel="Novo pet"
              style={({ pressed }) => [styles.novo, pressed && { opacity: 0.8 }]}
            >
              <IconeApp name="add" size={18} color={colors.white} />
              <Text style={styles.novoTexto}>Novo</Text>
            </Pressable>
          )}
        </View>
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
            <EmptyState icon="alert-circle-outline" ilustracao="erro" title="Não foi possível carregar" subtitle={erro} />
          ) : (
            <EmptyState
              icon="paw-outline"
              ilustracao={busca ? undefined : 'pets'}
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
