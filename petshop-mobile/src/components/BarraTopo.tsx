import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MenuLateral } from '@/components/MenuLateral'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  rotuloMenu?: string
  // Era o que abria a tela de menu da área. O menu agora é a gaveta
  // lateral (MenuLateral), aberta por esta barra — a propriedade continua
  // aceita só pra quem ainda a passa.
  onMenu?: () => void
}

// Barra do topo das telas principais: os três tracinhos à esquerda (abrem
// o menu lateral, igual ao site no celular) e a marca ao lado.
export function BarraTopo({ rotuloMenu = 'Abrir menu' }: Props) {
  const [menuAberto, setMenuAberto] = useState(false)

  return (
    <View style={styles.barra}>
      <Pressable
        onPress={() => setMenuAberto(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={rotuloMenu}
        style={({ pressed }) => [styles.menu, pressed && styles.menuPressionado]}
      >
        <Ionicons name="menu" size={22} color={colors.text} />
      </Pressable>

      <View style={styles.marca}>
        <View style={styles.logo}>
          <Ionicons name="paw" size={15} color={colors.white} />
        </View>
        <Text style={styles.nome}>
          SA<Text style={{ color: colors.primary600 }}>IP</Text>
        </Text>
      </View>

      <MenuLateral visivel={menuAberto} onFechar={() => setMenuAberto(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  marca: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.primary600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { ...typography.heading.md, color: colors.text },
  menu: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuPressionado: { backgroundColor: colors.surfaceMuted },
})
