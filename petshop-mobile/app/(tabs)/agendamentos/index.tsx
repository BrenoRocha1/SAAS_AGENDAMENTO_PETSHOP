import { useCallback, useState, useMemo } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarraDoDia } from '@/components/BarraDoDia'
import { BarraTopo } from '@/components/BarraTopo'
import { AppointmentRow } from '@/components/AppointmentRow'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { useAgendamentosDoDia } from '@/hooks/useAgendamentosHoje'
import { hojeBrasilISO } from '@/lib/agenda'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function AgendamentosScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const hoje = hojeBrasilISO()
  const [data, setData] = useState(hoje)
  const { agendamentos: doDia, loading, erro, recarregar } = useAgendamentosDoDia(contexto?.idLojista, data)
  // Cancelado não aparece na agenda — como no site, que nem busca esses
  // (o histórico do cliente e os relatórios continuam mostrando).
  const agendamentos = useMemo(() => doDia.filter(a => a.status !== 'Cancelado'), [doDia])

  // Voltando de um agendamento (aceito, remarcado, cancelado…), a lista
  // já aparece atualizada mesmo se o aviso ao vivo não chegar.
  useFocusEffect(useCallback(() => { recarregar() }, [recarregar]))

  if (!contexto?.podeGerenciarAgenda) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BarraTopo />
        <View style={styles.header}>
          <Text style={styles.title}>Agenda</Text>
        </View>
        <SemPermissao area="ver a agenda" />
      </SafeAreaView>
    )
  }

  const ehHoje = data === hoje

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BarraTopo />
      <View style={styles.header}>
        <View style={styles.tituloLinha}>
          <Text style={styles.title}>Agenda</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/agendamentos/novo', params: { data } })}
            accessibilityRole="button"
            accessibilityLabel="Novo agendamento"
            style={({ pressed }) => [styles.novo, pressed && styles.pressionado]}
          >
            <IconeApp name="add" size={18} color={colors.white} />
            <Text style={styles.novoTexto}>Novo</Text>
          </Pressable>
        </View>

        <BarraDoDia data={data} hoje={hoje} onMudar={setData} />
      </View>

      <FlatList
        data={agendamentos}
        keyExtractor={item => item.id_agendamento}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <AppointmentRow item={item} onPress={() => router.push(`/agendamentos/${item.id_agendamento}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshing={loading}
        onRefresh={recarregar}
        ListEmptyComponent={
          loading ? null : erro ? (
            <EmptyState icon="alert-circle-outline" ilustracao="erro" title="Não foi possível carregar" subtitle={erro} />
          ) : (
            <EmptyState
              icon="calendar-outline"
              ilustracao="agendar"
              title={ehHoje ? 'Nenhum agendamento hoje' : 'Nenhum agendamento neste dia'}
              subtitle="Os agendamentos do dia aparecem aqui, organizados por horário."
            />
          )
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  // 16 em cima e embaixo, 12 entre o título e o que vem depois — as medidas
  // da tela do site no celular (.app-content, .tela-app-titulo, .tela-app-busca).
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { ...typography.heading.xl, color: colors.text, flexShrink: 1 },
  novo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary600,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  novoTexto: { ...typography.label.md, color: colors.white },
  pressionado: { opacity: 0.8 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], flexGrow: 1 },
})
