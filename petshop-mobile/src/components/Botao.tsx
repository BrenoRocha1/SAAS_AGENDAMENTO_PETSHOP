import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'

type Variante = 'primario' | 'secundario' | 'perigo' | 'sucesso'

interface Props {
  rotulo: string
  onPress: () => void
  variante?: Variante
  icone?: keyof typeof Ionicons.glyphMap
  carregando?: boolean
  desativado?: boolean
  compacto?: boolean
  style?: StyleProp<ViewStyle>
}

const CORES: Record<Variante, { fundo: string; texto: string; borda: string }> = {
  primario: { fundo: colors.primary600, texto: colors.white, borda: colors.primary600 },
  secundario: { fundo: colors.surface, texto: colors.text, borda: colors.borderStrong },
  perigo: { fundo: colors.surface, texto: colors.dangerFg, borda: '#fecaca' },
  sucesso: { fundo: colors.success, texto: colors.white, borda: colors.success },
}

// Botão padrão do app — mesma hierarquia do .btn do web (primário cheio,
// secundário com borda, perigo em vermelho).
export function Botao({ rotulo, onPress, variante = 'primario', icone, carregando, desativado, compacto, style }: Props) {
  const cor = CORES[variante]
  const parado = !!desativado || !!carregando
  return (
    <Pressable
      onPress={onPress}
      disabled={parado}
      accessibilityRole="button"
      accessibilityState={{ disabled: parado, busy: !!carregando }}
      style={({ pressed }) => [
        styles.botao,
        compacto && styles.compacto,
        { backgroundColor: cor.fundo, borderColor: cor.borda },
        (pressed || parado) && styles.apagado,
        style,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={cor.texto} />
      ) : (
        <>
          {icone && <IconeApp name={icone} size={compacto ? 16 : 18} color={cor.texto} />}
          <Text style={[compacto ? styles.textoCompacto : styles.texto, { color: cor.texto }]} numberOfLines={1}>
            {rotulo}
          </Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  compacto: { minHeight: 42, paddingHorizontal: spacing.md },
  apagado: { opacity: 0.6 },
  texto: { ...typography.heading.sm },
  textoCompacto: { ...typography.label.md },
})
