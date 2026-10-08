// Logo do SAIP: as duas folhas + o nome "SAIP" desenhado como traço (o mesmo
// desenho da logo original, não depende de nenhuma fonte instalada).
// Mesmo desenho do app (petshop-mobile/src/components/LogoSaip.tsx) e do
// src/app/icon.svg.

const FOLHAS = (
  <g fill="var(--logo-saip, #4343e0)">
    <path d="M14 6C100 5 150 25 185 70C215 110 225 150 212 200C208 220 206 232 202 241Q199 246 192 246C120 246 55 195 28 120C16 85 9 50 9 14Q9 6 14 6Z" />
    <path d="M366 62Q372 62 372 70C372 130 345 185 290 225C275 236 262 242 252 245Q246 247 244 240C238 215 236 185 245 155C258 108 300 72 360 62Z" />
  </g>
)

// S A I P — traço de 12 de largura, 115 de altura, em coordenadas locais.
const NOME = (
  <g fill="none" stroke="var(--logo-texto, currentColor)" strokeWidth="14" strokeLinejoin="miter">
    <path d="M82 22C72 12 58 9 46 9C26 9 12 19 12 33C12 47 26 53 46 58C66 63 84 70 84 88C84 102 70 112 48 112C30 112 14 106 6 96" />
    <path d="M157 120L215 10L273 120M181 90H249" />
    <path d="M355 5V120" />
    <path d="M450 5V120M450 11H490C520 11 535 25 535 45C535 65 520 79 490 79H450" />
  </g>
)

export function LogoSimbolo({ altura = 28, className, style }: { altura?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 380 250" height={altura} width={(altura * 380) / 250} className={className} style={{ flexShrink: 0, ...style }} aria-hidden="true" focusable="false">
      {FOLHAS}
    </svg>
  )
}

// Logo completa (símbolo + nome). `sufixo` ("Admin", "Interno") vem em texto
// pequeno depois do nome.
export default function LogoSaip({ altura = 28, sufixo, className }: { altura?: number; sufixo?: string; className?: string }) {
  return (
    <span className={`logo-saip ${className ?? ''}`} role="img" aria-label={sufixo ? `SAIP ${sufixo}` : 'SAIP'}>
      <svg viewBox="0 0 990 250" height={altura} width={(altura * 990) / 250} style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
        {FOLHAS}
        <g transform="translate(440 55)">{NOME}</g>
      </svg>
      {sufixo && <span className="logo-saip-sufixo">{sufixo}</span>}
    </span>
  )
}
