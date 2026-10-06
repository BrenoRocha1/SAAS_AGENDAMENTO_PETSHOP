import type { ComponentType, ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconCheck, type IconeProps } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'

interface Props {
  titulo: string
  detalhe?: string
  // Um dos desenhos do site, à esquerda (cachorro no pet, tesoura no serviço).
  icone?: ComponentType<IconeProps>
  tamanhoDoIcone?: number
  selecionado?: boolean
  // No lugar do "✓" à direita (o preço do serviço).
  lateral?: ReactNode
  // Título e detalhe maiores — as duas opções do transporte.
  grande?: boolean
  desativado?: boolean
  onPress?: () => void
}

// Item de uma lista de escolha — o `.picker-item` do site no celular:
// cartão cinza com borda; escolhido, fica lilás com a borda índigo e o "✓".
export function ItemEscolha({ titulo, detalhe, icone: Icone, tamanhoDoIcone = 18, selecionado, lateral, grande, desativado, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desativado || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selecionado, disabled: !!desativado }}
      style={({ pressed }) => [
        styles.item,
        grande && styles.itemGrande,
        selecionado && (grande ? styles.selecionadoGrande : styles.selecionado),
        (pressed || desativado) && styles.apagado,
      ]}
    >
      {/* No cartão grande (transporte) o ícone continua cinza quando escolhido. */}
      {Icone && <Icone size={tamanhoDoIcone} color={selecionado && !grande ? colors.primary600 : colors.textMuted} />}
      <View style={styles.textos}>
        <Text style={grande ? styles.tituloGrande : styles.titulo}>{titulo}</Text>
        {detalhe ? <Text style={grande ? styles.detalheGrande : styles.detalhe}>{detalhe}</Text> : null}
      </View>
      {lateral ?? (selecionado ? <IconCheck size={grande ? 16 : 18} color={colors.primary600} /> : null)}
    </Pressable>
  )
}

// A lista em volta: 8 entre os itens. Com muitos itens o site rola por
// dentro (altura máxima); aqui a tela inteira rola, então a lista só empilha.
export function ListaDeEscolha({ children }: { children: ReactNode }) {
  return <View style={styles.lista}>{children}</View>
}

const styles = StyleSheet.create({
  lista: { gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  itemGrande: { padding: 16 },
  selecionado: { borderColor: colors.primary500, backgroundColor: 'rgba(79,70,229,0.1)' },
  selecionadoGrande: { borderColor: colors.primary500, backgroundColor: 'rgba(79,70,229,0.12)' },
  apagado: { opacity: 0.7 },
  textos: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 15, lineHeight: 17, fontWeight: '600', color: colors.text },
  detalhe: { fontSize: 13, lineHeight: 16, color: '#858d99' },
  tituloGrande: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  detalheGrande: { fontSize: 14, lineHeight: 20, color: '#858d99' },
})
