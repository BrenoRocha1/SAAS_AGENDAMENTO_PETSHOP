// ARQUIVO GERADO — não editar à mão. Vem de
// petshop-app/src/components/icons/index.tsx; para refazer:
//
//   node scripts/gerar-icones.mjs
//
// São os MESMOS desenhos do site (traço fino, só contorno), em SVG, para o
// app e o site no celular ficarem idênticos.
import type { ReactNode } from 'react'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

export interface IconeProps {
  color: ColorValue
  size?: number
  // Preenche o desenho com a cor em vez de só contornar (estrela marcada).
  cheio?: boolean
  style?: StyleProp<ViewStyle>
}

function Base({ color, size = 22, cheio, style, children }: IconeProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={cheio ? color : 'none'}
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </Svg>
  )
}

export function IconPaw(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="7" cy="9.5" r="1.6" />
      <Circle cx="12" cy="7" r="1.7" />
      <Circle cx="17" cy="9.5" r="1.6" />
      <Path d="M8 15c1-1.8 2.4-2.8 4-2.8s3 1 4 2.8c1 1.8-.4 3.4-2.4 3.4-.9 0-1.1-.4-1.6-.4s-.7.4-1.6.4C8 18.4 7 16.8 8 15Z" />
    </Base>
  )
}

export function IconMail(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <Path d="m4 7 8 6 8-6" />
    </Base>
  )
}

export function IconHome(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 10.5 12 4l8 6.5" />
      <Path d="M6 9.5V20h12V9.5" />
      <Path d="M10 20v-5.5h4V20" />
    </Base>
  )
}

export function IconGrid(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <Rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
      <Rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
      <Rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
    </Base>
  )
}

export function IconCalendar(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="4" y="5" width="16" height="16" rx="2" />
      <Path d="M4 10h16M9 3v4M15 3v4" />
    </Base>
  )
}

export function IconScissors(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="6.5" cy="6.5" r="2.2" />
      <Circle cx="6.5" cy="17.5" r="2.2" />
      <Path d="m20 5-12 14M8.3 8 20 19M8.3 16l1.4-1.6" />
    </Base>
  )
}

export function IconClock(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7v5l3.5 2" />
    </Base>
  )
}

export function IconUsers(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="9" cy="9" r="3" />
      <Path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5S14 16 14.5 19M16 6.2a3 3 0 0 1 0 5.6M18 14.6c2 .7 3.4 2.1 3.8 4.4" />
    </Base>
  )
}

export function IconUserBadge(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="4" y="4" width="16" height="16" rx="2.5" />
      <Circle cx="12" cy="10" r="2.3" />
      <Path d="M7.5 17c.8-2 2.3-3 4.5-3s3.7 1 4.5 3" />
    </Base>
  )
}

export function IconUserPlus(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="10" cy="8" r="3.2" />
      <Path d="M3.5 19c.9-3 3.2-4.5 6.5-4.5s5.6 1.5 6.5 4.5" />
      <Path d="M19 7v6M16 10h6" />
    </Base>
  )
}

export function IconStore(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 9.5 5.2 4h13.6L20 9.5" />
      <Path d="M4 9.5a2.3 2.3 0 0 0 4.5.6 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5 0 2.3 2.3 0 0 0 4.5-.6" />
      <Path d="M5.5 10.5V20h13v-9.5" />
      <Path d="M10 20v-5.5h4V20" />
    </Base>
  )
}

export function IconLogout(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <Path d="M15 16l4-4-4-4" />
      <Path d="M19 12H9" />
    </Base>
  )
}

export function IconSearch(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="10.5" cy="10.5" r="6.5" />
      <Path d="m20 20-4.3-4.3" />
    </Base>
  )
}

export function IconBell(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" />
      <Path d="M10 19a2 2 0 0 0 4 0" />
    </Base>
  )
}

export function IconPlus(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M12 5v14M5 12h14" />
    </Base>
  )
}

export function IconRepeat(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M17 2l3 3-3 3" />
      <Path d="M4 11V9a4 4 0 0 1 4-4h12" />
      <Path d="M7 22l-3-3 3-3" />
      <Path d="M20 13v2a4 4 0 0 1-4 4H4" />
    </Base>
  )
}

export function IconMenu(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  )
}

export function IconClose(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Base>
  )
}

export function IconChevronLeft(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M15 5 8 12l7 7" />
    </Base>
  )
}

export function IconChevronRight(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M9 5l7 7-7 7" />
    </Base>
  )
}

export function IconCheck(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M5 12.5 10 17 19 7" />
    </Base>
  )
}

export function IconMoney(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <Circle cx="12" cy="12" r="2.5" />
      <Path d="M6 9v0M18 15v0" />
    </Base>
  )
}

export function IconAlert(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M12 4 2.5 20h19L12 4Z" />
      <Path d="M12 10v4M12 17.5v.01" />
    </Base>
  )
}

export function IconInfo(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 11v5.5M12 7.5v.01" />
    </Base>
  )
}

export function IconInbox(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 12h4l1.5 2.5h5L16 12h4" />
      <Rect x="4" y="12" width="16" height="7" rx="1.5" />
      <Path d="M6.5 12 8 5h8l1.5 7" />
    </Base>
  )
}

export function IconDog(props: IconeProps) {
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

export function IconCircle(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="12" r="8.5" />
    </Base>
  )
}

export function IconPencil(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 20l.9-3.9L15.6 5.4a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L8.9 19.1 4 20Z" />
      <Path d="M13.5 7.5l3 3" />
    </Base>
  )
}

export function IconLock(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="5" y="11" width="14" height="9" rx="2" />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Base>
  )
}

