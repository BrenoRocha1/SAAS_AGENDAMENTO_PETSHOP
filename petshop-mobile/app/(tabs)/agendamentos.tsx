import { FlatList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppointmentRow } from '@/components/AppointmentRow'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { useAuth } from '@/contexts/AuthContext'
import { useAgendamentosHoje } from '@/hooks/useAgendamentosHoje'
import { dataExtensaBrasil } from '@/lib/agenda'
import { colors, spacing, typography } from '@/theme/theme'

export default function AgendamentosScreen() {
  const { contexto } = useAuth()
  const { agendamentos, loading, erro, recarregar } = useAgendamentosHoje(contexto?.idLojista)

  if (!contexto?.podeGerenciarAgenda) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Agendamentos</Text>
        </View>
        <SemPermissao area="ver a agenda" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Agendamentos</Text>
        <Text style={styles.subtitle}>{dataExtensaBrasil()}</Text>
      </View>

      <FlatList
        data={agendamentos}
        keyExtractor={item => item.id_agendamento}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <AppointmentRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshing={loading}
        onRefresh={recarregar}
        ListEmptyComponent={
          erro ? (
            <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Nenhum agendamento hoje"
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
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { ...typography.heading.xl, color: colors.text },
  subtitle: { ...typography.body.lg, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], flexGrow: 1 },
})
