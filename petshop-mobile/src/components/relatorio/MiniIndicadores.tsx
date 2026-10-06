import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/Texto'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'
import { COR_APAGADA } from './Secao'

export type Tom = 'padrao' | 'sucesso' | 'alerta' | 'perigo'

const COR_DO_TOM: Record<Tom, string> = {
  padrao: colors.text,
  sucesso: colors.successFg,
  alerta: colors.warningFg,
  perigo: colors.dangerFg,
}

// Números de apoio de uma seção (ex.: registrado, recebido, a receber) —
// no celular, um embaixo do outro.
export function MiniIndicadores({ itens }: { itens: { rotulo: string; valor: string | number; tom?: Tom }[] }) {
  return (
    <View style={styles.lista}>
      {itens.map((item, i) => (
        <View key={i} style={styles.quadro}>
          <Text style={[styles.valor, { color: COR_DO_TOM[item.tom ?? 'padrao'] }]}>{item.valor}</Text>
          <Text style={styles.rotulo}>{item.rotulo}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  lista: { gap: 12 },
  quadro: { gap: 2, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  valor: { fontFamily: FONTE_TITULO, fontSize: 18, lineHeight: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rotulo: { fontSize: 12, lineHeight: 16.5, color: COR_APAGADA },
})
