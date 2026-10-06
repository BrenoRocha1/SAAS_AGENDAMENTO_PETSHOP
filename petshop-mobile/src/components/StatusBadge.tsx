import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { radius } from '@/theme/theme'
import { coresStatus, rotuloStatus } from '@/lib/statusAgendamento'
import { Text } from '@/components/Texto'

// Selo de status — o `.badge` do site: letra de 12 em maiúsculas, 4×10 de
// respiro, cantos redondos e contorno fino na cor do status.
// `rotulo` troca o texto mantendo as cores do status (ex.: "Pago" no verde
// de Finalizado).
export function StatusBadge({ status, style, rotulo }: { status: string; style?: StyleProp<ViewStyle>; rotulo?: string }) {
  const cor = coresStatus(status)
  return (
    <View style={[styles.badge, { backgroundColor: cor.bg, borderColor: cor.ring }, style]}>
      <Text style={[styles.text, { color: cor.fg }]}>{rotulo ?? rotuloStatus(status)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.48 },
})
