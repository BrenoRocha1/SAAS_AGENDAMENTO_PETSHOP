import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { StatCard } from '@/components/StatCard'
import { SectionHeader } from '@/components/SectionHeader'
import { AppointmentRow } from '@/components/AppointmentRow'
import { ResumoStatus } from '@/components/ResumoStatus'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { useAuth } from '@/contexts/AuthContext'
import { useAgendamentosHoje } from '@/hooks/useAgendamentosHoje'
import { dataExtensaBrasil, saudacao, agoraBrasilHHMM } from '@/lib/agenda'
import { ehEtapaAtiva } from '@/lib/statusAgendamento'
import { colors, spacing, typography } from '@/theme/theme'

const MAX_PROXIMOS = 4

export default function InicioScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const { agendamentos, loading, erro, recarregar } = useAgendamentosHoje(contexto?.idLojista)

  const resumo = useMemo(() => {
    const agora = agoraBrasilHHMM()
    const naLoja = agendamentos.filter(a => a.status === 'Em andamento').length
    const proximos = agendamentos
      .filter(a => ehEtapaAtiva(a.status) && a.hr_agendamento.slice(0, 5) >= agora)
      .slice(0, MAX_PROXIMOS)
    const porStatus = agendamentos.reduce<Record<string, number>>((acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1
      return acc
    }, {})
    return { total: agendamentos.length, naLoja, proximos, porStatus }
  }, [agendamentos])

  return (
    <ScreenContainer refreshing={loading} onRefresh={recarregar}>
      <View style={styles.header}>
        <Text style={styles.saudacao}>
          {saudacao()}, {contexto?.nome ?? ''}
        </Text>
        <Text style={styles.data}>{dataExtensaBrasil()}</Text>
      </View>

      {!contexto?.podeGerenciarAgenda ? (
        <SemPermissao area="ver a agenda" />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon="calendar-outline" value={resumo.total} label="Agendamentos hoje" />
            <StatCard icon="paw-outline" value={resumo.naLoja} label="Pets na loja agora" tint={colors.accent600} />
          </View>

          <View style={styles.resumoWrap}>
            <ResumoStatus contagem={resumo.porStatus} />
          </View>

          <View style={styles.section}>
            <SectionHeader
              title="Próximos agendamentos"
              actionLabel="Ver todos"
              onAction={() => router.push('/agendamentos')}
            />

            {erro ? (
              <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
            ) : resumo.proximos.length === 0 ? (
              <EmptyState
                icon="checkmark-circle-outline"
                title="Nada pendente por agora"
                subtitle="Os próximos agendamentos de hoje aparecem aqui."
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                {resumo.proximos.map(item => (
                  <AppointmentRow key={item.id_agendamento} item={item} />
                ))}
              </View>
            )}
          </View>

          <Pressable style={styles.ctaTodos} onPress={() => router.push('/agendamentos')}>
            <Ionicons name="list-outline" size={18} color={colors.primary600} />
            <Text style={styles.ctaTexto}>Ver todos os agendamentos de hoje</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary600} />
          </Pressable>
        </>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl },
  saudacao: { ...typography.heading.xl, color: colors.text },
  data: { ...typography.body.lg, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  resumoWrap: { marginBottom: spacing['2xl'] },
  section: { marginBottom: spacing.lg },
  ctaTodos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary50,
    borderRadius: 12,
    paddingVertical: spacing.md,
  },
  ctaTexto: { ...typography.label.md, color: colors.primary600 },
})
