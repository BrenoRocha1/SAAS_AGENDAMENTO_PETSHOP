import { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { colors, radius, shadow, spacing } from '@/theme/theme'

interface Props {
  children: ReactNode
  style?: ViewStyle
  onPress?: () => void
}

// Card branco padrão (mesma linguagem visual do .card do web: fundo
// branco, borda suave, cantos arredondados, sombra bem discreta).
export function Card({ children, style, onPress }: Props) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    )
  }
  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.sm,
  },
  pressed: { opacity: 0.7 },
})
