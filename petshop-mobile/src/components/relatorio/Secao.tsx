import type { ComponentType, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import type { IconeProps } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

// Blocos dos relatórios — os mesmos de petshop-app/src/components/relatorio
// (indicador, seção, números de apoio, ranking e gráfico), com as medidas do
// site em 375 de largura.

// Seção de relatório: cartão com título, uma linha dizendo o que os números
// são e uma ação (ex.: exportar). O que vai dentro fica empilhado com o
// mesmo espaço entre um bloco e outro.
export function Secao({ titulo, descricao, icone: Icone, acao, children }: {
  titulo: string
  descricao?: string
  icone?: ComponentType<IconeProps>
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <View style={styles.cartao}>
      <View style={styles.topo}>
        <View style={styles.titulos}>
          <View style={styles.tituloLinha}>
            {Icone && <Icone size={16} color={colors.primary600} style={styles.semEncolher} />}
            <Text style={styles.titulo}>{titulo}</Text>
          </View>
          {descricao ? <Text style={styles.descricao}>{descricao}</Text> : null}
        </View>
        {acao}
      </View>
      <View style={styles.conteudo}>{children}</View>
    </View>
  )
}

// As seções de um relatório, uma embaixo da outra.
export function Pilha({ children }: { children: ReactNode }) {
  return <View style={styles.pilha}>{children}</View>
}

// Parte de uma seção com um subtítulo pequeno (ex.: "Planos mais vendidos").
export function GrupoDaSecao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={styles.grupo}>
      <Text style={styles.grupoTitulo}>{titulo}</Text>
      {children}
    </View>
  )
}

// Nota de rodapé de uma seção (como os números foram contados).
export function NotaDaSecao({ children }: { children: ReactNode }) {
  return <Text style={styles.nota}>{children}</Text>
}

// Seção sem nada para mostrar no período.
export function SecaoVazia({ children }: { children: ReactNode }) {
  return <Text style={styles.vazia}>{children}</Text>
}

export const COR_APAGADA = '#6b7280'

const styles = StyleSheet.create({
  cartao: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  topo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: 20 },
  titulos: { flexShrink: 1, minWidth: 0, gap: 4 },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  semEncolher: { flexShrink: 0 },
  titulo: { flexShrink: 1, fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text },
  descricao: { fontSize: 13, lineHeight: 17.875, color: COR_APAGADA },
  conteudo: { paddingHorizontal: 20, paddingBottom: 20, gap: 20 },
  pilha: { gap: 24 },
  grupo: { gap: 12 },
  grupoTitulo: { fontSize: 12, lineHeight: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, color: COR_APAGADA },
  nota: { fontSize: 12, lineHeight: 19.5, color: COR_APAGADA },
  vazia: { fontSize: 14, lineHeight: 20, color: COR_APAGADA },
})
