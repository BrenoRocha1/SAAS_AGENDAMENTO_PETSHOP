import { useMemo } from 'react'
import { FlatList, Pressable, StyleSheet } from 'react-native'
import { diaSemanaCurto, somarDiasISO } from '@/lib/agenda'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { Text } from '@/components/Texto'

interface Props {
  // Primeiro dia da faixa ('yyyy-MM-dd') e quantos dias mostrar.
  inicio: string
  dias?: number
  valor: string
  onChange: (dataISO: string) => void
  // Dia em que não dá para marcar (loja fechada, feriado): aparece
  // apagado e não responde ao toque.
  fechado?: (dataISO: string) => boolean
}

const LARGURA = 58

// Faixa de dias que rola pro lado (em vez de um calendário inteiro):
// escolher a data com um toque, sem teclado.
export function SeletorDia({ inicio, dias = 60, valor, onChange, fechado }: Props) {
  const lista = useMemo(() => Array.from({ length: Math.max(1, dias) }, (_, i) => somarDiasISO(inicio, i)), [inicio, dias])
  const indice = Math.max(0, lista.indexOf(valor))

  return (
    <FlatList
      horizontal
      data={lista}
      keyExtractor={d => d}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.lista}
      initialScrollIndex={indice > 2 ? indice - 2 : 0}
      getItemLayout={(_, i) => ({ length: LARGURA + spacing.sm, offset: (LARGURA + spacing.sm) * i, index: i })}
      renderItem={({ item }) => {
        const ativo = item === valor
        const naoAbre = !!fechado?.(item)
        const [, mes, dia] = item.split('-')
        return (
          <Pressable
            onPress={() => onChange(item)}
            disabled={naoAbre}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo, disabled: naoAbre }}
            accessibilityLabel={`${diaSemanaCurto(item)} ${dia}/${mes}${naoAbre ? ', fechado' : ''}`}
            style={[styles.dia, ativo && styles.diaAtivo, naoAbre && styles.diaFechado]}
          >
            <Text style={[styles.semana, ativo && styles.textoAtivo, naoAbre && styles.textoFechado]}>{diaSemanaCurto(item)}</Text>
            <Text style={[styles.numero, ativo && styles.textoAtivo, naoAbre && styles.textoFechado]}>{dia}</Text>
            <Text style={[styles.mes, ativo && styles.textoAtivo, naoAbre && styles.textoFechado]}>/{mes}</Text>
          </Pressable>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  lista: { gap: spacing.sm, paddingVertical: 2 },
  dia: {
    width: LARGURA,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  diaAtivo: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  diaFechado: { backgroundColor: colors.surfaceMuted },
  semana: { ...typography.label.sm, color: colors.textMuted, textTransform: 'uppercase' },
  numero: { ...typography.heading.md, color: colors.text },
  mes: { ...typography.body.sm, color: colors.textMuted },
  textoAtivo: { color: colors.white },
  textoFechado: { color: colors.textFaint, textDecorationLine: 'line-through' },
})
