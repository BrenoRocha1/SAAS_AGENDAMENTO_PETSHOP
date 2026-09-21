import { StyleSheet, Text, View } from 'react-native'
import { radius, spacing } from '@/theme/theme'
import { coresStatus, rotuloStatus } from '@/lib/statusAgendamento'

export function StatusBadge({ status }: { status: string }) {
  const cor = coresStatus(status)
  return (
    <View style={[styles.badge, { backgroundColor: cor.bg }]}>
      <Text style={[styles.text, { color: cor.fg }]}>{rotuloStatus(status)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
})
