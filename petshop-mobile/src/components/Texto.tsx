import { createContext, useContext, type Ref } from 'react'
import {
  StyleSheet,
  Text as TextoRN,
  TextInput as CampoRN,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native'
import { FONTE_TITULO, arquivoDaFonte } from '@/theme/fontes'

// Text e TextInput do app: os do React Native, já na fonte do site (Inter;
// Plus Jakarta Sans quando o estilo pede `fontFamily: FONTE_TITULO`). As
// telas importam daqui em vez de 'react-native' e continuam escrevendo
// `fontWeight` normalmente — aqui ele vira o arquivo do peso certo.
//
// O texto também nasce com a altura de linha do site: lá o `body` tem
// `line-height: 1.6` e tudo herda, a não ser que a regra diga outra coisa.
// Aqui é igual — sem `lineHeight` no estilo, vale 1,6 × o tamanho da letra.
const ALTURA_DE_LINHA = 1.6
const TAMANHO_PADRAO = 14

// Fonte do texto de fora, pra o texto de dentro herdar (`SA<Text>IP</Text>`).
const FonteDeFora = createContext<string | null>(null)

function fonteDoEstilo(estilo: TextStyle, deFora: string | null): { base: string; estilo: TextStyle | null } {
  const pedida = estilo.fontFamily
  // Fonte que não é nossa (ícones, monoespaçada): não mexe.
  if (pedida && pedida !== FONTE_TITULO) return { base: deFora ?? 'Inter', estilo: null }
  const base = pedida ?? deFora ?? 'Inter'
  // Texto dentro de texto, sem peso nem fonte próprios: herda tudo de fora.
  if (deFora && !pedida && estilo.fontWeight == null) return { base, estilo: null }
  return { base, estilo: { fontFamily: arquivoDaFonte(base, estilo.fontWeight), fontWeight: 'normal' } }
}

export function Text({ style, ...resto }: TextProps & { ref?: Ref<TextoRN> }) {
  const deFora = useContext(FonteDeFora)
  const plano = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const { base, estilo } = fonteDoEstilo(plano, deFora)
  // Texto dentro de texto fica na linha do de fora.
  const linha = deFora || plano.lineHeight != null ? null : { lineHeight: (plano.fontSize ?? TAMANHO_PADRAO) * ALTURA_DE_LINHA }
  return (
    <FonteDeFora.Provider value={base}>
      <TextoRN {...resto} style={[style, estilo, linha]} />
    </FonteDeFora.Provider>
  )
}

export function TextInput({ style, ...resto }: TextInputProps & { ref?: Ref<CampoRN> }) {
  const { estilo } = fonteDoEstilo((StyleSheet.flatten(style) ?? {}) as TextStyle, null)
  // Campo de uma linha fica sem altura de linha: com ela, o texto sai do
  // centro da caixa no celular.
  const semLinha = resto.multiline ? null : { lineHeight: undefined }
  return <CampoRN {...resto} style={[style, estilo, semLinha]} />
}

// Quem tipa uma referência (`useRef<TextInput>`) continua podendo.
export type Text = TextoRN
export type TextInput = CampoRN
