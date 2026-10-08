import { Pressable, StyleSheet, View } from 'react-native'
import { IconChevronRight, IconPaw } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { formatarTelefone, iniciais } from '@/lib/format'
import { colors } from '@/theme/theme'
import type { ClienteLinha } from '@/types/database'

// Linha da lista de clientes — a `.cli-linha` do site no celular
// (petshop-app/src/components/lojista/clientes-lista.css): a lista é um
// bloco branco só, e cada cliente uma linha com o monograma, o nome, o
// telefone e, à direita, quantos pets tem e a seta. O traço entre as linhas
// começa depois do avatar. `primeiro`/`ultimo` fecham os cantos do bloco.
export function ClienteRow({ cliente, primeiro, ultimo, onPress }: {
  cliente: ClienteLinha
  primeiro?: boolean
  ultimo?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${cliente.nome}`}
      style={({ pressed }) => [styles.linha, primeiro && styles.primeira, ultimo && styles.ultima, pressed && styles.pressionada]}
    >
      {!primeiro && <View style={styles.traco} />}
      <View style={styles.avatar}>
        <Text style={styles.avatarTexto}>{iniciais(cliente.nome)}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={1}>{cliente.nome}</Text>
        <Text style={styles.telefone} numberOfLines={1}>{formatarTelefone(cliente.telefone)}</Text>
      </View>
      <View style={styles.pets}>
        <IconPaw size={14} color={colors.primary300} />
        <Text style={styles.petsTexto}>{cliente.qtd_pets}</Text>
      </View>
      <IconChevronRight size={16} color={colors.borderStrong} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  linha: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  primeira: { borderTopWidth: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  ultima: { borderBottomWidth: 1, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  pressionada: { backgroundColor: colors.bg },
  // 14 de respiro + 44 do avatar + 12 de vão: o traço começa no texto.
  traco: { position: 'absolute', top: 0, left: 70, right: 0, height: 1, backgroundColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary100 },
  avatarTexto: { fontSize: 14, lineHeight: 14, fontWeight: '700', letterSpacing: 0.28, color: colors.primary300 },
  info: { flex: 1 },
  nome: { fontSize: 16, lineHeight: 21.6, fontWeight: '600', letterSpacing: -0.16, color: colors.text },
  telefone: { fontSize: 14, lineHeight: 19.6, color: '#858d99' },
  pets: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  petsTexto: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.primary300 },
})
