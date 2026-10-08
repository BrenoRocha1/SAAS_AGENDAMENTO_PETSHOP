import Svg, { G, Path } from 'react-native-svg'

// Logo do SAIP — o mesmo desenho do site (petshop-app/src/components/LogoSaip.tsx):
// as duas folhas e o nome em traço.
const FOLHA_GRANDE = 'M14 6C100 5 150 25 185 70C215 110 225 150 212 200C208 220 206 232 202 241Q199 246 192 246C120 246 55 195 28 120C16 85 9 50 9 14Q9 6 14 6Z'
const FOLHA_PEQUENA = 'M366 62Q372 62 372 70C372 130 345 185 290 225C275 236 262 242 252 245Q246 247 244 240C238 215 236 185 245 155C258 108 300 72 360 62Z'

export function LogoSimbolo({ altura = 28, cor = '#4343e0' }: { altura?: number; cor?: string }) {
  return (
    <Svg width={(altura * 380) / 250} height={altura} viewBox="0 0 380 250">
      <G fill={cor}>
        <Path d={FOLHA_GRANDE} />
        <Path d={FOLHA_PEQUENA} />
      </G>
    </Svg>
  )
}

export function LogoSaip({ altura = 28, cor = '#4343e0', corTexto = '#0f1535' }: { altura?: number; cor?: string; corTexto?: string }) {
  return (
    <Svg width={(altura * 990) / 250} height={altura} viewBox="0 0 990 250">
      <G fill={cor}>
        <Path d={FOLHA_GRANDE} />
        <Path d={FOLHA_PEQUENA} />
      </G>
      <G transform="translate(440 55)" fill="none" stroke={corTexto} strokeWidth={14} strokeLinejoin="miter">
        <Path d="M82 22C72 12 58 9 46 9C26 9 12 19 12 33C12 47 26 53 46 58C66 63 84 70 84 88C84 102 70 112 48 112C30 112 14 106 6 96" />
        <Path d="M157 120L215 10L273 120M181 90H249" />
        <Path d="M355 5V120" />
        <Path d="M450 5V120M450 11H490C520 11 535 25 535 45C535 65 520 79 490 79H450" />
      </G>
    </Svg>
  )
}
