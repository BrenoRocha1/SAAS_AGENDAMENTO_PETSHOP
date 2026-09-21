import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { Card } from './Card'
import { Avatar } from './Avatar'
import { formatarTelefone } from '@/lib/format'
import { colors, spacing, typography } from '@/theme/theme'
import type { ClienteLinha } from '@/types/database'

export function ClienteRow({ cliente, onPress }: { cliente: ClienteLinha; onPress: () => void }) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <Avatar nome={cliente.nome} />
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>
          {cliente.nome}
        </Text>
        <Text style={styles.telefone} numberOfLines={1}>
          {formatarTelefone(cliente.telefone)}
        </Text>
      </View>
      <View style={styles.petsBadge}>
        <Ionicons name="paw-outline" size={13} color={colors.textMuted} />
        <Text style={styles.petsTexto}>{cliente.qtd_pets}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  info: { flex: 1, gap: 2 },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  telefone: { ...typography.body.sm, color: colors.textMuted },
  petsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  petsTexto: { ...typography.body.sm, color: colors.textDim, fontWeight: '600' },
})
