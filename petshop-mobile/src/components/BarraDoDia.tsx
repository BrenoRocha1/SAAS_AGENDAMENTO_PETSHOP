import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { Text } from '@/components/Texto'
import { dataExtensaISO, somarDiasISO } from '@/lib/agenda'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Faixa do dia (`.tela-app-dia` do site no celular): setas para o dia
// anterior e o seguinte, a data por extenso no meio e, embaixo dela, "Hoje"
// ou o atalho para voltar a hoje. Usada na agenda e no Gestor de
// Agendamentos.
export function BarraDoDia({ data, hoje, onMudar, style }: {
  // Dia mostrado e o dia de hoje, em 'yyyy-MM-dd'.
  data: string
  hoje: string
  onMudar: (data: string) => void
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.barra, style]}>
      <Pressable onPress={() => onMudar(somarDiasISO(data, -1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dia anterior" style={styles.seta}>
        <IconeApp name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <View style={styles.meio}>
        <Text style={styles.dia} numberOfLines={1}>{dataExtensaISO(data)}</Text>
        {data === hoje ? (
          <Text style={styles.hoje}>Hoje</Text>
        ) : (
          <Pressable onPress={() => onMudar(hoje)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.voltarHoje}>Voltar para hoje</Text>
          </Pressable>
        )}
      </View>
      <Pressable onPress={() => onMudar(somarDiasISO(data, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Próximo dia" style={styles.seta}>
        <IconeApp name="chevron-forward" size={20} color={colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  seta: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  meio: { flex: 1, alignItems: 'center', gap: 2 },
  dia: { ...typography.heading.sm, lineHeight: 24, color: colors.text },
  // 0.78rem no site (12,48 de letra, 1,6 de entrelinha).
  hoje: { fontSize: 12.48, lineHeight: 19.97, color: colors.textMuted },
  voltarHoje: { fontSize: 12.48, lineHeight: 19.97, fontWeight: '600', color: colors.primary600 },
})
