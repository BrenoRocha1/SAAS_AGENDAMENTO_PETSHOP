import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { format, addDays, subDays } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { CorridaCard } from '@/components/CorridaCard'
import { useMinhasCorridas } from '@/hooks/useMinhasCorridas'
import { agoraBrasil, hojeBrasilISO } from '@/lib/agenda'
import { emMovimento, encerrada, type Corrida } from '@/lib/taxidog'
import { colors, spacing, typography } from '@/theme/theme'

const DIAS_A_FRENTE = 7
// Corrida que ficou aberta de um dia anterior (ex.: pronto para entrega à
// noite) não pode sumir da lista — senão o TaxiDog não tem como encerrar.
const DIAS_PARA_TRAS = 7

export default function CorridasScreen() {
  const router = useRouter()
  const hoje = hojeBrasilISO()
  const desde = format(subDays(agoraBrasil(), DIAS_PARA_TRAS), 'yyyy-MM-dd')
  const ate = format(addDays(agoraBrasil(), DIAS_A_FRENTE), 'yyyy-MM-dd')
  const { corridas, loading, erro, recarregar } = useMinhasCorridas(desde, ate)

  const secoes = useMemo(() => {
    const ativas = corridas.filter(c => !encerrada(c.status))
    const naRua = ativas.filter(c => emMovimento(c.status))
    const prontas = ativas.filter(c => c.status === 'pronto_entrega')
    const resto = ativas.filter(c => !emMovimento(c.status) && c.status !== 'pronto_entrega')
    return [
      { titulo: 'Na rua agora', itens: naRua },
      { titulo: 'Prontos para entrega', itens: prontas },
      { titulo: 'Dias anteriores', itens: resto.filter(c => c.dt_agendamento < hoje) },
      { titulo: 'Hoje', itens: resto.filter(c => c.dt_agendamento === hoje) },
      { titulo: 'Próximos dias', itens: resto.filter(c => c.dt_agendamento > hoje) },
    ].filter(s => s.itens.length > 0)
  }, [corridas, hoje])

  const abrir = (c: Corrida) => router.push(`/taxidog/corrida/${c.id_corrida}` as never)

  return (
    <ScreenContainer refreshing={loading} onRefresh={recarregar}>
      <Text style={styles.title}>Corridas</Text>
      <Text style={styles.subtitle}>Hoje e os próximos {DIAS_A_FRENTE} dias</Text>

      {erro ? (
        <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
      ) : !loading && secoes.length === 0 ? (
        <EmptyState
          icon="car-outline"
          title="Nenhuma corrida por enquanto"
          subtitle="Quando a loja atribuir uma corrida a você, ela aparece aqui e você recebe um aviso."
        />
      ) : (
        secoes.map(secao => (
          <View key={secao.titulo} style={styles.secao}>
            <SectionHeader title={`${secao.titulo} (${secao.itens.length})`} />
            <View style={{ gap: spacing.md }}>
              {secao.itens.map(c => <CorridaCard key={c.id_corrida} corrida={c} onPress={() => abrir(c)} />)}
            </View>
          </View>
        ))
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  title: { ...typography.heading.xl, color: colors.text },
  subtitle: { ...typography.body.lg, color: colors.textMuted, marginTop: 2, marginBottom: spacing.xl },
  secao: { marginBottom: spacing['2xl'] },
})
