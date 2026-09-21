import { StyleSheet, Text, View } from 'react-native'
import { coresStatus, rotuloStatus, type StatusAgendamento } from '@/lib/statusAgendamento'
import { colors, radius, spacing, typography } from '@/theme/theme'

// As 4 etapas do atendimento (Cancelado fica de fora: é desvio do fluxo,
// não uma etapa do dia). Mesma ordem do Kanban do dashboard web.
const ETAPAS: StatusAgendamento[] = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído']

export function ResumoStatus({ contagem }: { contagem: Record<string, number> }) {
  return (
    <View style={styles.row}>
      {ETAPAS.map(etapa => {
        const cor = coresStatus(etapa)
        return (
          <View key={etapa} style={styles.item}>
            <View style={[styles.ponto, { backgroundColor: cor.solid }]} />
            <Text style={styles.valor}>{contagem[etapa] ?? 0}</Text>
            <Text style={styles.label} numberOfLines={1}>
              {rotuloStatus(etapa)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  ponto: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  valor: { ...typography.heading.md, color: colors.text },
  label: { ...typography.body.sm, color: colors.textMuted, fontSize: 11 },
})
