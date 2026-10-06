import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { IconeCorridas, IconeSair, IconeSeta } from '@/components/IconesAbas'
import { useAuth } from '@/contexts/AuthContext'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { dialogo } from '@/lib/dialogo'
import { itensDoMenu } from '@/lib/menuDoApp'

export default function MaisScreen() {
  const { contexto, signOut, setModo } = useAuth()
  const router = useRouter()
  // Os mesmos itens, ícones e ordem do menu lateral (e do site).
  const itens = itensDoMenu('loja', contexto)

  function confirmarSaida() {
    dialogo('Sair da conta', 'Você precisará entrar de novo para acessar o painel.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScreenContainer>
      {/* Aberto pela barra do topo da Início: a seta volta pra lá. */}
      <DetailHeader title="Menu da loja" onVoltar={() => router.navigate('/')} />

      <Card style={styles.perfilCard}>
        <Avatar nome={contexto?.nome ?? 'Usuário'} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.perfilNome} numberOfLines={1}>
            {contexto?.nome}
          </Text>
          <Text style={styles.perfilPapel}>
            {contexto?.role === 'lojista' ? 'Responsável pela conta' : contexto?.acessoTotal ? 'Administrador' : 'Equipe'}
          </Text>
        </View>
      </Card>

      {contexto?.podeTaxidog && (
        <Pressable
          onPress={() => setModo('taxidog')}
          style={({ pressed }) => [styles.menu, styles.item, pressed && styles.itemPressionado]}
        >
          <View style={styles.itemIcone}>
            <IconeCorridas size={19} color={colors.primary600} />
          </View>
          <Text style={styles.itemLabel}>Área do TaxiDog</Text>
          <IconeApp name="swap-horizontal" size={18} color={colors.textFaint} />
        </Pressable>
      )}

      <View style={styles.menu}>
        {itens.map((item, i) => {
          const Icone = item.icone
          return (
            <Pressable
              key={item.rota}
              onPress={() => (item.aba ? router.navigate(item.rota as never) : router.push(item.rota as never))}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, i < itens.length - 1 && styles.itemBorda, pressed && styles.itemPressionado]}
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

      <Pressable onPress={confirmarSaida} style={({ pressed }) => [styles.sair, pressed && styles.itemPressionado]}>
        <IconeSair size={19} color={colors.dangerFg} />
        <Text style={styles.sairTexto}>Sair</Text>
      </Pressable>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  perfilCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  perfilNome: { ...typography.heading.sm, color: colors.text },
  perfilPapel: { ...typography.body.sm, color: colors.textMuted, marginTop: 2 },
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
  itemPressionado: { backgroundColor: colors.surfaceMuted },
  itemIcone: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
