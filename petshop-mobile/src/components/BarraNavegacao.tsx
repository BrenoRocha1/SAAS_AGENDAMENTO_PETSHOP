import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { colors, radius, shadow, spacing } from '@/theme/theme'

// Barra inferior em "pílula": só ícones, e a aba aberta se estica pra
// mostrar o nome. Mesma barra nas duas áreas do app (equipe e TaxiDog) —
// as abas, os ícones e os títulos continuam vindo de cada <Tabs.Screen>.
//
// Aba marcada com `href: null` não aparece aqui (a rota continua
// existindo — é o caso do menu "Mais", aberto pela barra do topo).

const ALTURA_ITEM = 44
const TAMANHO_ICONE = 22
// Largura do nome enquanto ainda não foi medido (primeiro desenho).
const LARGURA_PADRAO = 72
const ESPACO_ICONE_NOME = 8

function escondida(estilo: unknown): boolean {
  return (StyleSheet.flatten(estilo as never) as { display?: string } | undefined)?.display === 'none'
}

export function BarraNavegacao({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  // Entrada: a barra "assenta" ao aparecer.
  const entrada = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(entrada, { toValue: 1, stiffness: 300, damping: 26, mass: 1, useNativeDriver: true }).start()
  }, [entrada])

  // Com o teclado aberto no Android a tela encolhe, e a barra subiria
  // junto, tomando o lugar do campo que está sendo preenchido.
  const [tecladoAberto, setTecladoAberto] = useState(false)
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const abre = Keyboard.addListener('keyboardDidShow', () => setTecladoAberto(true))
    const fecha = Keyboard.addListener('keyboardDidHide', () => setTecladoAberto(false))
    return () => {
      abre.remove()
      fecha.remove()
    }
  }, [])
  // Largura do nome de cada aba, medida de verdade ("Agendamentos" e
  // "Pets" não cabem na mesma largura).
  const [larguras, setLarguras] = useState<Record<string, number>>({})

  if (tecladoAberto) return null

  const visiveis = state.routes
    .map((rota, indice) => ({ rota, indice, opcoes: descriptors[rota.key].options }))
    .filter(r => !escondida(r.opcoes.tabBarItemStyle))

  return (
    <View style={[styles.fundo, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {/* Régua invisível: os nomes inteiros, numa faixa larga fora do fluxo,
          pra cada aba abrir exatamente o tamanho do próprio nome. Fica fora
          da pílula de propósito — dentro do botão o texto seria medido já
          espremido pela largura dele. */}
      <View style={styles.regua} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden>
        {visiveis.map(({ rota, opcoes }) => (
          <Text
            key={rota.key}
            style={styles.nome}
            onLayout={e => {
              const medida = Math.ceil(e.nativeEvent.layout.width) + 1
              setLarguras(atual => (atual[rota.key] === medida ? atual : { ...atual, [rota.key]: medida }))
            }}
          >
            {opcoes.title ?? rota.name}
          </Text>
        ))}
      </View>

      <Animated.View
        accessibilityRole="tablist"
        style={[
          styles.pilula,
          { opacity: entrada, transform: [{ scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
        ]}
      >
        {visiveis.map(({ rota, indice, opcoes }) => {
          const ativa = state.index === indice
          const nome = opcoes.title ?? rota.name

          const aoTocar = () => {
            const evento = navigation.emit({ type: 'tabPress', target: rota.key, canPreventDefault: true })
            if (!ativa && !evento.defaultPrevented) navigation.navigate(rota.name, rota.params)
          }

          return (
            <Item
              key={rota.key}
              nome={nome}
              larguraNome={larguras[rota.key] ?? LARGURA_PADRAO}
              ativa={ativa}
              rotuloAcessivel={opcoes.tabBarAccessibilityLabel ?? nome}
              icone={cor => opcoes.tabBarIcon?.({ focused: ativa, color: cor, size: TAMANHO_ICONE }) ?? null}
              onPress={aoTocar}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: rota.key })}
            />
          )
        })}
      </Animated.View>
    </View>
  )
}

interface ItemProps {
  nome: string
  larguraNome: number
  ativa: boolean
  rotuloAcessivel: string
  icone: (cor: string) => ReactNode
  onPress: () => void
  onLongPress: () => void
}

function Item({ nome, larguraNome, ativa, rotuloAcessivel, icone, onPress, onLongPress }: ItemProps) {
  // 0 = só o ícone; 1 = ícone + nome.
  const aberto = useRef(new Animated.Value(ativa ? 1 : 0)).current

  useEffect(() => {
    // Largura não anima no driver nativo; é uma animação curta e só de
    // um item por vez.
    Animated.spring(aberto, { toValue: ativa ? 1 : 0, stiffness: 350, damping: 32, mass: 1, useNativeDriver: false }).start()
  }, [ativa, aberto])

  const cor = ativa ? colors.primary600 : colors.textMuted

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativa }}
      accessibilityLabel={rotuloAcessivel}
      style={({ pressed }) => [styles.item, ativa && styles.itemAtivo, pressed && styles.itemPressionado]}
    >
      {icone(cor)}

      <Animated.View
        style={[
          styles.nomeCaixa,
          {
            width: aberto.interpolate({ inputRange: [0, 1], outputRange: [0, larguraNome] }),
            marginLeft: aberto.interpolate({ inputRange: [0, 1], outputRange: [0, ESPACO_ICONE_NOME] }),
            opacity: aberto,
          },
        ]}
      >
        <Text style={[styles.nome, { width: larguraNome }]} numberOfLines={1}>{nome}</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Faixa do rodapé: ocupa lugar na tela (o conteúdo termina acima dela),
  // com o mesmo fundo das telas — a pílula parece flutuar.
  fundo: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    overflow: 'hidden',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    maxWidth: '100%',
    ...shadow.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: ALTURA_ITEM,
    minWidth: ALTURA_ITEM,
    paddingHorizontal: 11,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  // flexShrink: em tela muito estreita, quem cede é o nome da aba aberta
  // (os ícones das outras continuam inteiros).
  itemAtivo: { backgroundColor: colors.primary50, paddingHorizontal: spacing.md, flexShrink: 1 },
  itemPressionado: { transform: [{ scale: 0.97 }], backgroundColor: colors.surfaceMuted },
  nomeCaixa: { overflow: 'hidden', justifyContent: 'center' },
  nome: { fontSize: 13, fontWeight: '600', color: colors.primary600 },
  regua: { position: 'absolute', left: 0, top: 0, width: 2000, flexDirection: 'row', alignItems: 'flex-start', opacity: 0 },
})
