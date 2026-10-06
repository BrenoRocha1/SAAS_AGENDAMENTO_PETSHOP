// Gera src/components/IconesDoSite.tsx a partir dos ícones do site
// (petshop-app/src/components/icons/index.tsx), para o app desenhar
// exatamente os mesmos. Rodar de novo sempre que um ícone mudar lá:
//
//   node scripts/gerar-icones.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const ORIGEM = path.join(aqui, '../../petshop-app/src/components/icons/index.tsx')
const DESTINO = path.join(aqui, '../src/components/IconesDoSite.tsx')

const fonte = fs.readFileSync(ORIGEM, 'utf8')
const TAGS = { path: 'Path', circle: 'Circle', rect: 'Rect' }
const blocos = [...fonte.matchAll(/export function (Icon\w+)\([^)]*\) \{\n\s*return \(\n\s*(<svg[^>]*>)\n([\s\S]*?)\n\s*<\/svg>\n\s*\)\n\}/g)]
if (blocos.length === 0) throw new Error('Nenhum ícone encontrado — o formato do arquivo do site mudou?')

const icones = blocos.map(([, nome, abre, miolo]) => {
  // Ícone inteiro preenchido (ex.: IconPlay): <svg {...base} fill="currentColor" stroke="none" {...props}>
  const cheio = /fill="currentColor"/.test(abre)
  const linhas = miolo.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^<(\w+)\s+(.*?)\s*\/>$/)
    if (!m || !TAGS[m[1]]) throw new Error(`${nome}: não sei converter "${l}"`)
    const atributos = m[2].replace(/fill="currentColor"/g, 'fill={props.color}')
    return `      <${TAGS[m[1]]} ${atributos} />`
  })
  return `export function ${nome}(props: IconeProps) {
  return (
    <Base {...props}${cheio ? ' cheio' : ''}>
${linhas.join('\n')}
    </Base>
  )
}`
})

const saida = `// ARQUIVO GERADO — não editar à mão. Vem de
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

${icones.join('\n\n')}
`
fs.writeFileSync(DESTINO, saida)
console.log(`${icones.length} ícones → ${path.relative(process.cwd(), DESTINO)}`)
