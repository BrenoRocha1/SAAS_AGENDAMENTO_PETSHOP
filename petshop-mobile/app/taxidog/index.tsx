import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { StatCard } from '@/components/StatCard'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { CorridaCard, PillStatusCorrida } from '@/components/CorridaCard'
import { useAuth } from '@/contexts/AuthContext'
import { useMinhasCorridas } from '@/hooks/useMinhasCorridas'
import { agoraBrasilHHMM, dataExtensaBrasil, hojeBrasilISO, saudacao } from '@/lib/agenda'
import { emMovimento, encerrada, formatarReais, trechoAtual, type Corrida } from '@/lib/taxidog'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Qual corrida pede atenção primeiro: a que já está na rua, depois a que
// está pronta pra entrega, depois a próxima por horário.
function escolherProxima(corridas: Corrida[]): Corrida | null {
  const ativas = corridas.filter(c => !encerrada(c.status) && c.status !== 'entregue_loja' && !(c.status === 'agendada' && c.modalidade === 'entregar'))
  const naRua = ativas.find(c => emMovimento(c.status))
  if (naRua) return naRua
  const pronta = ativas.find(c => c.status === 'pronto_entrega')
  if (pronta) return pronta
  const agora = agoraBrasilHHMM()
  return ativas.find(c => c.hr_agendamento.slice(0, 5) >= agora) ?? ativas[0] ?? null
}

export default function InicioTaxiDogScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const hoje = hojeBrasilISO()
  const { corridas, loading, erro, recarregar } = useMinhasCorridas(hoje, hoje)

  const resumo = useMemo(() => {
    const validas = corridas.filter(c => c.status !== 'cancelada')
    return {
      total: validas.length,
      pendentes: validas.filter(c => !encerrada(c.status)).length,
      concluidas: validas.filter(c => c.status === 'concluida').length,
      valor: validas.reduce((soma, c) => soma + c.valor, 0),
      prontas: validas.filter(c => c.status === 'pronto_entrega'),
      proxima: escolherProxima(validas),
    }
  }, [corridas])

  const primeiroNome = (contexto?.nome ?? '').split(' ')[0]
  const abrir = (c: Corrida) => router.push(`/taxidog/corrida/${c.id_corrida}` as never)

  return (
    <ScreenContainer refreshing={loading} onRefresh={recarregar}>
      <View style={styles.header}>
        <Text style={styles.saudacao}>{saudacao()}, {primeiroNome}</Text>
        <Text style={styles.data}>{dataExtensaBrasil()}</Text>
        {!loading && !erro && (
          <Text style={styles.frase}>
            {resumo.total === 0
              ? 'Hoje você ainda não tem corridas.'
              : `Hoje você tem ${resumo.total} ${resumo.total === 1 ? 'corrida' : 'corridas'}.`}
          </Text>
        )}
      </View>

      {erro ? (
        <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
      ) : (
        <>
          {resumo.proxima && (
            <View style={styles.section}>
              <SectionHeader title="Próxima corrida" />
              <ProximaCorrida corrida={resumo.proxima} onAbrir={() => abrir(resumo.proxima!)} />
            </View>
          )}

          <View style={styles.statsRow}>
            <StatCard icon="hourglass-outline" value={resumo.pendentes} label="Pendentes" tint={colors.accent600} />
            <StatCard icon="checkmark-done-outline" value={resumo.concluidas} label="Concluídas" tint={colors.success} />
          </View>
          <View style={[styles.statsRow, { marginBottom: spacing['2xl'] }]}>
            <StatCard icon="cash-outline" value={formatarReais(resumo.valor)} label="Total das corridas do dia" />
          </View>

          {resumo.prontas.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Prontos para entrega" />
              <View style={{ gap: spacing.md }}>
                {resumo.prontas.map(c => <CorridaCard key={c.id_corrida} corrida={c} onPress={() => abrir(c)} />)}
              </View>
            </View>
          )}

          <Pressable style={styles.ctaTodas} onPress={() => router.push('/taxidog/corridas' as never)}>
            <Ionicons name="car-outline" size={18} color={colors.primary600} />
            <Text style={styles.ctaTexto}>Ver todas as corridas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary600} />
          </Pressable>
        </>
      )}
    </ScreenContainer>
  )
}

function ProximaCorrida({ corrida: c, onAbrir }: { corrida: Corrida; onAbrir: () => void }) {
  const entrega = trechoAtual(c) === 'entrega'
  const pronta = c.status === 'pronto_entrega'
  return (
    <Card style={styles.proxima}>
      <View style={styles.proximaTopo}>
        <Text style={styles.proximaHora}>{c.hr_agendamento.slice(0, 5)}</Text>
        <PillStatusCorrida corrida={c} />
      </View>
      <View style={styles.proximaPet}>
        <Avatar nome={c.pet_nome} fotoUrl={c.pet_foto_url} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.proximaTitulo}>
            {pronta ? `${c.pet_nome} está pronto para entrega` : `${entrega ? 'Entregar' : 'Buscar'} ${c.pet_nome}`}
          </Text>
          <Text style={styles.proximaLinha}>Cliente: {c.cliente_nome}</Text>
        </View>
      </View>
      <View style={styles.proximaEndereco}>
        <Ionicons name="location-outline" size={15} color={colors.textMuted} />
        <Text style={styles.proximaLinha} numberOfLines={2}>{c.logradouro}, {c.numero} · {c.bairro}</Text>
      </View>
      <Pressable style={styles.proximaBotao} onPress={onAbrir}>
        <Text style={styles.proximaBotaoTexto}>Ver corrida</Text>
      </Pressable>
    </Card>
  )
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl },
  saudacao: { ...typography.heading.xl, color: colors.text },
  data: { ...typography.body.lg, color: colors.textMuted, marginTop: 2 },
  frase: { ...typography.body.lg, color: colors.textDim, marginTop: spacing.sm, fontWeight: '600' },
  section: { marginBottom: spacing['2xl'] },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  proxima: { gap: spacing.md, borderColor: colors.primary200, borderWidth: 1.5 },
  proximaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  proximaHora: { ...typography.heading.lg, color: colors.text },
  proximaPet: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  proximaTitulo: { ...typography.heading.md, color: colors.text },
  proximaLinha: { ...typography.body.md, color: colors.textMuted, flexShrink: 1 },
  proximaEndereco: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  proximaBotao: {
    backgroundColor: colors.primary600,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  proximaBotaoTexto: { ...typography.heading.sm, color: colors.white },
  ctaTodas: {
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
