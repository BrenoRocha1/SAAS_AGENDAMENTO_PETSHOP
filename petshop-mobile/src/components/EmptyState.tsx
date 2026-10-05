import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { Ilustracao, type NomeIlustracao } from '@/components/Ilustracao'
import { colors, spacing, typography } from '@/theme/theme'

interface Props {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle?: string
  // Desenho no lugar do ícone — só nas telas vazias que mais aparecem.
  ilustracao?: NomeIlustracao
}

export function EmptyState({ icon, title, subtitle, ilustracao }: Props) {
  return (
    <View style={styles.container}>
      {ilustracao ? (
        <Ilustracao nome={ilustracao} altura={120} style={styles.ilustracao} />
      ) : (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={26} color={colors.textFaint} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing['2xl'], paddingHorizontal: spacing.lg },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  ilustracao: { marginBottom: spacing.md },
  title: { ...typography.heading.sm, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body.md, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
})
