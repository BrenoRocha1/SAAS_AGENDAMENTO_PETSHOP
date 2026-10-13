import { StyleSheet, View } from 'react-native'
import { coresStatus, rotuloStatus, type StatusAgendamento } from '@/lib/statusAgendamento'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { Text } from '@/components/Texto'

// As 4 etapas do atendimento (Cancelado fica de fora: é desvio do fluxo,
// não uma etapa do dia). Mesma ordem do Kanban do dashboard web.
const ETAPAS: StatusAgendamento[] = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído']

// Uma barra só, dividida proporcionalmente por status, com a legenda
// embaixo — igual ao resumo do dia no site.
export function ResumoStatus({ contagem }: { contagem: Record<string, number> }) {
  return (
    <View style={styles.cartao}>
      <View style={styles.barra}>
        {ETAPAS.map(etapa => {
          const n = contagem[etapa] ?? 0
          if (n === 0) return null
          return <View key={etapa} style={{ flex: n, backgroundColor: coresStatus(etapa).solid }} />
        })}
      </View>
      <View style={styles.legenda}>
        {ETAPAS.map(etapa => (
          <View key={etapa} style={styles.item}>
            <View style={[styles.ponto, { backgroundColor: coresStatus(etapa).solid }]} />
            <Text style={styles.valor}>{contagem[etapa] ?? 0}</Text>
            <Text style={styles.label} numberOfLines={1}>
              {rotuloStatus(etapa)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cartao: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, gap: spacing.md,
  },
  barra: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  legenda: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  ponto: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  valor: { ...typography.heading.md, color: colors.text },
  label: { fontSize: 11, lineHeight: 17.6, color: colors.textMuted },
})
