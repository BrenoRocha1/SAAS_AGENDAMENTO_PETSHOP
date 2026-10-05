import { Image, type ImageStyle, type StyleProp } from 'react-native'

// Ilustrações do app, do unDraw (undraw.co — uso livre, sem crédito), já na
// cor da marca. Entram só onde a tela está vazia ou é uma porta de entrada
// (login, código, cadastro); nunca no meio de uma lista com conteúdo.
//
// São PNGs gerados a partir dos SVGs de assets/ilustracoes/svg — o app não
// tem biblioteca de SVG. Um arquivo só por desenho, grande (cabe em
// 720×540, o triplo do tamanho em tela): fica nítido em qualquer densidade
// e pesa uns 15 KB. Para trocar ou acrescentar uma: salvar o SVG ali com o
// roxo do unDraw (#6c63ff) trocado por #4f46e5, sem texto dentro do desenho,
// e exportar o PNG com fundo transparente nesse tamanho.
const FONTES = {
  erro: require('../../assets/ilustracoes/erro.png'),
  'nao-encontrado': require('../../assets/ilustracoes/nao-encontrado.png'),
  agendar: require('../../assets/ilustracoes/agendar.png'),
  login: require('../../assets/ilustracoes/login.png'),
  codigo: require('../../assets/ilustracoes/codigo.png'),
  'boas-vindas': require('../../assets/ilustracoes/boas-vindas.png'),
} as const

export type NomeIlustracao = keyof typeof FONTES

interface Props {
  nome: NomeIlustracao
  altura?: number
  style?: StyleProp<ImageStyle>
}

// Decorativa: o leitor de tela pula (o texto da tela já diz o que importa).
export function Ilustracao({ nome, altura = 140, style }: Props) {
  return (
    <Image
      source={FONTES[nome]}
      resizeMode="contain"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: '100%', height: altura, alignSelf: 'center' }, style]}
    />
  )
}
