import { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, spacing } from '@/theme/theme'

interface Props {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}

// Card branco padrão — o cartão das telas do site no celular
// (.dash-app-linha): fundo branco, borda suave, cantos arredondados e sem
// sombra.
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
  },
  pressed: { opacity: 0.7 },
})
