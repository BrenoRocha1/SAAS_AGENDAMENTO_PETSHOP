import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { IconeSair, IconeSeta } from '@/components/IconesAbas'
import { useAuth } from '@/contexts/AuthContext'
import { dialogo } from '@/lib/dialogo'
import { itensDoMenu } from '@/lib/menuDoApp'
import { colors, radius, spacing, typography } from '@/theme/theme'

// Os mesmos itens, ícones e ordem do menu lateral (e do site).
const ITENS = itensDoMenu('cliente', null)

// Menu do cliente — aberto pela barra do topo da Início.
export default function MenuClienteScreen() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const nome = (user?.user_metadata?.nome as string | undefined) ?? user?.email ?? 'Cliente'

  function confirmarSaida() {
    dialogo('Sair da conta', 'Você precisará entrar de novo para ver os seus agendamentos.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Menu" onVoltar={() => router.navigate('/cliente' as never)} />

      <Card style={styles.perfilCard}>
        <Avatar nome={nome} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.perfilNome} numberOfLines={1}>{nome}</Text>
          <Text style={styles.perfilEmail} numberOfLines={1}>{user?.email}</Text>
        </View>
      </Card>

      <View style={styles.menu}>
        {ITENS.map((item, i) => {
          const Icone = item.icone
          return (
            <Pressable
              key={item.rota}
              onPress={() => (item.aba ? router.navigate(item.rota as never) : router.push(item.rota as never))}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, i < ITENS.length - 1 && styles.itemBorda, pressed && styles.pressionado]}
            >
              <View style={styles.itemIcone}>
                <Icone size={19} color={colors.primary600} />
              </View>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <IconeSeta size={17} color={colors.textFaint} />
            </Pressable>
          )
        })}
      </View>

      <Pressable onPress={confirmarSaida} accessibilityRole="button" style={({ pressed }) => [styles.sair, pressed && styles.pressionado]}>
        <IconeSair size={19} color={colors.dangerFg} />
        <Text style={styles.sairTexto}>Sair</Text>
      </Pressable>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  perfilCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  perfilNome: { ...typography.heading.sm, color: colors.text },
  perfilEmail: { ...typography.body.sm, color: colors.textMuted, marginTop: 2 },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  itemBorda: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressionado: { backgroundColor: colors.surfaceMuted },
  itemIcone: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.primary50, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { flex: 1, ...typography.body.lg, color: colors.text, fontWeight: '600' },
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
