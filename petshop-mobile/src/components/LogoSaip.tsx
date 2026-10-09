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
    <Svg width={(altura * 930) / 250} height={altura} viewBox="0 0 930 250">
      <G fill={cor}>
        <Path d={FOLHA_GRANDE} />
        <Path d={FOLHA_PEQUENA} />
      </G>
      <G transform="translate(440 63)" fill="none" stroke={corTexto} strokeWidth={14} strokeLinejoin="miter">
        <Path d="M82 22C72 12 58 9 46 9C26 9 12 19 12 33C12 47 26 53 46 58C66 63 84 70 84 88C84 102 70 112 48 112C30 112 14 106 6 96" />
        <Path d="M148 120L206 10L264 120M172 90H240" />
        <Path d="M328 5V120" />
        <Path d="M392 5V120M392 11H432C462 11 477 25 477 45C477 65 462 79 432 79H392" />
      </G>
    </Svg>
  )
}
