import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  // Abre o menu da área (loja: serviços, produtos, equipe, configurações…;
  // TaxiDog: trocar de área e sair).
  onMenu: () => void
  rotuloMenu: string
}

// Barra do topo da tela Início: a marca à esquerda e o menu à direita. O
// menu saiu da barra de baixo — ele é pouco usado no dia a dia e ocupava
// o lugar de uma aba.
export function BarraTopo({ onMenu, rotuloMenu }: Props) {
  return (
    <View style={styles.barra}>
      <View style={styles.marca}>
        <View style={styles.logo}>
          <Ionicons name="paw" size={17} color={colors.white} />
        </View>
        <Text style={styles.nome}>
          SA<Text style={{ color: colors.primary600 }}>IP</Text>
        </Text>
      </View>

      <Pressable
        onPress={onMenu}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={rotuloMenu}
        style={({ pressed }) => [styles.menu, pressed && styles.menuPressionado]}
      >
        <Ionicons name="grid-outline" size={20} color={colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  marca: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: colors.primary600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { ...typography.heading.md, color: colors.text },
  menu: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuPressionado: { backgroundColor: colors.surfaceMuted },
})
