import type { ComponentType } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import type { IconeProps } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'

type Variante = 'primario' | 'secundario' | 'sucesso' | 'perigo' | 'fantasma'

interface Props {
  rotulo: string
  onPress: () => void
  variante?: Variante
  // Um dos desenhos do site (components/IconesDoSite), à esquerda do texto.
  icone?: ComponentType<IconeProps>
  desativado?: boolean
  carregando?: boolean
  style?: StyleProp<ViewStyle>
}

// Cores e medidas do `.btn.btn-sm` do site no celular: 42 de altura, 12 de
// respiro, letra de 13. Sucesso e perigo são os tons claros do site (fundo
// a 15%, contorno a 30%), não os botões cheios.
const CORES: Record<Variante, { fundo: string; borda: string; texto: string }> = {
  primario: { fundo: colors.primary600, borda: colors.primary600, texto: colors.white },
  secundario: { fundo: colors.border, borda: colors.borderStrong, texto: colors.text },
  sucesso: { fundo: 'rgba(16,185,129,0.15)', borda: 'rgba(16,185,129,0.3)', texto: colors.successFg },
  perigo: { fundo: 'rgba(239,68,68,0.15)', borda: 'rgba(239,68,68,0.3)', texto: colors.dangerFg },
  fantasma: { fundo: 'transparent', borda: 'transparent', texto: colors.textMuted },
}

// Botão pequeno das janelas de detalhe (ações do agendamento, "Adicionar
// TaxiDog", "Salvar transporte"). Para o botão grande de tela, ver Botao.
export function BotaoPequeno({ rotulo, onPress, variante = 'secundario', icone: Icone, desativado, carregando, style }: Props) {
  const cor = CORES[variante]
  const parado = desativado || carregando
  return (
    <Pressable
      onPress={onPress}
      disabled={parado}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!parado }}
      style={({ pressed }) => [
        styles.botao,
        { backgroundColor: cor.fundo, borderColor: cor.borda },
        (pressed || parado) && styles.apagado,
        style,
      ]}
    >
      {carregando ? (
        <ActivityIndicator size="small" color={cor.texto} />
      ) : (
        <>
          {Icone && <Icone size={14} color={cor.texto} />}
          <Text style={[styles.texto, { color: cor.texto }]} numberOfLines={1}>{rotulo}</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  botao: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  apagado: { opacity: 0.6 },
  texto: { fontSize: 13, lineHeight: 13, fontWeight: '600' },
})
