import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconeMenu } from '@/components/IconesAbas'
import { LogoSaip } from '@/components/LogoSaip'
import { MenuLateral } from '@/components/MenuLateral'
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

      <LogoSaip altura={24} cor={colors.primary600} corTexto={colors.text} />

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
  menu: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuPressionado: { backgroundColor: colors.surfaceMuted },
})
