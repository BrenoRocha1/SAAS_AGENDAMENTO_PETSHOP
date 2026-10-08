import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarraTopo } from '@/components/BarraTopo'
import { SearchField } from '@/components/SearchField'
import { PetCartao } from '@/components/PetCartao'
import { EmptyState } from '@/components/EmptyState'
import { FolhaPet } from '@/components/FolhaPet'
import { SemPermissao } from '@/components/SemPermissao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { usePetsLojista } from '@/hooks/usePetsLojista'
import { acoesDisponiveis } from '@/lib/acoes'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function PetsScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
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
              onPress={() => setNovo(true)}
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

      {/* Os pets em cards, dois por linha (a grade `.pets-grade` do site no
          celular). Com número ímpar, um espaço vazio fecha a última linha
          para o card não esticar. */}
      <FlatList
        data={pets.length % 2 ? [...pets, null] : pets}
        keyExtractor={item => item?.id_pet ?? 'vazio'}
        numColumns={2}
        columnWrapperStyle={styles.linha}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (item ? <PetCartao pet={item} tutor={item.nome_cliente} onPress={() => router.push(`/pets/${item.id_pet}`)} /> : <View style={styles.vazio} />)}
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

      <FolhaPet visivel={novo} idLojista={contexto.idLojista} onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); recarregar() }} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  // 16 em cima e embaixo, 12 entre o título e o que vem depois — as medidas
  // da tela do site no celular (.app-content, .tela-app-titulo, .tela-app-busca).
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
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
  linha: { gap: spacing.md },
  vazio: { flex: 1 },
})
