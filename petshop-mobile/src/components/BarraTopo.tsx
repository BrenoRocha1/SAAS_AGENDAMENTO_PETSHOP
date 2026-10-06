import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconeMenu, IconePets } from '@/components/IconesAbas'
import { MenuLateral } from '@/components/MenuLateral'
import { Text } from '@/components/Texto'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, radius, spacing } from '@/theme/theme'

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
        <IconeMenu size={22} color={colors.text} />
      </Pressable>

      <View style={styles.marca}>
        <View style={styles.logo}>
          <IconePets size={16} color={colors.white} />
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
    // 52 de altura, como a barra do site no celular (--menu-mobile-altura).
    height: 52,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  marca: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primary600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nome: { fontSize: 18, fontWeight: '800', letterSpacing: -0.36, fontFamily: FONTE_TITULO, color: colors.text },
  menu: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuPressionado: { backgroundColor: colors.surfaceMuted },
})
