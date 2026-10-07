import { StyleSheet, View } from 'react-native'
import { IconStar } from '@/components/IconesDoSite'

// Cores das estrelas do site (`.estrela-cheia` e `.estrela-vazia`).
const COR_CHEIA = '#f59e0b'
const COR_VAZIA = '#d1d5db'

// Só exibição (avaliação já dada, média da loja...). `nota` pode ser
// fracionária (média 4,7): arredonda para o inteiro mais próximo para saber
// quantas estrelas pintar — o número exato aparece ao lado, em texto.
export function Estrelas({ nota, tamanho = 16 }: { nota: number; tamanho?: number }) {
  const cheias = Math.round(nota)
  return (
    <View style={styles.linha} accessibilityRole="image" accessibilityLabel={`${formatarMedia(nota)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(n => (
        <IconStar key={n} size={tamanho} cheio={n <= cheias} color={n <= cheias ? COR_CHEIA : COR_VAZIA} />
      ))}
    </View>
  )
}

// 4.666 → "4,7" (padrão brasileiro de exibição de nota).
export function formatarMedia(media: number) {
  return media.toFixed(1).replace('.', ',')
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', gap: 2 },
})
