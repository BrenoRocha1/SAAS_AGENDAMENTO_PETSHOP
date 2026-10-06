import type { ComponentType } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { StyleSheet, Text, View } from 'react-native'
import type { IconeAbaProps } from '@/components/IconesAbas'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  // Um nome do Ionicons ou um dos desenhos do site (components/IconesAbas).
  icon: keyof typeof Ionicons.glyphMap | ComponentType<IconeAbaProps>
  value: string | number
  label: string
  tint?: string
}

// Tile de resumo da tela Início (quantidade de agendamentos, pets na
// loja etc.) — número grande, rótulo pequeno, ícone com fundo tingido.
export function StatCard({ icon: Icone, value, label, tint = colors.primary600 }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}1a` }]}>
        {typeof Icone === 'string' ? <IconeApp name={Icone} size={18} color={tint} /> : <Icone size={18} color={tint} />}
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
