import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { format, subDays } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { StatCard } from '@/components/StatCard'
import { SectionHeader } from '@/components/SectionHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/Card'
import { PillStatusRota, RotaCard } from '@/components/RotaCard'
import { CorridaCard } from '@/components/CorridaCard'
import { useAuth } from '@/contexts/AuthContext'
import { useMinhasRotas } from '@/hooks/useMinhasRotas'
import { useMinhasCorridas } from '@/hooks/useMinhasCorridas'
import { disponivel, emMovimento, encerrada, type Corrida } from '@/lib/taxidog'
import { agoraBrasil, dataExtensaBrasil, hojeBrasilISO, saudacao } from '@/lib/agenda'
import { contarPets, proximaParada, tituloParada, trajetoDaRota, type Rota } from '@/lib/taxidog-rotas'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Início do TaxiDog: a rota que pede atenção agora (em andamento, ou a
// próxima de hoje) em destaque, as corridas avulsas do Kanban (fora de
// rota) e o resumo do dia.
export default function InicioTaxiDogScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const hoje = hojeBrasilISO()
  // Ontem entra pra não perder uma rota que ficou em andamento.
  const { rotas, loading, erro, recarregar } = useMinhasRotas(format(subDays(agoraBrasil(), 1), 'yyyy-MM-dd'), hoje)
  const { corridas, rotaPorCorrida, recarregar: recarregarCorridas } = useMinhasCorridas(hoje, hoje)

  // Corridas avulsas: sem TaxiDog (pra pegar) e as dele que não estão em rota.
  const avulsas = useMemo(() => {
    const abertas = corridas.filter(c => !encerrada(c.status) && !rotaPorCorrida[c.id_corrida])
    const minhas = abertas.filter(c => !disponivel(c))
    return {
      disponiveis: abertas.filter(c => disponivel(c) && c.status_agendamento !== 'Pendente').length,
      // A que está na rua primeiro; depois a pronta pra entrega; depois por horário.
      proxima: minhas.find(c => emMovimento(c.status)) ?? minhas.find(c => c.status === 'pronto_entrega') ?? minhas[0] ?? null,
    }
  }, [corridas, rotaPorCorrida])

  const resumo = useMemo(() => {
    const doDia = rotas.filter(r => r.status !== 'cancelada' && (r.data === hoje || r.status === 'em_andamento'))
    const emAndamento = doDia.find(r => r.status === 'em_andamento') ?? null
    const destaque = emAndamento ?? doDia.find(r => r.status === 'aguardando_saida' || r.status === 'aguardando_aprovacao') ?? null
    return {
      doDia,
      destaque,
      outras: doDia.filter(r => r.id_rota !== destaque?.id_rota),
      pets: doDia.reduce((soma, r) => soma + contarPets(r), 0),
      concluidas: doDia.filter(r => r.status === 'concluida').length,
    }
  }, [rotas, hoje])

  const primeiroNome = (contexto?.nome ?? '').split(' ')[0]
  const abrir = (r: Rota) => router.push(`/taxidog/rota/${r.id_rota}` as never)
  const abrirCorrida = (c: Corrida) => router.push(`/taxidog/corrida/${c.id_corrida}` as never)

  return (
    <ScreenContainer refreshing={loading} onRefresh={() => { recarregar(); recarregarCorridas() }}>
      <View style={styles.header}>
        <Text style={styles.saudacao}>{saudacao()}, {primeiroNome}</Text>
        <Text style={styles.data}>{dataExtensaBrasil()}</Text>
        {!loading && !erro && (
          <Text style={styles.frase}>
            {resumo.doDia.length === 0
              ? 'Hoje você ainda não tem rotas.'
              : `Hoje você tem ${resumo.doDia.length} ${resumo.doDia.length === 1 ? 'rota' : 'rotas'}.`}
          </Text>
        )}
      </View>

      {erro ? (
        <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
      ) : (
        <>
          {avulsas.disponiveis > 0 && (
            <Pressable style={styles.disponiveis} onPress={() => router.push('/taxidog/corridas' as never)}>
              <Ionicons name="hand-right-outline" size={20} color={colors.primary600} />
              <Text style={styles.disponiveisTexto}>
                {avulsas.disponiveis === 1 ? '1 corrida disponível para pegar hoje' : `${avulsas.disponiveis} corridas disponíveis para pegar hoje`}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary600} />
            </Pressable>
          )}

          {resumo.destaque ? (
            <View style={styles.section}>
              <SectionHeader title={resumo.destaque.status === 'em_andamento' ? 'Rota em andamento' : 'Próxima rota'} />
              <RotaDestaque rota={resumo.destaque} onAbrir={() => abrir(resumo.destaque!)} />
            </View>
          ) : !loading && !avulsas.proxima && (
            <View style={styles.section}>
              <EmptyState icon="map-outline" title="Nada para agora" subtitle="Pegue uma corrida no Kanban ou monte uma rota — ou espere a loja mandar uma para você." />
            </View>
          )}

          {avulsas.proxima && (
            <View style={styles.section}>
              <SectionHeader title="Próxima corrida (fora de rota)" />
              <CorridaCard corrida={avulsas.proxima} onPress={() => abrirCorrida(avulsas.proxima!)} />
            </View>
          )}

          <View style={[styles.statsRow, { marginBottom: spacing['2xl'] }]}>
            <StatCard icon="paw-outline" value={resumo.pets} label="Pets hoje" tint={colors.accent600} />
            <StatCard icon="checkmark-done-outline" value={resumo.concluidas} label="Rotas concluídas" tint={colors.success} />
          </View>

          {resumo.outras.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Outras rotas de hoje" />
              <View style={{ gap: spacing.md }}>
                {resumo.outras.map(r => <RotaCard key={r.id_rota} rota={r} onPress={() => abrir(r)} />)}
              </View>
            </View>
          )}

          <Pressable style={styles.ctaTodas} onPress={() => router.push('/taxidog/rotas' as never)}>
            <Ionicons name="map-outline" size={18} color={colors.primary600} />
            <Text style={styles.ctaTexto}>Ver todas as rotas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary600} />
          </Pressable>
        </>
      )}
    </ScreenContainer>
  )
}

