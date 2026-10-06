import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { format, subDays } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { RotaCard } from '@/components/RotaCard'
import { Text } from '@/components/Texto'
import { useMinhasRotas } from '@/hooks/useMinhasRotas'
import { agoraBrasil, hojeBrasilISO } from '@/lib/agenda'
import type { Rota } from '@/lib/taxidog-rotas'
import { colors, spacing, typography } from '@/theme/theme'

// O TaxiDog vê só as rotas de hoje — as dos dias seguintes não aparecem.
// A exceção é a que ficou em andamento de um dia anterior: não pode sumir
// da lista, senão ele não tem como terminar.
const DIAS_PARA_TRAS = 7

export default function RotasScreen() {
  const router = useRouter()
  const hoje = hojeBrasilISO()
  const desde = format(subDays(agoraBrasil(), DIAS_PARA_TRAS), 'yyyy-MM-dd')
  const { rotas: todas, loading, erro, recarregar } = useMinhasRotas(desde, hoje)
  // Garante de novo aqui: nada com data depois de hoje.
  const rotas = useMemo(() => todas.filter(r => r.data <= hoje), [todas, hoje])

  const secoes = useMemo(() => {
    const abertas = rotas.filter(r => r.status !== 'cancelada' && r.status !== 'concluida')
    return [
      { titulo: 'Em andamento', itens: abertas.filter(r => r.status === 'em_andamento') },
      { titulo: 'Aguardando aprovação', itens: abertas.filter(r => r.status === 'aguardando_aprovacao') },
      { titulo: 'Hoje', itens: abertas.filter(r => r.status !== 'em_andamento' && r.status !== 'aguardando_aprovacao') },
      { titulo: 'Concluídas hoje', itens: rotas.filter(r => r.status === 'concluida' && r.data === hoje) },
    ].filter(s => s.itens.length > 0)
  }, [rotas, hoje])

  const abrir = (r: Rota) => router.push(`/taxidog/rota/${r.id_rota}` as never)

  return (
    <ScreenContainer refreshing={loading} onRefresh={recarregar} topo={<BarraTopo />}>
      <Text style={styles.title}>Rotas</Text>
      <Text style={styles.subtitle}>Só as de hoje</Text>

      <Pressable style={styles.montar} onPress={() => router.push('/taxidog/montar-rota' as never)}>
        <IconeApp name="add-circle" size={20} color={colors.white} />
        <Text style={styles.montarTexto}>Montar rota</Text>
      </Pressable>

      {erro ? (
        <EmptyState icon="alert-circle-outline" ilustracao="erro" title="Não foi possível carregar" subtitle={erro} />
      ) : !loading && secoes.length === 0 ? (
        <EmptyState
          icon="map-outline"
          ilustracao="taxidog"
          title="Nenhuma rota por enquanto"
          subtitle="Monte uma rota com as corridas do dia, ou espere a loja montar uma para você."
        />
      ) : (
        secoes.map(secao => (
          <View key={secao.titulo} style={styles.secao}>
            <SectionHeader title={`${secao.titulo} (${secao.itens.length})`} />
            <View style={{ gap: spacing.md }}>
              {secao.itens.map(r => <RotaCard key={r.id_rota} rota={r} onPress={() => abrir(r)} />)}
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
  montar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary600,
    borderRadius: 12,
    paddingVertical: spacing.md,
    marginBottom: spacing.xl,
  },
  montarTexto: { ...typography.heading.sm, color: colors.white },
})