export function IconUnlock(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="5" y="11" width="14" height="9" rx="2" />
      <Path d="M8 11V8a4 4 0 0 1 7.4-2" />
    </Base>
  )
}

export function IconShield(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M12 3.5 19 6v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-2.5Z" />
      <Path d="m9.2 12 1.9 1.9 3.7-3.9" />
    </Base>
  )
}

export function IconSave(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M5 4h11l3 3v13H5V4Z" />
      <Path d="M8 4v5h7V4M8 20v-6h8v6" />
    </Base>
  )
}

export function IconSliders(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 6h10M17 6h3M4 12h3M8 12h12M4 18h7M14 18h6" />
      <Circle cx="14" cy="6" r="2" fill={props.color} stroke="none" />
      <Circle cx="6" cy="12" r="2" fill={props.color} stroke="none" />
      <Circle cx="11" cy="18" r="2" fill={props.color} stroke="none" />
    </Base>
  )
}

export function IconTrash(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 7h16" />
      <Path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <Path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <Path d="M10 11v6M14 11v6" />
    </Base>
  )
}

export function IconKanban(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="3.5" y="4" width="5.2" height="16" rx="1.3" />
      <Rect x="9.4" y="4" width="5.2" height="10" rx="1.3" />
      <Rect x="15.3" y="4" width="5.2" height="13" rx="1.3" />
    </Base>
  )
}

export function IconArrowRight(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M5 12h14M13 6l6 6-6 6" />
    </Base>
  )
}

export function IconChartBar(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 20V10M10 20V4M16 20v-7M20 20H4" />
    </Base>
  )
}

export function IconDownload(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M12 4v11M7.5 11 12 15.5 16.5 11" />
      <Path d="M4.5 18.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />
    </Base>
  )
}

export function IconTrendUp(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 16 10 10l4 4 6-7" />
      <Path d="M15 7h5v5" />
    </Base>
  )
}

export function IconTrendDown(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 8l6 6 4-4 6 7" />
      <Path d="M15 17h5v-5" />
    </Base>
  )
}

export function IconEye(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <Circle cx="12" cy="12" r="3" />
    </Base>
  )
}

export function IconWhatsapp(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4.5 20 5.7 16A7.8 7.8 0 1 1 8.9 19l-4.4 1Z" />
      <Path d="M9 9.3c0 3.3 2.7 6 6 6 .5 0 .9-.5.7-1l-.5-1.1a.9.9 0 0 0-1-.5l-.8.2a5 5 0 0 1-2.7-2.7l.2-.8a.9.9 0 0 0-.5-1L9.3 8c-.5-.2-1 .2-1 .7Z" />
    </Base>
  )
}

export function IconSettings(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Base>
  )
}

export function IconImage(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="3" y="4" width="18" height="16" rx="2" />
      <Circle cx="8.5" cy="9.5" r="1.5" />
      <Path d="m5 18 5-5 3.5 3.5L18 12l1 1.5" />
    </Base>
  )
}

export function IconLink(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M9.5 14.5 14.5 9.5" />
      <Path d="M11 6.5 12.5 5a3.5 3.5 0 0 1 5 5L16 11.5" />
      <Path d="M13 17.5 11.5 19a3.5 3.5 0 0 1-5-5L8 12.5" />
    </Base>
  )
}

export function IconCopy(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <Path d="M15.5 8.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h2.5" />
    </Base>
  )
}

export function IconUser(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="12" cy="8" r="3.5" />
      <Path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </Base>
  )
}

export function IconCamera(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />
      <Circle cx="12" cy="13" r="3.3" />
    </Base>
  )
}

export function IconMapPin(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z" />
      <Circle cx="12" cy="10" r="2.2" />
    </Base>
  )
}

export function IconPhone(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M5 4h3.2l1.3 4-2 1.4a11 11 0 0 0 5.1 5.1l1.4-2 4 1.3V17a2 2 0 0 1-2.2 2A15 15 0 0 1 3 5.2 2 2 0 0 1 5 4Z" />
    </Base>
  )
}

export function IconIdCard(props: IconeProps) {
  return (
    <Base {...props}>
      <Rect x="3" y="5" width="18" height="14" rx="2" />
      <Circle cx="8.5" cy="11" r="2" />
      <Path d="M5 16c.6-1.6 1.9-2.4 3.5-2.4S11.4 14.4 12 16" />
      <Path d="M14 9.5h4M14 13h4" />
    </Base>
  )
}

export function IconStar(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9L12 3.5Z" />
    </Base>
  )
}

export function IconPlay(props: IconeProps) {
  return (
    <Base {...props} cheio>
      <Path d="M7.5 5.2c0-.9 1-1.5 1.8-1L17 8.8c.8.5.8 1.7 0 2.2l-7.7 4.6c-.8.5-1.8-.1-1.8-1V5.2Z" />
    </Base>
  )
}

export function IconPackage(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <Path d="M3 8v8l9 5 9-5V8" />
      <Path d="M12 13v8" />
    </Base>
  )
}

export function IconMinus(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M5 12h14" />
    </Base>
  )
}

export function IconList(props: IconeProps) {
  return (
    <Base {...props}>
      <Path d="M8 6h13" />
      <Path d="M8 12h13" />
      <Path d="M8 18h13" />
      <Path d="M3 6h.01" />
      <Path d="M3 12h.01" />
      <Path d="M3 18h.01" />
    </Base>
  )
}

export function IconCar(props: IconeProps) {
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

export function IconRoute(props: IconeProps) {
  return (
    <Base {...props}>
      <Circle cx="6" cy="18" r="2" />
      <Circle cx="18" cy="6" r="2" />
      <Path d="M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16" />
    </Base>
  )
}
