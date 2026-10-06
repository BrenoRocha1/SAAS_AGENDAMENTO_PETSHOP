import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'
import { COR_APAGADA } from './Secao'

export interface ItemDoRanking {
  chave: string
  titulo: string
  // Linha de apoio embaixo (ex.: "12 atendimentos · ticket médio R$ 80,00").
  detalhe?: string
  // Já formatado (ex.: "R$ 640,00").
  valor: string
  // Quanto este item pesa na barra, de 0 a 1 (parte do total, ou em relação
  // ao maior). Sem ele, a linha fica sem barra.
  parte?: number
  // Texto ao lado da barra (ex.: "42,5%"). Sem ele, só a barra.
  rotuloDaParte?: string
  // Uma barra própria no lugar da de progresso (ex.: BarraEmPartes).
  barra?: ReactNode
  // No avatar, no lugar das iniciais do título (ex.: "—" quando o item não é uma pessoa).
  sigla?: string
  // Ao lado do título (ex.: uma etiqueta com a quantidade).
  etiqueta?: ReactNode
}

// As duas iniciais de um nome: a do primeiro e a do último ("Pedro Henrique" → "PH").
function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? '?').slice(0, 2)
  return letras.toUpperCase()
}

// Lista ordenada (serviços, profissionais, clientes, planos…): nome e valor
// na mesma linha e, embaixo, uma barra com o peso de cada um. `comIniciais`
// põe o avatar com as iniciais — para quando os itens são pessoas.
export function Ranking({ itens, comIniciais = false }: { itens: ItemDoRanking[]; comIniciais?: boolean }) {
  return (
    <View style={styles.lista}>
      {itens.map(item => (
        <View key={item.chave} style={styles.item}>
          {comIniciais && (
            <View style={styles.avatar}>
              <Text style={styles.avatarTexto}>{item.sigla ?? iniciais(item.titulo)}</Text>
            </View>
          )}
          <View style={styles.corpo}>
            <View style={styles.topo}>
              <View style={styles.tituloLinha}>
                <Text style={styles.titulo} numberOfLines={1}>{item.titulo}</Text>
                {item.etiqueta}
              </View>
              <Text style={styles.valor}>{item.valor}</Text>
            </View>
            {(item.barra || item.parte !== undefined) && (
              <View style={styles.barraLinha}>
                {item.barra ?? (
                  <View style={styles.trilho} accessibilityLabel={`Peso de ${item.titulo}`}>
                    <View style={[styles.progresso, { width: `${Math.max(0, Math.min(100, (item.parte ?? 0) * 100))}%` }]} />
                  </View>
                )}
                {item.rotuloDaParte && <Text style={styles.parte}>{item.rotuloDaParte}</Text>}
              </View>
            )}
            {item.detalhe ? <Text style={styles.detalhe}>{item.detalhe}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  )
}

// Etiqueta cinza ao lado do título (o `Badge variant="secondary"` do site).
export function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <View style={styles.etiqueta}>
      <Text style={styles.etiquetaTexto}>{children}</Text>
    </View>
  )
}

const COR_DA_PARTE = {
  sucesso: '#10b981',
  alerta: '#f59e0b',
  primario: colors.primary600,
  neutro: 'rgba(107,114,128,0.35)',
} as const

// Barra em partes coloridas (ex.: recebido em verde, a receber em âmbar e,
// em cinza, o que não tem situação), cada uma do tamanho da sua fatia de `total`.
export function BarraEmPartes({ partes, total, rotulo }: {
  partes: { valor: number; tom: keyof typeof COR_DA_PARTE }[]
  total: number
  rotulo?: string
}) {
  return (
    <View style={[styles.trilho, styles.emPartes]} accessibilityRole="image" accessibilityLabel={rotulo}>
      {partes.map((p, i) => (
        <View key={i} style={{ height: '100%', width: `${total > 0 ? (p.valor / total) * 100 : 0}%`, backgroundColor: COR_DA_PARTE[p.tom] }} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  lista: { gap: 16 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary50, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.primary700 },
  corpo: { flex: 1, minWidth: 0, gap: 6 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tituloLinha: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.text },
  valor: { flexShrink: 0, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  barraLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trilho: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  // Ponta reta, como a barra de progresso do site (o trilho é que arredonda).
  progresso: { height: '100%', backgroundColor: colors.primary600 },
  emPartes: { flexDirection: 'row' },
  parte: { width: 48, textAlign: 'right', fontSize: 12, lineHeight: 16, color: COR_APAGADA, fontVariant: ['tabular-nums'] },
  detalhe: { fontSize: 12, lineHeight: 16.5, color: COR_APAGADA },
  etiqueta: { paddingVertical: 2, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'transparent', backgroundColor: colors.surfaceMuted },
  etiquetaTexto: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#1f2937' },
})
