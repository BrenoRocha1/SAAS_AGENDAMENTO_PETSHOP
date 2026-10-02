import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '@/theme/theme'

// `onVoltar`: pra tela que não tem "tela anterior" na própria pilha (o
// menu, aberto pela barra do topo) dizer pra onde a seta leva.
export function DetailHeader({ title, onVoltar }: { title: string; onVoltar?: () => void }) {
  const router = useRouter()
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onVoltar ?? (() => router.back())}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        style={styles.voltar}
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Sem padding horizontal: quem usa já está dentro do ScreenContainer,
  // que aplica a margem lateral padrão da tela.
  row: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.lg, gap: spacing.sm },
  voltar: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.xs },
  title: { flex: 1, ...typography.heading.md, color: colors.text },
  spacer: { width: 32 },
})
