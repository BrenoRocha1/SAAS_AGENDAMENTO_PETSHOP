import type { ComponentType } from 'react'
import type { ColorValue } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { BarraNavegacao } from './BarraNavegacao'
import type { IconeAbaProps } from './IconesAbas'

// Barra inferior compartilhada pelas três áreas do app (equipe, cliente e
// TaxiDog) — mesma aparência (BarraNavegacao, a "pílula"), só as abas mudam.

// O ícone é o mesmo com a aba aberta ou fechada (como na barra do site no
// celular): só a cor muda, e quem escolhe a cor é a barra.
export function tabIcon(Icone: ComponentType<IconeAbaProps>) {
  return ({ color, size }: { focused: boolean; color: ColorValue; size?: number }) => (
    <Icone color={color} size={size ?? 22} />
  )
}

export const opcoesTabBar = { headerShown: false }

export const barraDeAbas = (props: BottomTabBarProps) => <BarraNavegacao {...props} />
