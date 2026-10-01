import { Alert, Platform } from 'react-native'

export interface BotaoDialogo {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

// Pergunta de confirmação. No celular é o Alert nativo; no navegador
// (`npx expo start --web`) o Alert do React Native não faz nada, então
// cai no confirm do próprio navegador — que só tem OK/Cancelar: com mais
// de uma ação, pergunta uma de cada vez, da principal (a última) para a
// primeira.
export function dialogo(titulo: string, mensagem: string, botoes: BotaoDialogo[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(titulo, mensagem, botoes)
    return
  }
  const acoes = botoes.filter(b => b.style !== 'cancel').reverse()
  const voltar = botoes.find(b => b.style === 'cancel')
  if (acoes.length === 0) {
    window.alert(`${titulo}\n\n${mensagem}`)
    voltar?.onPress?.()
    return
  }
  for (const acao of acoes) {
    const texto = acoes.length === 1 ? `${titulo}\n\n${mensagem}` : `${titulo}\n\n${mensagem}\n\nOK = ${acao.text}`
    if (window.confirm(texto)) {
      acao.onPress?.()
      return
    }
  }
  voltar?.onPress?.()
}
