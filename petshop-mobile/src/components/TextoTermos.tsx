import { Linking, type GestureResponderEvent, type StyleProp, type TextStyle } from 'react-native'
import { Text } from '@/components/Texto'
import { urlDoSite } from '@/lib/site'
import { colors } from '@/theme/theme'

// "Li e aceito os Termos de Uso e a Política de Privacidade", com os dois
// nomes abrindo as páginas do site (/termos e /privacidade). Fica dentro da
// caixa de aceite: tocar no link não marca nem desmarca a caixa.
export function TextoTermos({ style }: { style?: StyleProp<TextStyle> }) {
  function abrir(caminho: string) {
    return (e: GestureResponderEvent) => {
      e?.stopPropagation?.()
      const url = urlDoSite(caminho)
      if (url) Linking.openURL(url).catch(() => null)
    }
  }
  return (
    <Text style={style}>
      Li e aceito os{' '}
      <Text style={{ color: colors.primary600, fontWeight: '600' }} onPress={abrir('/termos')} accessibilityRole="link">Termos de Uso</Text>
      {' '}e a{' '}
      <Text style={{ color: colors.primary600, fontWeight: '600' }} onPress={abrir('/privacidade')} accessibilityRole="link">Política de Privacidade</Text>
    </Text>
  )
}