function RotaDestaque({ rota: r, onAbrir }: { rota: Rota; onAbrir: () => void }) {
  const andamento = r.status === 'em_andamento'
  const proxima = proximaParada(r)
  const trajeto = trajetoDaRota(r)
  const pets = contarPets(r)
  return (
    <Card style={styles.destaque}>
      <View style={styles.destaqueTopo}>
        <Text style={styles.destaqueNumero}>Rota #{r.numero}</Text>
        <PillStatusRota status={r.status} />
      </View>
      <Text style={styles.destaqueLinha}>
        {r.paradas.length} {r.paradas.length === 1 ? 'parada' : 'paradas'} · {pets} {pets === 1 ? 'pet' : 'pets'}{trajeto ? ` · ${trajeto}` : ''}
      </Text>
      {proxima && (
        <View style={styles.destaqueProxima}>
          <Ionicons name={proxima.local === 'loja' ? 'storefront-outline' : 'location-outline'} size={16} color={colors.primary600} />
          <Text style={styles.destaqueProximaTexto} numberOfLines={1}>
            {andamento ? 'Próxima parada: ' : 'Primeira parada: '}{tituloParada(proxima)}
          </Text>
        </View>
      )}
      <Pressable style={styles.destaqueBotao} onPress={onAbrir}>
        <Text style={styles.destaqueBotaoTexto}>{andamento ? 'CONTINUAR ROTA' : 'VER ROTA'}</Text>
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
  destaque: { gap: spacing.sm, borderColor: colors.primary200, borderWidth: 1.5 },
  destaqueTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  destaqueNumero: { ...typography.heading.lg, color: colors.text },
  destaqueLinha: { ...typography.body.md, color: colors.textMuted },
  destaqueProxima: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  destaqueProximaTexto: { ...typography.label.md, color: colors.primary600, flex: 1 },
  destaqueBotao: {
    backgroundColor: colors.primary600,
    borderRadius: radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  destaqueBotaoTexto: { ...typography.heading.sm, color: colors.white, letterSpacing: 0.5 },
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
  disponiveis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary50,
    borderColor: colors.primary200,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  disponiveisTexto: { ...typography.label.md, color: colors.primary600, flex: 1 },
})
