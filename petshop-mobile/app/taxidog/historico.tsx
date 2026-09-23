import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { format, subDays } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { EmptyState } from '@/components/EmptyState'
import { CorridaCard } from '@/components/CorridaCard'
import { Card } from '@/components/Card'
import { useMinhasCorridas } from '@/hooks/useMinhasCorridas'
import { agoraBrasil, hojeBrasilISO } from '@/lib/agenda'
import { encerrada, formatarReais, type Corrida } from '@/lib/taxidog'
import { colors, spacing, typography } from '@/theme/theme'

const DIAS_PARA_TRAS = 30

export default function HistoricoScreen() {
  const router = useRouter()
  const desde = format(subDays(agoraBrasil(), DIAS_PARA_TRAS), 'yyyy-MM-dd')
  const { corridas, loading, erro, recarregar } = useMinhasCorridas(desde, hojeBrasilISO())

  const encerradas = useMemo(
    () => corridas.filter(c => encerrada(c.status)).sort((a, b) => (b.dt_agendamento + b.hr_agendamento).localeCompare(a.dt_agendamento + a.hr_agendamento)),
    [corridas]
  )
  const concluidas = encerradas.filter(c => c.status === 'concluida')
  const total = concluidas.reduce((soma, c) => soma + c.valor, 0)

  return (
    <ScreenContainer refreshing={loading} onRefresh={recarregar}>
      <Text style={styles.title}>Histórico</Text>
      <Text style={styles.subtitle}>Últimos {DIAS_PARA_TRAS} dias</Text>

      {concluidas.length > 0 && (
        <Card style={styles.resumo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumoValor}>{concluidas.length}</Text>
            <Text style={styles.resumoLabel}>corridas concluídas</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumoValor}>{formatarReais(total)}</Text>
            <Text style={styles.resumoLabel}>em corridas</Text>
          </View>
        </Card>
      )}

      {erro ? (
        <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
      ) : !loading && encerradas.length === 0 ? (
        <EmptyState icon="time-outline" title="Nenhuma corrida encerrada" subtitle="Suas corridas concluídas aparecem aqui." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {encerradas.map((c: Corrida) => (
            <CorridaCard key={c.id_corrida} corrida={c} onPress={() => router.push(`/taxidog/corrida/${c.id_corrida}` as never)} />
          ))}
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  title: { ...typography.heading.xl, color: colors.text },
  subtitle: { ...typography.body.lg, color: colors.textMuted, marginTop: 2, marginBottom: spacing.xl },
  resumo: { flexDirection: 'row', marginBottom: spacing.xl },
  resumoValor: { ...typography.heading.lg, color: colors.text },
  resumoLabel: { ...typography.body.sm, color: colors.textMuted },
})
