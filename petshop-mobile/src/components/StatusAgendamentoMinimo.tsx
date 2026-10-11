import { StyleSheet, View } from 'react-native'
import { coresStatus, rotuloStatus } from '@/lib/statusAgendamento'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'

// Selo de status das telas do cliente (Início, Agendamentos) — só um
// ponto colorido + texto, sem a caixa/maiúsculas do StatusBadge, que é
// do lojista e fica discreto demais chamativo pro gosto do cliente.
export function StatusAgendamentoMinimo({ status }: { status: string }) {
  const cor = coresStatus(status)
  return (
    <View style={styles.linha}>
      <View style={[styles.ponto, { backgroundColor: cor.solid }]} />
      <Text style={styles.texto}>{rotuloStatus(status)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  texto: { fontSize: 13, fontWeight: '600', color: colors.textDim },
})
