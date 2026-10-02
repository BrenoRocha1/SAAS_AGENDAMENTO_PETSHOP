import { Alert, Platform } from 'react-native'

export interface BotaoDialogo {
  text: string
  style?: 'default' | 'cancel' | 'destructive'
  onPress?: () => void
}

export interface PedidoDialogo {
  titulo: string
  mensagem: string
  botoes: BotaoDialogo[]
}

// Quem desenha a pergunta no navegador (components/DialogoHost, montado
// na raiz do app).
let anfitriao: ((pedido: PedidoDialogo) => void) | null = null

export function registrarDialogo(fn: (pedido: PedidoDialogo) => void): () => void {
  anfitriao = fn
  return () => {
    if (anfitriao === fn) anfitriao = null
  }
}

// Pergunta de confirmação. No celular é o Alert nativo. No navegador
// (`npx expo start --web`) o Alert do React Native não faz nada, e a caixa
// do próprio navegador (window.confirm) não serve: navegador embutido
// costuma bloqueá-la e responder "não" sozinho — o botão parecia morto.
// Por isso, no navegador, a pergunta é desenhada pelo app.
export function dialogo(titulo: string, mensagem: string, botoes: BotaoDialogo[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(titulo, mensagem, botoes)
    return
  }
  if (anfitriao) {
    anfitriao({ titulo, mensagem, botoes })
    return
  }
  // Sem o anfitrião montado (não deveria acontecer): caixa do navegador.
  const acoes = botoes.filter(b => b.style !== 'cancel').reverse()
  const voltar = botoes.find(b => b.style === 'cancel')
  for (const acao of acoes) {
    const texto = acoes.length === 1 ? `${titulo}\n\n${mensagem}` : `${titulo}\n\n${mensagem}\n\nOK = ${acao.text}`
    if (window.confirm(texto)) {
      acao.onPress?.()
      return
    }
  }
  voltar?.onPress?.()
}
