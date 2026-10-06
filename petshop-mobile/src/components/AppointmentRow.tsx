import { IconeApp } from '@/components/IconeApp'
import { StyleSheet, View } from 'react-native'
import { Card } from './Card'
import { StatusBadge } from './StatusBadge'
import { Text } from '@/components/Texto'
import { colors, spacing, typography } from '@/theme/theme'
import type { Agendamento } from '@/types/database'

// Linha de agendamento — horário em destaque à esquerda, dados do
// atendimento no meio, status à direita. Usada tanto no resumo da tela
// Início quanto na lista completa de Agendamentos. Com `onPress`, abre o
// agendamento (aceitar, iniciar, remarcar…). `atrasado` avisa, embaixo do
// horário, que a hora passou e o atendimento ainda não começou.
export function AppointmentRow({ item, onPress, atrasado }: { item: Agendamento; onPress?: () => void; atrasado?: boolean }) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.horaCol}>
        <Text style={styles.hora}>{item.hr_agendamento.slice(0, 5)}</Text>
        {atrasado && <Text style={styles.atrasado}>atrasado</Text>}
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
          <IconeApp name="cut-outline" size={13} color={colors.textFaint} />
          <Text style={styles.meta} numberOfLines={1}>
            {item.servico?.nome ?? 'Serviço'}
          </Text>
        </View>
        {item.funcionario?.nome && (
          <View style={styles.metaRow}>
            <IconeApp name="person-outline" size={13} color={colors.textFaint} />
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
  atrasado: { fontSize: 10.5, fontWeight: '600', color: colors.dangerFg, marginTop: 1 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  info: { flex: 1, gap: 2 },
  pet: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  linha: { ...typography.body.sm, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { ...typography.body.sm, color: colors.textMuted, flexShrink: 1 },
})
