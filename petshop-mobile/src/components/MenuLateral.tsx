import { useEffect, useRef, useState } from 'react'
import { IconeApp } from '@/components/IconeApp'
import { usePathname, useRouter } from 'expo-router'
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/Avatar'
import { IconeCorridas, IconeFechar, IconePets, IconePetshops, IconeSair } from '@/components/IconesAbas'
import { Text } from '@/components/Texto'
import { useAuth, type ModoApp } from '@/contexts/AuthContext'
import { dialogo } from '@/lib/dialogo'
import { ehEmailInterno } from '@/lib/emailInterno'
import { MENU_DA_AREA, itensDoMenu, rotaAtiva, type ItemMenu } from '@/lib/menuDoApp'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, radius, spacing } from '@/theme/theme'

const LARGURA_MAXIMA = 300

interface Props {
  visivel: boolean
  onFechar: () => void
}

// Menu lateral do app: abre pelos três tracinhos da barra do topo, com a
// mesma cara da barra lateral do site (marca em cima, itens com ícone, o
// item da tela atual destacado em índigo, usuário e "Sair" no rodapé). Os
// itens, os ícones e a ordem vêm de lib/menuDoApp — os mesmos do site.
export function MenuLateral({ visivel, onFechar }: Props) {
  const { modo, contexto, user, temAcessoLoja, setModo, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const largura = Math.min(LARGURA_MAXIMA, Math.round(width * 0.84))

  // Fica montado até a animação de saída terminar.
  const progresso = useRef(new Animated.Value(0)).current
  const [montado, setMontado] = useState(visivel)
  if (visivel && !montado) setMontado(true)

  useEffect(() => {
    Animated.timing(progresso, {
      toValue: visivel ? 1 : 0,
      duration: visivel ? 240 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visivel) setMontado(false)
    })
  }, [visivel, progresso])

  const menu = MENU_DA_AREA[modo]
  const itens = itensDoMenu(modo, contexto)
  const atual = rotaAtiva(itens, pathname, menu.inicio)
  const nome = contexto?.nome
    ?? (user?.user_metadata?.nome as string | undefined)
    ?? (ehEmailInterno(user?.email) ? undefined : user?.email)
    ?? 'Usuário'
  const papel = modo === 'cliente' ? 'Cliente'
    : modo === 'taxidog' ? 'TaxiDog'
    : contexto?.role === 'lojista' ? 'Lojista'
    : contexto?.acessoTotal ? 'Administrador' : 'Funcionário'

  function abrir(item: ItemMenu) {
    onFechar()
    if (item.aba) router.navigate(item.rota as never)
    else router.push(item.rota as never)
  }

  function trocarArea(novo: ModoApp) {
    onFechar()
    setModo(novo)
  }

  function sair() {
    onFechar()
    dialogo('Sair da conta', 'Você precisará entrar de novo para usar o app.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <Modal visible={montado} transparent animationType="none" onRequestClose={onFechar} statusBarTranslucent>
      <View style={styles.raiz}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.fundo, { opacity: progresso }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar menu" />
        </Animated.View>

        <Animated.View
          style={[
            styles.painel,
            {
              width: largura,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              transform: [{ translateX: progresso.interpolate({ inputRange: [0, 1], outputRange: [-largura, 0] }) }],
            },
          ]}
        >
          <View style={styles.cabecalho}>
            <View style={styles.logo}>
              <IconePets size={16} color={colors.white} />
            </View>
            <Text style={styles.marca}>
              SA<Text style={{ color: colors.primary600 }}>IP</Text>
            </Text>
            <Pressable
              onPress={onFechar}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fechar menu"
              style={({ pressed }) => [styles.fechar, pressed && styles.pressionado]}
            >
              <IconeFechar size={19} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.lista} contentContainerStyle={styles.listaConteudo} showsVerticalScrollIndicator={false}>
            <Text style={styles.secao}>{menu.secao}</Text>
            {itens.map(item => {
              const ativo = item.rota === atual
              const Icone = item.icone
              return (
                <Pressable
                  key={item.rota}
                  onPress={() => abrir(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  style={({ pressed }) => [styles.item, ativo && styles.itemAtivo, pressed && !ativo && styles.pressionado]}
                >
                  <Icone size={20} color={ativo ? colors.primary700 : colors.textMuted} />
                  <Text style={[styles.itemLabel, ativo && styles.itemLabelAtivo]} numberOfLines={1}>{item.label}</Text>
                </Pressable>
              )
            })}

            {/* Quem tem as duas áreas troca por aqui. */}
            {modo === 'loja' && contexto?.podeTaxidog && (
              <>
                <View style={styles.divisor} />
                <Pressable onPress={() => trocarArea('taxidog')} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && styles.pressionado]}>
                  <IconeCorridas size={20} color={colors.textMuted} />
                  <Text style={styles.itemLabel} numberOfLines={1}>Área do TaxiDog</Text>
                  <IconeApp name="swap-horizontal" size={16} color={colors.textFaint} />
                </Pressable>
              </>
            )}
            {modo === 'taxidog' && temAcessoLoja && (
              <>
                <View style={styles.divisor} />
                <Pressable onPress={() => trocarArea('loja')} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && styles.pressionado]}>
                  <IconePetshops size={20} color={colors.textMuted} />
                  <Text style={styles.itemLabel} numberOfLines={1}>Painel da loja</Text>
                  <IconeApp name="swap-horizontal" size={16} color={colors.textFaint} />
                </Pressable>
              </>
            )}
          </ScrollView>

          <View style={styles.rodape}>
            <View style={styles.usuario}>
              <Avatar nome={nome} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.usuarioNome} numberOfLines={1}>{nome}</Text>
                <Text style={styles.usuarioPapel} numberOfLines={1}>{papel}</Text>
              </View>
            </View>
            <Pressable onPress={sair} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && styles.pressionado]}>
              <IconeSair size={20} color={colors.textMuted} />
              <Text style={styles.itemLabel}>Sair</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  fundo: { backgroundColor: 'rgba(15,23,42,0.45)' },
  painel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  cabecalho: { height: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 18 },
  logo: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primary600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marca: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: -0.36, fontFamily: FONTE_TITULO, color: colors.text },
  fechar: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  lista: { flex: 1 },
  listaConteudo: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: 2 },
  secao: {
    paddingHorizontal: 10,
    paddingTop: spacing.sm,
    paddingBottom: 6,
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  item: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  // Mesmo destaque do site: fundo índigo bem claro, texto e ícone em índigo.
  itemAtivo: { backgroundColor: 'rgba(79,70,229,0.12)' },
  pressionado: { backgroundColor: 'rgba(17,24,39,0.05)' },
  itemLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.textDim },
  itemLabelAtivo: { color: colors.primary700 },
  divisor: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm, marginHorizontal: 10 },
  rodape: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.sm, gap: 2 },
  usuario: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6 },
  usuarioNome: { fontSize: 14, fontWeight: '600', color: colors.text },
  usuarioPapel: { fontSize: 12, color: colors.textMuted },
})
