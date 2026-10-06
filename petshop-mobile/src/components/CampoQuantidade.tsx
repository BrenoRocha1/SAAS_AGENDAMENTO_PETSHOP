import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Campo } from '@/components/Campo'
import { Text } from '@/components/Texto'
import { paraNumero } from '@/lib/mascaras'
import { SUBUNIDADE, rotuloUnidade, unidadeFracionavel, type UnidadeVenda } from '@/lib/produto'
import { colors } from '@/theme/theme'

interface Props {
  rotulo: string
  obrigatorio?: boolean
  unidade: UnidadeVenda
  valor: string
  onChange: (texto: string) => void
  // true = digitando em g/ml (só existe em produto vendido por kg ou litro).
  usarSub: boolean
  onUsarSub: (v: boolean) => void
  nota?: ReactNode
}

// Quantidade de estoque — o CampoQuantidade do site: em produto vendido
// por kg/litro dá para digitar em g/ml ("500 g" em vez de "0,5 kg").
export function CampoQuantidade({ rotulo, obrigatorio, unidade, valor, onChange, usarSub, onUsarSub, nota }: Props) {
  const sub = SUBUNIDADE[unidade]
  const emSub = usarSub && !!sub
  return (
    <Campo
      rotulo={rotulo}
      obrigatorio={obrigatorio}
      value={valor}
      onChangeText={onChange}
      keyboardType={emSub || !unidadeFracionavel(unidade) ? 'number-pad' : 'decimal-pad'}
      placeholder="0"
      maxLength={10}
      nota={nota}
      lateral={sub ? (
        <View style={styles.unidades}>
          <Pressable onPress={() => onUsarSub(false)} accessibilityRole="button" accessibilityState={{ selected: !emSub }} style={styles.unidade}>
            <Text style={[styles.texto, !emSub && styles.ativa]}>{rotuloUnidade(unidade)}</Text>
          </Pressable>
          <Pressable onPress={() => onUsarSub(true)} accessibilityRole="button" accessibilityState={{ selected: emSub }} style={styles.unidade}>
            <Text style={[styles.texto, emSub && styles.ativa]}>{sub.label}</Text>
          </Pressable>
        </View>
      ) : undefined}
    />
  )
}

// O que foi digitado, já na unidade em que o produto é vendido (a única
// guardada no banco). Vazio vale zero; texto inválido volta NaN.
export function quantidadeBase(texto: string, unidade: UnidadeVenda, usarSub: boolean): number {
  if (!texto.trim()) return 0
  const n = paraNumero(texto)
  const sub = SUBUNIDADE[unidade]
  return usarSub && sub ? Math.round(n * sub.fator * 1e6) / 1e6 : n
}

const styles = StyleSheet.create({
  unidades: { flexDirection: 'row', gap: 4 },
  // `.btn.btn-ghost.btn-sm` com 8 de respiro: 42 de altura, sem fundo.
  unidade: { height: 42, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  texto: { fontSize: 13, lineHeight: 13, color: colors.textMuted },
  ativa: { fontWeight: '700' },
})
