import { useCallback, useMemo } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { IconeAgenda, IconeMais, IconePets, IconeSeta } from '@/components/IconesAbas'
import { StatCard } from '@/components/StatCard'
import { SectionHeader } from '@/components/SectionHeader'
import { AppointmentRow } from '@/components/AppointmentRow'
import { ResumoStatus } from '@/components/ResumoStatus'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { useAgendamentosHoje } from '@/hooks/useAgendamentosHoje'
import { dataExtensaBrasil, saudacao, agoraBrasilHHMM } from '@/lib/agenda'
import { ehAtrasado, ehEtapaAtiva } from '@/lib/statusAgendamento'
import { colors, spacing, typography } from '@/theme/theme'

const MAX_PROXIMOS = 4

export default function InicioScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const { agendamentos, loading, erro, recarregar } = useAgendamentosHoje(contexto?.idLojista)

  // Voltando de um agendamento alterado, o resumo já aparece atualizado.
  useFocusEffect(useCallback(() => { recarregar() }, [recarregar]))

  const resumo = useMemo(() => {
    const agora = agoraBrasilHHMM()
    const naLoja = agendamentos.filter(a => a.status === 'Em andamento').length
    // Tudo de hoje que ainda está em aberto, inclusive o que já passou do
    // horário: é o que a loja ainda precisa resolver. Cortar pelo horário
    // escondia o agendamento atrasado e a tela dizia "Nada pendente" com o
    // contador ao lado marcando 1.
    const proximos = agendamentos.filter(a => ehEtapaAtiva(a.status)).slice(0, MAX_PROXIMOS)
    const porStatus = agendamentos.reduce<Record<string, number>>((acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1
      return acc
    }, {})
    // Cancelado não conta como agendamento do dia — mesma conta do site
    // (fn_metricas_lojista).
    const total = agendamentos.filter(a => a.status !== 'Cancelado').length
    return { total, naLoja, proximos, porStatus, agora }
  }, [agendamentos])

  return (
    <ScreenContainer
      refreshing={loading}
      onRefresh={recarregar}
      topo={<BarraTopo rotuloMenu="Menu da loja" onMenu={() => router.push('/mais')} />}
    >
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
            <StatCard icon={IconeAgenda} value={resumo.total} label="Agendamentos hoje" />
            <StatCard icon={IconePets} value={resumo.naLoja} label="Pets na loja agora" tint={colors.accent600} />
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
              <EmptyState icon="alert-circle-outline" ilustracao="erro" title="Não foi possível carregar" subtitle={erro} />
            ) : resumo.proximos.length === 0 ? (
              <EmptyState
                icon="checkmark-circle-outline"
                ilustracao="tudo-em-dia"
                title="Nada pendente por agora"
                subtitle="Os próximos agendamentos de hoje aparecem aqui."
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                {resumo.proximos.map(item => (
                  <AppointmentRow
                    key={item.id_agendamento}
                    item={item}
                    atrasado={ehAtrasado(item.status, item.hr_agendamento, resumo.agora)}
                    onPress={() => router.push(`/agendamentos/${item.id_agendamento}`)}
                  />
                ))}
              </View>
            )}
          </View>

          <Pressable style={[styles.ctaTodos, styles.ctaNovo]} onPress={() => router.push('/agendamentos/novo')} accessibilityRole="button">
            <IconeMais size={18} color={colors.white} />
            <Text style={[styles.ctaTexto, { color: colors.white }]}>Novo agendamento</Text>
          </Pressable>

          <Pressable style={styles.ctaTodos} onPress={() => router.push('/agendamentos')}>
            <IconeAgenda size={18} color={colors.primary600} />
            <Text style={styles.ctaTexto}>Ver todos os agendamentos de hoje</Text>
            <IconeSeta size={16} color={colors.primary600} />
          </Pressable>
        </>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl },
  saudacao: { ...typography.heading.xl, color: colors.text },
  data: { ...typography.body.lg, color: colors.textMuted, marginTop: 2 },
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
  ctaNovo: { backgroundColor: colors.primary600, marginBottom: spacing.md },
  ctaTexto: { ...typography.label.md, color: colors.primary600 },
})
