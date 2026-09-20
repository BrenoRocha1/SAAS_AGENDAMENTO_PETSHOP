import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { Card } from './Card'
import { Avatar } from './Avatar'
import { colors, spacing, typography } from '@/theme/theme'
import type { PetLinha } from '@/types/database'

export function PetRow({ pet, onPress }: { pet: PetLinha; onPress: () => void }) {
  const detalhes = [pet.raca, pet.porte].filter(Boolean).join(' • ')

  return (
    <Card style={styles.card} onPress={onPress}>
      <Avatar nome={pet.nome} fotoUrl={pet.foto_url} />
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>
          {pet.nome}
        </Text>
        <Text style={styles.detalhes} numberOfLines={1}>
          {detalhes || (pet.especie ?? 'Pet')}
        </Text>
        <View style={styles.tutorRow}>
          <Ionicons name="person-outline" size={12} color={colors.textFaint} />
          <Text style={styles.tutor} numberOfLines={1}>
            {pet.nome_cliente}
          </Text>
        </View>
      </View>
      <Ionicons name={pet.especie === 'Gato' ? 'logo-octocat' : 'paw-outline'} size={16} color={colors.textFaint} />
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1, gap: 2 },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  detalhes: { ...typography.body.sm, color: colors.textMuted },
  tutorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  tutor: { ...typography.body.sm, color: colors.textFaint },
})
