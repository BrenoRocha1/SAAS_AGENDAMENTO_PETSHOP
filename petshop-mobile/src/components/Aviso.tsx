import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { Text } from '@/components/Texto'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'

type Tipo = 'erro' | 'sucesso' | 'info' | 'alerta'

const ESTILO: Record<Tipo, { fundo: string; texto: string; icone: keyof typeof Ionicons.glyphMap }> = {
  // Fundos do `.alert-*` do site: a cor do status a 10%.
  erro: { fundo: 'rgba(239,68,68,0.1)', texto: colors.dangerFg, icone: 'alert-circle' },
  sucesso: { fundo: 'rgba(16,185,129,0.1)', texto: colors.successFg, icone: 'checkmark-circle' },
  info: { fundo: 'rgba(59,130,246,0.1)', texto: colors.infoFg, icone: 'information-circle' },
  alerta: { fundo: 'rgba(245,158,11,0.1)', texto: colors.warningFg, icone: 'warning' },
}

// Faixa de mensagem (mesma ideia do .alert do web).
export function Aviso({ tipo = 'info', texto, style }: { tipo?: Tipo; texto: string; style?: StyleProp<ViewStyle> }) {
  const e = ESTILO[tipo]
  return (
    <View style={[styles.caixa, { backgroundColor: e.fundo }, style]} accessibilityRole={tipo === 'erro' ? 'alert' : undefined}>
      <IconeApp name={e.icone} size={16} color={e.texto} style={styles.icone} />
      <Text style={[styles.texto, { color: e.texto }]}>{texto}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  caixa: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  icone: { marginTop: 2 },
  texto: { ...typography.body.md, flex: 1 },
})
