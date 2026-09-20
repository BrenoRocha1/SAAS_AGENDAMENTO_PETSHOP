import { useRouter } from 'expo-router'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface ItemMenu {
  icone: keyof typeof Ionicons.glyphMap
  label: string
  rota: string
}

const ITENS: ItemMenu[] = [
  { icone: 'people-circle-outline', label: 'Funcionários', rota: '/mais/funcionarios' },
  { icone: 'cube-outline', label: 'Produtos', rota: '/mais/produtos' },
  { icone: 'bar-chart-outline', label: 'Relatórios', rota: '/mais/relatorios' },
  { icone: 'settings-outline', label: 'Configurações', rota: '/mais/configuracoes' },
  { icone: 'storefront-outline', label: 'Perfil da loja', rota: '/mais/perfil-loja' },
]

export default function MaisScreen() {
  const { contexto, signOut } = useAuth()
  const router = useRouter()

  function confirmarSaida() {
    Alert.alert('Sair da conta', 'Você precisará entrar de novo para acessar o painel.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Mais</Text>

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

      <View style={styles.menu}>
        {ITENS.map((item, i) => (
          <Pressable
            key={item.rota}
            onPress={() => router.push(item.rota as never)}
            style={({ pressed }) => [styles.item, i < ITENS.length - 1 && styles.itemBorda, pressed && styles.itemPressionado]}
          >
            <View style={styles.itemIcone}>
              <Ionicons name={item.icone} size={19} color={colors.primary600} />
            </View>
            <Text style={styles.itemLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        ))}
      </View>

      <Pressable onPress={confirmarSaida} style={({ pressed }) => [styles.sair, pressed && styles.itemPressionado]}>
        <Ionicons name="log-out-outline" size={19} color={colors.dangerFg} />
        <Text style={styles.sairTexto}>Sair</Text>
      </Pressable>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  title: { ...typography.heading.xl, color: colors.text, marginBottom: spacing.lg },
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
