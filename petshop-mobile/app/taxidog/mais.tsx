import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { dialogo } from '@/lib/dialogo'

export default function MaisTaxiDogScreen() {
  const { contexto, temAcessoLoja, setModo, signOut } = useAuth()
  const router = useRouter()

  function confirmarSaida() {
    dialogo('Sair da conta', 'Você precisará entrar de novo e deixará de receber avisos de corridas e rotas.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScreenContainer>
      {/* Aberto pela barra do topo da Início: a seta volta pra lá. */}
      <DetailHeader title="Menu" onVoltar={() => router.navigate('/taxidog' as never)} />

      <Card style={styles.perfilCard}>
        <Avatar nome={contexto?.nome ?? 'TaxiDog'} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.perfilNome} numberOfLines={1}>{contexto?.nome}</Text>
          <View style={styles.papel}>
            <Ionicons name="car" size={12} color={colors.primary600} />
            <Text style={styles.papelTexto}>TaxiDog</Text>
          </View>
        </View>
      </Card>

      {temAcessoLoja && (
        <Pressable onPress={() => setModo('loja')} style={({ pressed }) => [styles.item, pressed && styles.pressionado]}>
          <View style={styles.itemIcone}><Ionicons name="storefront-outline" size={19} color={colors.primary600} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemLabel}>Painel da loja</Text>
            <Text style={styles.itemDesc}>Agendamentos, clientes e pets</Text>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={colors.textFaint} />
        </Pressable>
      )}

      <Pressable onPress={confirmarSaida} style={({ pressed }) => [styles.sair, pressed && styles.pressionado]}>
        <Ionicons name="log-out-outline" size={19} color={colors.dangerFg} />
        <Text style={styles.sairTexto}>Sair</Text>
      </Pressable>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  perfilCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  perfilNome: { ...typography.heading.sm, color: colors.text },
  papel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  papelTexto: { ...typography.body.sm, color: colors.primary600, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  itemIcone: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.primary50, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { ...typography.body.lg, color: colors.text, fontWeight: '600' },
  itemDesc: { ...typography.body.sm, color: colors.textMuted },
  pressionado: { backgroundColor: colors.surfaceMuted },
  sair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  sairTexto: { ...typography.heading.sm, color: colors.dangerFg },
})
