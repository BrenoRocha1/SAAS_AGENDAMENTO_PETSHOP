import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'

type Tipo = 'erro' | 'sucesso' | 'info' | 'alerta'

const ESTILO: Record<Tipo, { fundo: string; texto: string; icone: keyof typeof Ionicons.glyphMap }> = {
  erro: { fundo: colors.dangerBg, texto: colors.dangerFg, icone: 'alert-circle' },
  sucesso: { fundo: colors.successBg, texto: colors.successFg, icone: 'checkmark-circle' },
  info: { fundo: colors.infoBg, texto: colors.infoFg, icone: 'information-circle' },
  alerta: { fundo: colors.warningBg, texto: colors.warningFg, icone: 'warning' },
}

// Faixa de mensagem (mesma ideia do .alert do web).
export function Aviso({ tipo = 'info', texto, style }: { tipo?: Tipo; texto: string; style?: StyleProp<ViewStyle> }) {
  const e = ESTILO[tipo]
  return (
    <View style={[styles.caixa, { backgroundColor: e.fundo }, style]} accessibilityRole={tipo === 'erro' ? 'alert' : undefined}>
      <IconeApp name={e.icone} size={17} color={e.texto} style={styles.icone} />
      <Text style={[styles.texto, { color: e.texto }]}>{texto}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  caixa: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
  icone: { marginTop: 1 },
  texto: { ...typography.body.md, flex: 1 },
})
