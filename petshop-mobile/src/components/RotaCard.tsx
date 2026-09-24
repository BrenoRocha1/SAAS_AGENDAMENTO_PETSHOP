import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { hojeBrasilISO } from '@/lib/agenda'
import { ROTULO_STATUS_ROTA, contarPets, proximaParada, tituloParada, trajetoDaRota, type Rota, type StatusRota } from '@/lib/taxidog-rotas'
import { colors, radius, spacing, typography } from '@/theme/theme'

const COR_STATUS: Record<StatusRota, { bg: string; fg: string }> = {
  planejamento: { bg: colors.surfaceMuted, fg: colors.textDim },
  aguardando_aprovacao: { bg: colors.warningBg, fg: colors.warningFg },
  aguardando_saida: { bg: colors.infoBg, fg: colors.infoFg },
  em_andamento: { bg: colors.primary50, fg: colors.primary600 },
  concluida: { bg: colors.successBg, fg: colors.successFg },
  cancelada: { bg: colors.dangerBg, fg: colors.dangerFg },
}

export function PillStatusRota({ status }: { status: StatusRota }) {
  const cor = COR_STATUS[status]
  return (
    <View style={[styles.pill, { backgroundColor: cor.bg }]}>
      <Text style={[styles.pillTexto, { color: cor.fg }]}>{ROTULO_STATUS_ROTA[status]}</Text>
    </View>
  )
}

export function rotuloDia(data: string): string {
  if (data === hojeBrasilISO()) return 'Hoje'
  return format(parseISO(data), 'EEE, dd/MM', { locale: ptBR })
}

// Card de rota das listas (Início, Rotas, Histórico).
export function RotaCard({ rota: r, onPress }: { rota: Rota; onPress: () => void }) {
  const pets = contarPets(r)
  const trajeto = trajetoDaRota(r)
  const proxima = r.status === 'em_andamento' ? proximaParada(r) : null
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.topo}>
        <Text style={styles.numero}>Rota #{r.numero}</Text>
        <PillStatusRota status={r.status} />
      </View>
      <Text style={styles.linha}>
        {rotuloDia(r.data)} · {r.paradas.length} {r.paradas.length === 1 ? 'parada' : 'paradas'} · {pets} {pets === 1 ? 'pet' : 'pets'}
      </Text>
      {trajeto && (
        <View style={styles.trajeto}>
          <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
          <Text style={styles.linha}>{trajeto}</Text>
        </View>
      )}
      {proxima && <Text style={styles.proxima} numberOfLines={1}>Próxima: {tituloParada(proxima)}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  numero: { ...typography.heading.md, color: colors.text },
  linha: { ...typography.body.md, color: colors.textMuted },
  trajeto: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  proxima: { ...typography.label.md, color: colors.primary600, marginTop: 2 },
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pillTexto: { ...typography.label.md },
})
