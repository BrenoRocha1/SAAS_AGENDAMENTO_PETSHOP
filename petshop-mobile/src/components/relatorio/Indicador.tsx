import type { ComponentType, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { IconTrendDown, IconTrendUp, type IconeProps } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { variacaoPercentual } from '@/lib/relatorios'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'
import { COR_APAGADA } from './Secao'

// Como o número se compara com o período anterior: "+18,5%" (em destaque)
// e "vs. período anterior" (ao lado, apagado).
export interface Variacao {
  sentido: 'alta' | 'baixa' | 'igual' | 'novo'
  texto: string
  complemento: string
}

// Como `atual` se compara com o número do período anterior — sempre a
// partir de dois números reais. Nulo quando não havia nada antes nem agora.
export function compararComAnterior(atual: number, anterior: number): Variacao | null {
  if (anterior === 0) {
    return atual === 0 ? null : { sentido: 'novo', texto: 'Novo', complemento: 'nada no período anterior' }
  }
  const pct = variacaoPercentual(atual, anterior)
  if (pct === null || Math.abs(pct) < 0.05) return { sentido: 'igual', texto: 'Igual', complemento: 'ao período anterior' }
  return {
    sentido: pct > 0 ? 'alta' : 'baixa',
    texto: `${pct > 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`,
    complemento: 'vs. período anterior',
  }
}

const COR_VARIACAO: Record<Variacao['sentido'], string> = {
  alta: colors.successFg,
  baixa: colors.dangerFg,
  igual: COR_APAGADA,
  novo: colors.successFg,
}

// Os indicadores, um embaixo do outro (no site, uma coluna no celular).
export function GradeIndicadores({ children }: { children: ReactNode }) {
  return <View style={styles.grade}>{children}</View>
}

// Indicador: o que é (com o ícone ao lado), o número e, embaixo, a
// comparação com o período anterior e/ou uma explicação curta.
export function Indicador({ rotulo, valor, aoLado, icone: Icone, variacao, detalhe }: {
  rotulo: string
  valor: string
  // Ao lado do número (ex.: as estrelas da média de avaliações).
  aoLado?: ReactNode
  icone: ComponentType<IconeProps>
  variacao?: Variacao | null
  detalhe?: string
}) {
  return (
    <View style={styles.cartao}>
      <View style={styles.topo}>
        <Text style={styles.rotulo}>{rotulo}</Text>
        <Icone size={20} color={colors.primary600} style={styles.icone} />
      </View>
      <View style={styles.conteudo}>
        <View style={styles.valorLinha}>
          <Text style={styles.valor}>{valor}</Text>
          {aoLado}
        </View>
        {(variacao || detalhe) && (
          <View style={styles.apoio}>
            {variacao && (
              <>
                <View style={styles.variacao}>
                  {variacao.sentido === 'alta' && <IconTrendUp size={12} color={COR_VARIACAO.alta} />}
                  {variacao.sentido === 'baixa' && <IconTrendDown size={12} color={COR_VARIACAO.baixa} />}
                  <Text style={[styles.apoioTexto, styles.forte, { color: COR_VARIACAO[variacao.sentido] }]}>{variacao.texto}</Text>
                </View>
                <Text style={styles.apoioTexto}>{variacao.complemento}</Text>
              </>
            )}
            {variacao && detalhe && <Text style={styles.apoioTexto}>·</Text>}
            {detalhe && <Text style={styles.apoioTexto}>{detalhe}</Text>}
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  grade: { gap: 16 },
  cartao: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  // A linha tem 27 de altura: o ícone fica no alto dela e o rótulo, no meio.
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, height: 27, marginTop: 20, marginHorizontal: 20, marginBottom: 8 },
  rotulo: { flexShrink: 1, fontSize: 14, lineHeight: 19.25, fontWeight: '500', color: COR_APAGADA },
  icone: { alignSelf: 'flex-start', flexShrink: 0 },
  conteudo: { paddingHorizontal: 20, paddingBottom: 20 },
  valorLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  valor: { fontFamily: FONTE_TITULO, fontSize: 24, lineHeight: 32, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  apoio: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, marginTop: 4 },
  variacao: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  apoioTexto: { fontSize: 12, lineHeight: 16.5, color: COR_APAGADA },
  forte: { fontWeight: '600' },
})
