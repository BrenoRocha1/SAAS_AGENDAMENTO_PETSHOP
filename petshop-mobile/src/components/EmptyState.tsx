import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { StyleSheet, View } from 'react-native'
import { Ilustracao, type NomeIlustracao } from '@/components/Ilustracao'
import { Text } from '@/components/Texto'
import { colors, spacing, typography } from '@/theme/theme'

interface Props {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  subtitle?: string
  // Desenho no lugar do ícone (não em resultado de busca sem resposta).
  ilustracao?: NomeIlustracao
}

export function EmptyState({ icon, title, subtitle, ilustracao }: Props) {
  return (
    <View style={styles.container}>
      {ilustracao ? (
        <Ilustracao nome={ilustracao} altura={110} />
      ) : (
        <View style={styles.iconWrap}>
          <IconeApp name={icon} size={26} color={colors.textFaint} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  // Medidas do `.dash-app-vazio` do site: coluna com 4 de vão, desenho de
  // 110, título 8 abaixo dele.
  container: { alignItems: 'center', gap: 4, paddingVertical: spacing['2xl'], paddingHorizontal: spacing.lg },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  subtitle: { ...typography.body.md, color: colors.textMuted, textAlign: 'center' },
})
