import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BarraTopo } from '@/components/BarraTopo'
import { AppointmentRow } from '@/components/AppointmentRow'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { useAuth } from '@/contexts/AuthContext'
import { useAgendamentosDoDia } from '@/hooks/useAgendamentosHoje'
import { dataExtensaISO, hojeBrasilISO, somarDiasISO } from '@/lib/agenda'
import { colors, radius, spacing, typography } from '@/theme/theme'

export default function AgendamentosScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const hoje = hojeBrasilISO()
  const [data, setData] = useState(hoje)
  const { agendamentos, loading, erro, recarregar } = useAgendamentosDoDia(contexto?.idLojista, data)

  // Voltando de um agendamento (aceito, remarcado, cancelado…), a lista
  // já aparece atualizada mesmo se o aviso ao vivo não chegar.
  useFocusEffect(useCallback(() => { recarregar() }, [recarregar]))

  if (!contexto?.podeGerenciarAgenda) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BarraTopo />
        <View style={styles.header}>
          <Text style={styles.title}>Agendamentos</Text>
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
          <Text style={styles.title}>Agendamentos</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/agendamentos/novo', params: { data } })}
            accessibilityRole="button"
            accessibilityLabel="Novo agendamento"
            style={({ pressed }) => [styles.novo, pressed && styles.pressionado]}
          >
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.novoTexto}>Novo</Text>
          </Pressable>
        </View>

        <View style={styles.navDia}>
          <Pressable
            onPress={() => setData(d => somarDiasISO(d, -1))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dia anterior"
            style={styles.seta}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.diaTexto}>
            <Text style={styles.dia} numberOfLines={1}>{dataExtensaISO(data)}</Text>
            {ehHoje ? (
              <Text style={styles.hoje}>Hoje</Text>
            ) : (
              <Pressable onPress={() => setData(hoje)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.voltarHoje}>Voltar para hoje</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setData(d => somarDiasISO(d, 1))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Próximo dia"
            style={styles.seta}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>
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
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
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
  navDia: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  seta: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  diaTexto: { flex: 1, alignItems: 'center', gap: 2 },
  dia: { ...typography.heading.sm, color: colors.text },
  hoje: { ...typography.body.sm, color: colors.textMuted },
  voltarHoje: { ...typography.label.md, color: colors.primary600 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'], flexGrow: 1 },
})
