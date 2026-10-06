import type { ReactNode } from 'react'
import type { ColorValue } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

// Ícones das abas da barra de baixo — os MESMOS desenhos da barra do site no
// celular (petshop-app/src/components/icons/index.tsx): traço fino, só
// contorno, e o da aba aberta muda só de cor. São SVG (e não Ionicons)
// justamente pra as duas barras ficarem idênticas; se um desenho mudar lá,
// muda aqui.

export interface IconeAbaProps {
  color: ColorValue
  size?: number
}

function Base({ color, size = 22, children }: IconeAbaProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  )
}

// IconHome
export function IconeInicio(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M4 10.5 12 4l8 6.5" />
      <Path d="M6 9.5V20h12V9.5" />
      <Path d="M10 20v-5.5h4V20" />
    </Base>
  )
}

// IconCalendar
export function IconeAgenda(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Rect x="4" y="5" width="16" height="16" rx="2" />
      <Path d="M4 10h16M9 3v4M15 3v4" />
    </Base>
  )
}

// IconUsers
export function IconeClientes(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Circle cx="9" cy="9" r="3" />
      <Path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S14 16 14.5 19M16 6.2a3 3 0 0 1 0 5.6M18 14.6c2 .7 3.4 2.1 3.8 4.4" />
    </Base>
  )
}

// IconPaw
export function IconePets(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Circle cx="7" cy="9.5" r="1.6" />
      <Circle cx="12" cy="7" r="1.7" />
      <Circle cx="17" cy="9.5" r="1.6" />
      <Path d="M8 15c1-1.8 2.4-2.8 4-2.8s3 1 4 2.8c1 1.8-.4 3.4-2.4 3.4-.9 0-1.1-.4-1.6-.4s-.7.4-1.6.4C8 18.4 7 16.8 8 15Z" />
    </Base>
  )
}

// IconStore
export function IconePetshops(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M4 9.5 5.2 4h13.6L20 9.5" />
      <Path d="M4 9.5a2.3 2.3 0 0 0 4.5.6 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5-.6" />
      <Path d="M5.5 10.5V20h13v-9.5" />
      <Path d="M10 20v-5.5h4V20" />
    </Base>
  )
}

// IconCar
export function IconeCorridas(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M5 16.5h14" />
      <Path d="M3.5 16.5v-3.2c0-.5.2-1 .5-1.3l1.9-3.4A2 2 0 0 1 7.6 7.5h8.8a2 2 0 0 1 1.7 1.1l1.9 3.4c.3.4.5.8.5 1.3v3.2" />
      <Path d="M3.5 13h17" />
      <Circle cx="7.5" cy="17" r="1.8" />
      <Circle cx="16.5" cy="17" r="1.8" />
    </Base>
  )
}

// IconRoute
export function IconeRotas(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Circle cx="6" cy="18" r="2" />
      <Circle cx="18" cy="6" r="2" />
      <Path d="M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16" />
    </Base>
  )
}

// IconClock
export function IconeHistorico(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7v5l3.5 2" />
    </Base>
  )
}
