import type { ReactNode } from 'react'
import type { ColorValue } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

// Ícones das abas e dos menus — os MESMOS desenhos do site
// (petshop-app/src/components/icons/index.tsx): traço fino, só contorno, e
// o item aberto muda só de cor. São SVG (e não Ionicons) justamente pra o
// app e o painel do site ficarem idênticos; se um desenho mudar lá, muda
// aqui. O nome do ícone do site vai no comentário de cada um.

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

// IconGrid — "Dashboard" na barra lateral do site
export function IconePainel(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <Rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
      <Rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
      <Rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
    </Base>
  )
}

// IconChartBar
export function IconeRelatorios(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M4 20V10M10 20V4M16 20v-7M20 20H4" />
    </Base>
  )
}

// IconRepeat
export function IconePlanos(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M17 2l3 3-3 3" />
      <Path d="M4 11V9a4 4 0 0 1 4-4h12" />
      <Path d="M7 22l-3-3 3-3" />
      <Path d="M20 13v2a4 4 0 0 1-4 4H4" />
    </Base>
  )
}

// IconScissors
export function IconeServicos(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Circle cx="6.5" cy="6.5" r="2.2" />
      <Circle cx="6.5" cy="17.5" r="2.2" />
      <Path d="m20 5-12 14M8.3 8 20 19M8.3 16l1.4-1.6" />
    </Base>
  )
}

// IconPackage
export function IconeProdutos(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <Path d="M3 8v8l9 5 9-5V8" />
      <Path d="M12 13v8" />
    </Base>
  )
}

// IconDog — "Pets" na barra lateral do site (a aba de baixo usa a patinha)
export function IconeCachorro(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M5 10c0-2.5 1.5-4.5 3-5.5.5 1 .5 2 .3 3M19 10c0-2.5-1.5-4.5-3-5.5-.5 1-.5 2-.3 3" />
      <Path d="M6 9c-1 1-1.5 2.5-1.5 4.2 0 3.6 3.4 6.3 7.5 6.3s7.5-2.7 7.5-6.3C19.5 11.5 19 10 18 9" />
      <Circle cx="9.3" cy="12.5" r="1" fill={props.color} stroke="none" />
      <Circle cx="14.7" cy="12.5" r="1" fill={props.color} stroke="none" />
      <Path d="M10.5 15.3c.5.5 2.5.5 3 0" />
    </Base>
  )
}

// IconSettings
export function IconeConfiguracoes(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Base>
  )
}

// IconUser
export function IconePerfil(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="8" r="3.5" />
      <Path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </Base>
  )
}

// IconPlus
export function IconeMais(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M12 5v14M5 12h14" />
    </Base>
  )
}

// IconLogout
export function IconeSair(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <Path d="M15 16l4-4-4-4" />
      <Path d="M19 12H9" />
    </Base>
  )
}

// IconMenu
export function IconeMenu(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  )
}

// IconClose
export function IconeFechar(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Base>
  )
}

// IconChevronRight
export function IconeSeta(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M9 5l7 7-7 7" />
    </Base>
  )
}

// IconMoney
export function IconeDinheiro(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <Circle cx="12" cy="12" r="2.5" />
      <Path d="M6 9v0M18 15v0" />
    </Base>
  )
}

// IconShield
export function IconeEscudo(props: IconeAbaProps) {
  return (
    <Base {...props}>
      <Path d="M12 3.5 19 6v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-2.5Z" />
      <Path d="m9.2 12 1.9 1.9 3.7-3.9" />
    </Base>
  )
}
