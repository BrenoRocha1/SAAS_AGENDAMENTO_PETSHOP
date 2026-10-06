import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { Text } from '@/components/Texto'

interface Props {
  slots: { hr_slot: string; disponivel: boolean }[]
  carregando: boolean
  valor: string
  onChange: (hhmm: string) => void
  // Texto quando o dia não tem nenhum horário (loja fechada, feriado…).
  vazio?: string
}

// Horários do dia em grade — os ocupados aparecem riscados (dá pra ver
// que existem, mas não escolher), igual ao painel web.
export function GradeHorarios({ slots, carregando, valor, onChange, vazio = 'Nenhum horário neste dia.' }: Props) {
  if (carregando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.primary600} />
      </View>
    )
  }
  if (slots.length === 0) return <Text style={styles.vazio}>{vazio}</Text>

  return (
    <View style={styles.grade}>
      {slots.map(s => {
        const hora = s.hr_slot.slice(0, 5)
        const ativo = hora === valor
        return (
          <Pressable
            key={s.hr_slot}
            disabled={!s.disponivel}
            onPress={() => onChange(hora)}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo, disabled: !s.disponivel }}
            accessibilityLabel={s.disponivel ? hora : `${hora}, ocupado`}
            style={[styles.slot, ativo && styles.slotAtivo, !s.disponivel && styles.slotOcupado]}
          >
            <Text style={[styles.hora, ativo && styles.horaAtiva, !s.disponivel && styles.horaOcupada]}>{hora}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  centro: { paddingVertical: spacing.xl, alignItems: 'center' },
  vazio: { ...typography.body.md, color: colors.textMuted, paddingVertical: spacing.md },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minWidth: 68,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  slotAtivo: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  slotOcupado: { backgroundColor: colors.surfaceMuted },
  hora: { ...typography.label.md, color: colors.text },
  horaAtiva: { color: colors.white },
  horaOcupada: { color: colors.textFaint, textDecorationLine: 'line-through' },
})
