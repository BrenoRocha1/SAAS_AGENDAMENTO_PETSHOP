import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { Card } from './Card'
import { Avatar } from './Avatar'
import { hojeBrasilISO } from '@/lib/agenda'
import { formatarReais, rotuloStatusCorrida, trechoAtual, emMovimento, type Corrida } from '@/lib/taxidog'
import { colors, radius, spacing, statusColors, typography } from '@/theme/theme'

// Cor da etapa, reaproveitando a paleta de status do atendimento.
export function corDaCorrida(c: Pick<Corrida, 'status' | 'status_agendamento'>) {
  const status = c.status
  if (status === 'cancelada') return statusColors.Cancelado
  if (status === 'agendada' && c.status_agendamento === 'Pendente') return statusColors.Pendente
  if (status === 'concluida' || status === 'pronto_entrega') return statusColors['Concluído']
  if (emMovimento(status)) return statusColors['Em andamento']
  if (status === 'entregue_loja') return statusColors.Pendente
  return statusColors.Confirmado
}

export function PillStatusCorrida({ corrida }: { corrida: Corrida }) {
  const cor = corDaCorrida(corrida)
  return (
    <View style={[styles.pill, { backgroundColor: cor.bg }]}>
      <Text style={[styles.pillTexto, { color: cor.fg }]}>
        {rotuloStatusCorrida({ status: corrida.status, modalidade: corrida.modalidade, temTaxiDog: !!corrida.id_funcionario, statusAgendamento: corrida.status_agendamento })}
      </Text>
    </View>
  )
}

// `rota` = número da rota ativa em que a corrida está (migration 053).
export function CorridaCard({ corrida: c, rota, onPress }: { corrida: Corrida; rota?: number; onPress: () => void }) {
  const verbo = trechoAtual(c) === 'busca' ? 'Buscar' : 'Entregar'
  const hoje = hojeBrasilISO()
  const dia = c.dt_agendamento === hoje ? null : c.dt_agendamento.split('-').reverse().slice(0, 2).join('/')

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.horaCol}>
        <Text style={styles.hora}>{c.hr_agendamento.slice(0, 5)}</Text>
        {dia && <Text style={styles.dia}>{dia}</Text>}
      </View>

      <View style={styles.divider} />

      <View style={styles.info}>
        <View style={styles.linhaPet}>
          <Avatar nome={c.pet_nome} fotoUrl={c.pet_foto_url} size={26} />
          <Text style={styles.titulo} numberOfLines={1}>
            {c.status === 'concluida' || c.status === 'cancelada' ? c.pet_nome : `${verbo} ${c.pet_nome}`}
          </Text>
        </View>
        <Text style={styles.linha} numberOfLines={1}>{c.cliente_nome}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={colors.textFaint} />
          <Text style={styles.meta} numberOfLines={1}>{c.logradouro}, {c.numero} · {c.bairro}</Text>
        </View>
        <View style={styles.rodape}>
          <View style={styles.pills}>
            <PillStatusCorrida corrida={c} />
            {rota != null && (
              <View style={[styles.pill, { backgroundColor: colors.primary50 }]}>
                <Text style={[styles.pillTexto, { color: colors.primary600 }]}>Rota #{rota}</Text>
              </View>
            )}
          </View>
          <Text style={styles.valor}>{formatarReais(c.valor)}</Text>
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  horaCol: { width: 48, alignItems: 'flex-start' },
  hora: { ...typography.heading.sm, color: colors.text },
  dia: { ...typography.body.sm, color: colors.textMuted },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  info: { flex: 1, gap: 3 },
  linhaPet: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titulo: { ...typography.body.lg, fontWeight: '700', color: colors.text, flexShrink: 1 },
  linha: { ...typography.body.sm, color: colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { ...typography.body.sm, color: colors.textMuted, flexShrink: 1 },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flexShrink: 1 },
  valor: { ...typography.label.md, color: colors.successFg },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  pillTexto: { fontSize: 11, fontWeight: '700' },
})
