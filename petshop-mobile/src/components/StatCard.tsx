import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  icon: keyof typeof Ionicons.glyphMap
  value: string | number
  label: string
  tint?: string
}

// Tile de resumo da tela Início (quantidade de agendamentos, pets na
// loja etc.) — número grande, rótulo pequeno, ícone com fundo tingido.
export function StatCard({ icon, value, label, tint = colors.primary600 }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}1a` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { ...typography.heading.lg, color: colors.text },
  label: { ...typography.body.sm, color: colors.textMuted },
})
