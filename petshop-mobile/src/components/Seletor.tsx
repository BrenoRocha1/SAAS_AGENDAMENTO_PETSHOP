import { useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Folha } from '@/components/Folha'
import { Opcao } from '@/components/Opcao'
import { Text } from '@/components/Texto'
import { colors, spacing } from '@/theme/theme'

interface Props<T extends string> {
  // Vira o título do painel e o nome para o leitor de tela.
  titulo: string
  valor: T
  opcoes: { valor: T; rotulo: string }[]
  onChange: (valor: T) => void
  desativado?: boolean
  style?: StyleProp<ViewStyle>
}

// Campo de escolha — a caixa do `.form-select` do site no celular (48 de
// altura, cantos de 10, seta à direita). No site ela abre a lista do
// navegador; aqui abre um painel com as mesmas opções.
export function Seletor<T extends string>({ titulo, valor, opcoes, onChange, desativado, style }: Props<T>) {
  const [aberto, setAberto] = useState(false)
  const atual = opcoes.find(o => o.valor === valor)

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        disabled={desativado}
        accessibilityRole="button"
        accessibilityLabel={`${titulo}: ${atual?.rotulo ?? ''}`}
        accessibilityState={{ disabled: !!desativado }}
        style={({ pressed }) => [styles.caixa, (pressed || desativado) && styles.apagado, style]}
      >
        {/* Texto comprido é cortado pela caixa, sem reticências — como no select do site. */}
        <View style={styles.janela}>
          <Text style={styles.texto} numberOfLines={1}>{atual?.rotulo ?? ''}</Text>
        </View>
        <View style={styles.seta} />
      </Pressable>

      <Folha visivel={aberto} titulo={titulo} onFechar={() => setAberto(false)}>
        <View style={{ gap: spacing.sm }}>
          {opcoes.map(o => (
            <Opcao
              key={o.valor}
              titulo={o.rotulo}
              selecionada={o.valor === valor}
              onPress={() => {
                setAberto(false)
                if (o.valor !== valor) onChange(o.valor)
              }}
            />
          ))}
        </View>
      </Folha>
    </>
  )
}

const styles = StyleSheet.create({
  caixa: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  apagado: { opacity: 0.6 },
  janela: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
  texto: { flexShrink: 0, fontSize: 16, color: colors.text },
  // Triângulo cinza apontando para baixo, como a seta do select.
  seta: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.textMuted,
  },
})
