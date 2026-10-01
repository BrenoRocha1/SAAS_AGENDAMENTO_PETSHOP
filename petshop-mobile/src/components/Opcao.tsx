import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  titulo: string
  detalhe?: string
  // Texto à direita (preço, quantidade…).
  lateral?: string
  selecionada: boolean
  onPress: () => void
  desativada?: boolean
}

// Linha de escolha única (serviço, pet, forma de pagamento…): a marcada
// ganha borda índigo e o "check".
export function Opcao({ titulo, detalhe, lateral, selecionada, onPress, desativada }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desativada}
      accessibilityRole="radio"
      accessibilityState={{ selected: selecionada, disabled: !!desativada }}
      style={({ pressed }) => [styles.linha, selecionada && styles.selecionada, (pressed || desativada) && styles.apagada]}
    >
      <Ionicons
        name={selecionada ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selecionada ? colors.primary600 : colors.textFaint}
      />
      <View style={styles.textos}>
        <Text style={styles.titulo} numberOfLines={2}>{titulo}</Text>
        {detalhe ? <Text style={styles.detalhe} numberOfLines={2}>{detalhe}</Text> : null}
      </View>
      {lateral ? <Text style={styles.lateral}>{lateral}</Text> : null}
    </Pressable>
  )
}

// Fileira de botões pequenos pra escolher um entre poucos (filtros,
// período, pago/pendente).
export function Segmentos<T extends string>({ opcoes, valor, onChange }: { opcoes: { valor: T; rotulo: string }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmentos}>
      {opcoes.map(o => {
        const ativo = o.valor === valor
        return (
          <Pressable
            key={o.valor}
            onPress={() => onChange(o.valor)}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
            style={[styles.segmento, ativo && styles.segmentoAtivo]}
          >
            <Text style={[styles.segmentoTexto, ativo && styles.segmentoTextoAtivo]}>{o.rotulo}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  selecionada: { borderColor: colors.primary600, backgroundColor: colors.primary50 },
  apagada: { opacity: 0.6 },
  textos: { flex: 1, gap: 2 },
  titulo: { ...typography.body.lg, fontWeight: '600', color: colors.text },
  detalhe: { ...typography.body.sm, color: colors.textMuted },
  lateral: { ...typography.label.md, color: colors.text },
  segmentos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segmento: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentoAtivo: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  segmentoTexto: { ...typography.label.md, color: colors.textDim },
  segmentoTextoAtivo: { color: colors.white },
})
