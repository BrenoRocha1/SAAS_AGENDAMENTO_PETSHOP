// Logo do SAIP: as duas folhas (símbolo) e, opcionalmente, o nome ao lado.
// O símbolo é desenhado aqui em SVG (mesmo traço de public/logo-saip-simbolo.svg
// e do src/app/icon.svg) para ficar nítido em qualquer tamanho e nos dois temas.

export function LogoSimbolo({ altura = 28, className, style }: { altura?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 380 250"
      height={altura}
      width={(altura * 380) / 250}
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="var(--logo-saip, #4343e0)">
        <path d="M14 6C100 5 150 25 185 70C215 110 225 150 212 200C208 220 206 232 202 241Q199 246 192 246C120 246 55 195 28 120C16 85 9 50 9 14Q9 6 14 6Z" />
        <path d="M366 62Q372 62 372 70C372 130 345 185 290 225C275 236 262 242 252 245Q246 247 244 240C238 215 236 185 245 155C258 108 300 72 360 62Z" />
      </g>
    </svg>
  )
}

export default function LogoSaip({ altura = 28, texto = true, sufixo }: { altura?: number; texto?: boolean; sufixo?: string }) {
  return (
    <span className="logo-saip" role="img" aria-label="SAIP">
      <LogoSimbolo altura={altura} />
      {texto && (
        <span className="logo-saip-texto" style={{ fontSize: altura * 0.62 }}>
          SAIP{sufixo ? <small> {sufixo}</small> : null}
        </span>
      )}
    </span>
  )
}
