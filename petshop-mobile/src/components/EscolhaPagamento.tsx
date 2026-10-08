import type { ComponentType } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconCreditCard, IconMoney, IconQrCode, type IconeProps } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { ROTULO_FORMA_PAGAMENTO, type FormaPagamento } from '@/lib/pagamento'
import { colors } from '@/theme/theme'

// O desenho de cada forma de pagamento, como no site.
export const ICONE_FORMA: Record<FormaPagamento, ComponentType<IconeProps>> = {
  pix: IconQrCode,
  cartao_credito: IconCreditCard,
  cartao_debito: IconCreditCard,
  dinheiro: IconMoney,
}

// As formas de pagamento em botões, duas por linha (`.na-formas` do site):
// brancos com borda fina, o escolhido em índigo claro. Usado no "Novo
// agendamento" e no detalhe do agendamento.
export function FormasDePagamento({ formas, valor, onChange, desativado }: {
  formas: FormaPagamento[]
  valor: FormaPagamento | '' | null
  onChange: (forma: FormaPagamento) => void
  desativado?: boolean
}) {
  return (
    <View style={styles.formas}>
      {formas.map(f => {
        const Icone = ICONE_FORMA[f]
        const ativa = valor === f
        return (
          <View key={f} style={styles.formaCaixa}>
            <Pressable
              onPress={() => { if (!ativa) onChange(f) }}
              disabled={desativado}
              accessibilityRole="button"
              accessibilityState={{ selected: ativa, disabled: !!desativado }}
              style={[styles.forma, ativa && styles.formaAtiva, desativado && styles.apagado]}
            >
              <Icone size={17} color={colors.primary600} />
              <Text style={[styles.formaTexto, ativa && styles.textoAtivo]} numberOfLines={1}>{ROTULO_FORMA_PAGAMENTO[f]}</Text>
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}

// Escolha entre duas ou três opções (`.na-seg` do site): trilha branca, a
// escolhida em índigo claro. `cheio`: ocupa a largura toda. `largo`: da
// altura de um campo (Macho/Fêmea ao lado da data de nascimento).
export function Segmentos<T extends string>({ rotulo, opcoes, valor, onChange, desativado, cheio, largo }: {
  // Nome do grupo para o leitor de tela.
  rotulo: string
  opcoes: { valor: T; rotulo: string }[]
  valor: T | null
  onChange: (valor: T) => void
  desativado?: boolean
  cheio?: boolean
  largo?: boolean
}) {
  return (
    <View style={[styles.seg, desativado && styles.apagado]} accessibilityLabel={rotulo}>
      {opcoes.map(o => {
        const ativo = o.valor === valor
        return (
          <Pressable
            key={o.valor}
            onPress={() => { if (!ativo) onChange(o.valor) }}
            disabled={desativado}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo, disabled: !!desativado }}
            style={[styles.segBotao, (cheio || largo) && styles.segCresce, largo && styles.segBotaoLargo, ativo && styles.segAtivo]}
          >
            <Text style={[styles.segTexto, largo && styles.segTextoLargo, ativo && styles.textoAtivo]} numberOfLines={1}>{o.rotulo}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // Duas por linha com 8 de vão: cada caixa tem 50% e 4 de respiro em volta.
  formas: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  formaCaixa: { width: '50%', padding: 4 },
  forma: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  formaAtiva: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.08)' },
  formaTexto: { flexShrink: 1, fontSize: 13, lineHeight: 13, fontWeight: '600', color: '#1f2937' },
  textoAtivo: { color: colors.primary300 },
  apagado: { opacity: 0.6 },

  seg: { flexDirection: 'row', padding: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  segBotao: { height: 32, paddingHorizontal: 11.2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  segCresce: { flex: 1, paddingHorizontal: 6.4 },
  segBotaoLargo: { height: 44 },
  segAtivo: { backgroundColor: 'rgba(79,70,229,0.12)' },
  segTexto: { fontSize: 13, lineHeight: 13, fontWeight: '600', color: colors.textMuted },
  segTextoLargo: { fontSize: 15, lineHeight: 15 },
})
