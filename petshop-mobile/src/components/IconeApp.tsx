import type { ComponentType } from 'react'
import { Ionicons } from '@expo/vector-icons'
import type { ColorValue, StyleProp, TextStyle, ViewStyle } from 'react-native'
import * as S from './IconesDoSite'

export type NomeIcone = keyof typeof Ionicons.glyphMap

interface DoSite {
  desenho: ComponentType<S.IconeProps>
  // Graus: o site só tem a seta para a direita e para a esquerda.
  giro?: number
  cheio?: boolean
}

// De cada nome do Ionicons (que as telas do app usam) para o desenho que o
// site mostra no mesmo lugar. Quem não está aqui continua no Ionicons: são
// os que o site não tem (marcas como o Google, pares "marcado/desmarcado").
// Ícone novo no site: rodar scripts/gerar-icones.mjs e acrescentar a linha.
const DO_SITE: Partial<Record<NomeIcone, DoSite>> = {
  add: { desenho: S.IconPlus },
  'add-circle': { desenho: S.IconPlus },
  remove: { desenho: S.IconMinus },
  close: { desenho: S.IconClose },
  checkmark: { desenho: S.IconCheck },
  'checkmark-done-outline': { desenho: S.IconCheck },
  'chevron-forward': { desenho: S.IconChevronRight },
  'chevron-back': { desenho: S.IconChevronLeft },
  'chevron-down': { desenho: S.IconChevronRight, giro: 90 },
  'chevron-up': { desenho: S.IconChevronRight, giro: -90 },
  menu: { desenho: S.IconMenu },
  search: { desenho: S.IconSearch },
  'grid-outline': { desenho: S.IconGrid },
  'list-outline': { desenho: S.IconList },
  'calendar-outline': { desenho: S.IconCalendar },
  'time-outline': { desenho: S.IconClock },
  'paw-outline': { desenho: S.IconPaw },
  paw: { desenho: S.IconPaw },
  // O app usava o mascote do GitHub para gato; o site não tem ícone de gato.
  'logo-octocat': { desenho: S.IconPaw },
  'cut-outline': { desenho: S.IconScissors },
  'cube-outline': { desenho: S.IconPackage },
  'ribbon-outline': { desenho: S.IconRepeat },
  'bar-chart-outline': { desenho: S.IconChartBar },
  'settings-outline': { desenho: S.IconSettings },
  'storefront-outline': { desenho: S.IconStore },
  storefront: { desenho: S.IconStore },
  'car-outline': { desenho: S.IconCar },
  car: { desenho: S.IconCar },
  'map-outline': { desenho: S.IconRoute },
  map: { desenho: S.IconRoute },
  'location-outline': { desenho: S.IconMapPin },
  'person-outline': { desenho: S.IconUser },
  'person-add-outline': { desenho: S.IconUserPlus },
  'people-outline': { desenho: S.IconUsers },
  'people-circle-outline': { desenho: S.IconUsers },
  'call-outline': { desenho: S.IconPhone },
  call: { desenho: S.IconPhone },
  'mail-outline': { desenho: S.IconMail },
  'logo-whatsapp': { desenho: S.IconWhatsapp },
  'cash-outline': { desenho: S.IconMoney },
  'card-outline': { desenho: S.IconMoney },
  'create-outline': { desenho: S.IconPencil },
  'trash-outline': { desenho: S.IconTrash },
  'camera-outline': { desenho: S.IconCamera },
  camera: { desenho: S.IconCamera },
  'lock-closed-outline': { desenho: S.IconLock },
  'log-out-outline': { desenho: S.IconLogout },
  'alert-circle-outline': { desenho: S.IconAlert },
  'alert-circle': { desenho: S.IconAlert },
  warning: { desenho: S.IconAlert },
  'information-circle': { desenho: S.IconInfo },
  'information-circle-outline': { desenho: S.IconInfo },
  'star-outline': { desenho: S.IconStar },
  star: { desenho: S.IconStar, cheio: true },
}

interface Props {
  name: NomeIcone
  size?: number
  color?: ColorValue
  style?: StyleProp<ViewStyle>
}

// Ícone das telas do app: o desenho do site quando ele existe, o do
// Ionicons quando não. Mesmas propriedades do <Ionicons>, de propósito —
// as telas só trocam o nome do componente.
export function IconeApp({ name, size = 24, color = '#111827', style }: Props) {
  const doSite = DO_SITE[name]
  if (!doSite) return <Ionicons name={name} size={size} color={color} style={style as StyleProp<TextStyle>} />
  const Desenho = doSite.desenho
  const giro = doSite.giro ? { transform: [{ rotate: `${doSite.giro}deg` }] } : undefined
  return <Desenho size={size} color={color} cheio={doSite.cheio} style={giro ? [giro, style] : style} />
}
