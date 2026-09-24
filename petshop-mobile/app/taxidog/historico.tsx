import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { format, subDays } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { EmptyState } from '@/components/EmptyState'
import { RotaCard } from '@/components/RotaCard'
import { Card } from '@/components/Card'
import { useMinhasRotas } from '@/hooks/useMinhasRotas'
import { agoraBrasil, hojeBrasilISO } from '@/lib/agenda'
import { contarPets, type Rota } from '@/lib/taxidog-rotas'
import { colors, spacing, typography } from '@/theme/theme'

const DIAS_PARA_TRAS = 30

export default function HistoricoScreen() {
  const router = useRouter()
  const desde = format(subDays(agoraBrasil(), DIAS_PARA_TRAS), 'yyyy-MM-dd')
  const { rotas, loading, erro, recarregar } = useMinhasRotas(desde, hojeBrasilISO())

  const concluidas = useMemo(
    () => rotas.filter(r => r.status === 'concluida').sort((a, b) => b.data.localeCompare(a.data) || b.numero - a.numero),
    [rotas]
  )
  const pets = concluidas.reduce((soma, r) => soma + contarPets(r), 0)
  const km = concluidas.reduce((soma, r) => soma + (r.calculo_versao === r.versao ? (r.distancia_m ?? 0) : 0), 0) / 1000

  return (
    <ScreenContainer refreshing={loading} onRefresh={recarregar}>
      <Text style={styles.title}>Histórico</Text>
      <Text style={styles.subtitle}>Últimos {DIAS_PARA_TRAS} dias</Text>

      {concluidas.length > 0 && (
        <Card style={styles.resumo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumoValor}>{concluidas.length}</Text>
            <Text style={styles.resumoLabel}>{concluidas.length === 1 ? 'rota concluída' : 'rotas concluídas'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumoValor}>{pets}</Text>
            <Text style={styles.resumoLabel}>pets transportados</Text>
          </View>
          {km > 0 && (
            <View style={{ flex: 1 }}>
              <Text style={styles.resumoValor}>{km.toFixed(1).replace('.', ',')} km</Text>
              <Text style={styles.resumoLabel}>percorridos</Text>
            </View>
          )}
        </Card>
      )}

      {erro ? (
        <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
      ) : !loading && concluidas.length === 0 ? (
        <EmptyState icon="time-outline" title="Nenhuma rota concluída" subtitle="Suas rotas concluídas aparecem aqui." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {concluidas.map((r: Rota) => (
            <RotaCard key={r.id_rota} rota={r} onPress={() => router.push(`/taxidog/rota/${r.id_rota}` as never)} />
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
