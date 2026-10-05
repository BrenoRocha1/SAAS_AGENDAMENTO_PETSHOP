import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { Aviso } from '@/components/Aviso'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Pet {
  id_pet: string
  nome: string
  raca: string
  especie: string | null
  porte: string | null
  foto_url: string | null
}

// Pets do cliente (tabela `pet`, só os dele e ativos).
export default function PetsClienteScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const idCliente = user?.id
  const [pets, setPets] = useState<Pet[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idCliente) return
    const { data, error } = await supabase
      .from('pet')
      .select('id_pet, nome, raca, especie, porte, foto_url')
      .eq('id_cliente', idCliente)
      .eq('ativo', true)
      .order('nome')
    setErro(error ? 'Não foi possível carregar os seus pets.' : null)
    setPets((data ?? []) as Pet[])
    setLoading(false)
  }, [idCliente])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  return (
    <ScreenContainer
      refreshing={loading}
      onRefresh={carregar}
      topo={<BarraTopo rotuloMenu="Menu" onMenu={() => router.push('/cliente/menu' as never)} />}
    >
      <View style={styles.cabecalho}>
        <Text style={styles.h1}>Meus pets</Text>
        <Pressable
          onPress={() => router.push('/cliente/pets/novo' as never)}
          accessibilityRole="button"
          accessibilityLabel="Novo pet"
          style={({ pressed }) => [styles.novo, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.novoTexto}>Novo</Text>
        </Pressable>
      </View>

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {!loading && pets.length === 0 && !erro ? (
        <EmptyState icon="paw-outline" ilustracao="pets" title="Nenhum pet cadastrado" subtitle="Cadastre o seu pet para poder agendar." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {pets.map(p => (
            <Card key={p.id_pet} style={styles.item} onPress={() => router.push(`/cliente/pets/${p.id_pet}` as never)}>
              <Avatar nome={p.nome} fotoUrl={p.foto_url} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.nome} numberOfLines={1}>{p.nome}</Text>
                <Text style={styles.sub} numberOfLines={1}>{[p.especie, p.raca, p.porte].filter(Boolean).join(' • ')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Card>
          ))}
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  h1: { ...typography.heading.xl, color: colors.text },
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
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  sub: { ...typography.body.md, color: colors.textMuted },
})
