import { Ionicons } from '@expo/vector-icons'
import type { ColorValue } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { BarraNavegacao } from './BarraNavegacao'

// Barra inferior compartilhada pelas duas áreas do app (equipe e TaxiDog)
// — mesma aparência (BarraNavegacao, a "pílula"), só as abas mudam.

type IconName = keyof typeof Ionicons.glyphMap

export function tabIcon(nomeAtivo: IconName, nomeInativo: IconName) {
  return ({ focused, color, size }: { focused: boolean; color: ColorValue; size?: number }) => (
    <Ionicons name={focused ? nomeAtivo : nomeInativo} size={size ?? 22} color={color} />
  )
}

export const opcoesTabBar = { headerShown: false }

export const barraDeAbas = (props: BottomTabBarProps) => <BarraNavegacao {...props} />
