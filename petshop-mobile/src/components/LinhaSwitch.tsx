import { StyleSheet, Switch, Text, View } from 'react-native'
import { colors, spacing, typography } from '@/theme/theme'

interface Props {
  titulo: string
  detalhe?: string
  valor: boolean
  onChange: (v: boolean) => void
  desativado?: boolean
}

// Linha "rótulo + liga/desliga" dos formulários e das configurações.
export function LinhaSwitch({ titulo, detalhe, valor, onChange, desativado }: Props) {
  return (
    <View style={styles.linha}>
      <View style={styles.textos}>
        <Text style={[styles.titulo, desativado && styles.apagado]}>{titulo}</Text>
        {detalhe ? <Text style={styles.detalhe}>{detalhe}</Text> : null}
      </View>
      <Switch
        value={valor}
        onValueChange={onChange}
        disabled={desativado}
        trackColor={{ true: colors.primary500, false: colors.borderStrong }}
        thumbColor={colors.white}
        accessibilityLabel={titulo}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  textos: { flex: 1, gap: 2 },
  titulo: { ...typography.body.lg, fontWeight: '600', color: colors.text },
  apagado: { color: colors.textMuted },
  detalhe: { ...typography.body.md, color: colors.textMuted },
})
