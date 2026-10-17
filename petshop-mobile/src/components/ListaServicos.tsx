import type { ComponentType, ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Botao } from '@/components/Botao'
import type { IconeProps } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

// Peças da tela de Serviços (serviços e adicionais) — as mesmas de
// `servicos.css` do site em 375 de largura: título com a contagem, texto
// curto, botão largo e a lista branca do jeito das Configurações.

export function TopoSecao({ titulo, total, texto, rotulo, secundario, onNovo }: {
  titulo: string
  total: number
  texto: string
  rotulo: string
  secundario?: boolean
  onNovo: () => void
}) {
  return (
    <View style={styles.topo}>
      <View>
        <View style={styles.tituloLinha}>
          <Text style={styles.titulo}>{titulo}</Text>
          <View style={styles.contagem}><Text style={styles.contagemTexto}>{total}</Text></View>
        </View>
        <Text style={styles.texto}>{texto}</Text>
      </View>
      <Botao rotulo={rotulo} icone="add" variante={secundario ? 'secundario' : 'primario'} onPress={onNovo} style={styles.botao} />
    </View>
  )
}

export function ListaBranca({ children }: { children: ReactNode }) {
  return <View style={styles.lista}>{children}</View>
}

export function LinhaServico({ icone: Icone, nome, inativo, resumo, primeira, onPress, children }: {
  icone: ComponentType<IconeProps>
  nome: string
  inativo?: boolean
  resumo: ReactNode
  primeira: boolean
  onPress: () => void
  // O que fica à direita (promoção, chave).
  children?: ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      // Sem papel de botão: no web viraria <button> com a chave e a
      // promoção (outros botões) dentro.
      accessibilityLabel={`Editar ${nome}`}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.bg }]}
    >
      {!primeira && <View style={styles.divisor} />}
      <View style={[styles.icone, inativo && { opacity: 0.55 }]}><Icone size={18} color={colors.primary600} /></View>
      <View style={styles.textos}>
        <View style={styles.nomeLinha}>
          <Text style={[styles.nome, inativo && { color: colors.textMuted }]} numberOfLines={2}>{nome}</Text>
          {inativo && <View style={styles.selo}><Text style={styles.seloTexto}>Inativo</Text></View>}
        </View>
        <Text style={styles.resumo} numberOfLines={2}>{resumo}</Text>
      </View>
      {children}
    </Pressable>
  )
}

export const estilosLista = StyleSheet.create({
  riscado: { textDecorationLine: 'line-through', opacity: 0.7 },
})

const styles = StyleSheet.create({
  topo: { gap: 12, marginBottom: 12 },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontFamily: FONTE_TITULO, fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text },
  contagem: { minWidth: 24, height: 22, paddingHorizontal: 8, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  contagemTexto: { fontSize: 12, lineHeight: 15, fontWeight: '700', color: colors.primary600 },
  texto: { marginTop: 2, fontSize: 13, lineHeight: 18.85, color: colors.textMuted },
  botao: { minHeight: 46, borderRadius: 10 },
  lista: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
  divisor: { position: 'absolute', top: 0, left: 62, right: 0, height: 1, backgroundColor: colors.border },
  icone: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  textos: { flex: 1, minWidth: 0, gap: 1 },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { flexShrink: 1, fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text },
  selo: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.surfaceMuted },
  seloTexto: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: '#858d99' },
  resumo: { fontSize: 13, lineHeight: 18.2, color: colors.textMuted },
})
