import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { Card } from './Card'
import { StatusBadge } from './StatusBadge'
import { colors, spacing, typography } from '@/theme/theme'
import type { Agendamento } from '@/types/database'

// Linha de agendamento — horário em destaque à esquerda, dados do
// atendimento no meio, status à direita. Usada tanto no resumo da tela
// Início quanto na lista completa de Agendamentos.
export function AppointmentRow({ item }: { item: Agendamento }) {
  return (
    <Card style={styles.card}>
      <View style={styles.horaCol}>
        <Text style={styles.hora}>{item.hr_agendamento.slice(0, 5)}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.info}>
        <Text style={styles.pet} numberOfLines={1}>
          {item.pet?.nome ?? 'Pet'}
        </Text>
        <Text style={styles.linha} numberOfLines={1}>
          {item.cliente?.nome ?? '—'}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="cut-outline" size={13} color={colors.textFaint} />
          <Text style={styles.meta} numberOfLines={1}>
            {item.servico?.nome ?? 'Serviço'}
          </Text>
        </View>
        {item.funcionario?.nome && (
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={13} color={colors.textFaint} />
            <Text style={styles.meta} numberOfLines={1}>
              {item.funcionario.nome}
            </Text>
          </View>
        )}
      </View>

      <StatusBadge status={item.status} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  horaCol: { width: 48 },
  hora: { ...typography.heading.sm, color: colors.text },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  info: { flex: 1, gap: 2 },
  pet: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  linha: { ...typography.body.sm, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { ...typography.body.sm, color: colors.textMuted, flexShrink: 1 },
})
