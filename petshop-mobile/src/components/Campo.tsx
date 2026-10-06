import type { ReactNode } from 'react'
import { StyleSheet, View, type TextInputProps } from 'react-native'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { Text, TextInput } from '@/components/Texto'

interface Props extends TextInputProps {
  rotulo: string
  ajuda?: string
  // O " *" vermelho do `.form-label-required` do site.
  obrigatorio?: boolean
  // À direita do rótulo (a troca kg/g do estoque).
  lateral?: ReactNode
  // Explicação em letra miúda embaixo (`.text-xs.text-muted` do site).
  nota?: ReactNode
}

// Campo de texto com rótulo em cima (mesmo desenho do login).
export function Campo({ rotulo, ajuda, obrigatorio, lateral, nota, style, multiline, ...resto }: Props) {
  return (
    <View style={styles.campo}>
      {lateral ? (
        <View style={styles.topo}>
          <Text style={styles.rotulo}>{rotulo}{obrigatorio && <Text style={styles.estrela}> *</Text>}</Text>
          {lateral}
        </View>
      ) : (
        <Text style={styles.rotulo}>{rotulo}{obrigatorio && <Text style={styles.estrela}> *</Text>}</Text>
      )}
      <TextInput
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        accessibilityLabel={rotulo}
        style={[styles.input, multiline && styles.multilinha, style]}
        {...resto}
      />
      {ajuda && <Text style={styles.ajuda}>{ajuda}</Text>}
      {nota ? <Text style={styles.nota}>{nota}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  campo: { gap: spacing.xs },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rotulo: { ...typography.label.md, color: colors.textDim },
  estrela: { color: colors.dangerFg },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    ...typography.body.lg,
    color: colors.text,
  },
  multilinha: { minHeight: 84, paddingTop: spacing.md, paddingBottom: spacing.md, textAlignVertical: 'top' },
  // `.form-hint` do site no celular.
  ajuda: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
})
