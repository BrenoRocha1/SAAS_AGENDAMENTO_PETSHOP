import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, type ColorValue } from 'react-native'
import { colors } from '@/theme/theme'

// Barra inferior compartilhada pelas duas áreas do app (equipe e TaxiDog)
// — mesma aparência, só as abas mudam.

type IconName = keyof typeof Ionicons.glyphMap

export function tabIcon(nomeAtivo: IconName, nomeInativo: IconName) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? nomeAtivo : nomeInativo} size={23} color={color} />
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabItem: { paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: '600' },
})

export const opcoesTabBar = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary600,
  tabBarInactiveTintColor: colors.textFaint,
  tabBarLabelStyle: styles.label,
  tabBarStyle: styles.tabBar,
  tabBarItemStyle: styles.tabItem,
}
