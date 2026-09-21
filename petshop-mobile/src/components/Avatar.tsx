import { Image, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/theme/theme'
import { iniciais } from '@/lib/format'

interface Props {
  nome: string
  fotoUrl?: string | null
  size?: number
}

// Iniciais coloridas quando não há foto — mesmo padrão do web
// (DonoContaCard/FuncCard: círculo índigo com as duas primeiras iniciais).
export function Avatar({ nome, fotoUrl, size = 44 }: Props) {
  const dimensao = { width: size, height: size, borderRadius: size / 2 }

  if (fotoUrl) {
    return <Image source={{ uri: fotoUrl }} style={[styles.img, dimensao]} />
  }

  return (
    <View style={[styles.fallback, dimensao]}>
      <Text style={[styles.iniciais, { fontSize: size * 0.36 }]}>{iniciais(nome)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  img: { backgroundColor: colors.surfaceMuted },
  fallback: { backgroundColor: colors.primary600, alignItems: 'center', justifyContent: 'center' },
  iniciais: { color: colors.white, fontWeight: '700' },
})
