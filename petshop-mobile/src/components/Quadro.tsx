import type { ComponentType, ReactNode } from 'react'
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { IconDog, type IconeProps } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { coresStatus } from '@/lib/statusAgendamento'
import { colors } from '@/theme/theme'

// As peças do quadro (Kanban) do site em largura de celular — as etapas uma
// embaixo da outra, cada uma com a faixa colorida, o nome e a contagem, e os
// cards dentro. Usadas no Gestor de Agendamentos e no quadro do TaxiDog.

const COR_APAGADA = '#858d99'

export function ColunasDoQuadro({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.colunas, style]}>{children}</View>
}

// `status`: de qual etapa do atendimento são as cores da faixa e da
// contagem (amarelo, azul, roxo, verde).
export function ColunaDoQuadro({ titulo, status, contagem, children }: {
  titulo: string
  status: string
  contagem: number
  children: ReactNode
}) {
  const cor = coresStatus(status)
  return (
    <View style={styles.coluna}>
      <View style={[styles.colunaTopo, { borderTopColor: cor.solid }]}>
        <Text style={styles.colunaTitulo}>{titulo}</Text>
        <View style={[styles.contagem, { backgroundColor: cor.bg, borderColor: cor.ring }]}>
          <Text style={[styles.contagemTexto, { color: cor.fg }]}>{contagem}</Text>
        </View>
      </View>
      <View style={styles.colunaCorpo}>{children}</View>
    </View>
  )
}

export function ColunaVazia({ children }: { children: ReactNode }) {
  return <Text style={styles.colunaVazia}>{children}</Text>
}

export function CartaoDoQuadro({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    // Sem papel de botão: o card tem botões dentro (a etapa seguinte, a escolha
    // do TaxiDog), e botão dentro de botão não existe na web.
    <Pressable onPress={onPress} accessibilityHint="Abre os detalhes" style={({ pressed }) => [styles.cartao, pressed && styles.cartaoPressionado]}>
      {children}
    </Pressable>
  )
}

// Horário à esquerda (com o dia, quando não é o dia mostrado) e valor à direita.
export function TopoDoCartao({ hora, dia, valor }: { hora: string; dia?: string | null; valor: string }) {
  return (
    <View style={styles.cartaoTopo}>
      <Text style={styles.hora}>
        {hora}
        {dia ? <Text style={styles.dia}>{`  ${dia}`}</Text> : null}
      </Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  )
}

export function PetDoCartao({ foto, nome, descricao }: { foto: string | null | undefined; nome: string; descricao?: string | null }) {
  return (
    <View style={styles.cartaoPet}>
      <View style={styles.foto}>
        {foto ? <Image source={{ uri: foto }} style={styles.fotoImagem} accessibilityLabel={nome} /> : <IconDog size={14} color={COR_APAGADA} />}
      </View>
      <View style={styles.cartaoPetTexto}>
        <Text style={styles.petNome}>{nome}</Text>
        {descricao ? <Text style={styles.petDescricao}>{descricao}</Text> : null}
      </View>
    </View>
  )
}

// `final`: a última linha antes do rodapé (sem o vão de baixo).
// `cortada`: uma linha só, cortando o que não couber (endereço).
export function LinhaDoCartao({ children, final, cortada }: { children: ReactNode; final?: boolean; cortada?: boolean }) {
  return <Text style={[styles.linha, final && styles.linhaFinal]} numberOfLines={cortada ? 1 : undefined}>{children}</Text>
}

// Selo de texto comum (`.badge` sem maiúsculas): tipo de transporte, rota,
// situação da corrida. `tom` = etapa de onde vêm as cores, ou cinza.
export function EtiquetaDoQuadro({ tom = 'neutro', children }: { tom?: string; children: ReactNode }) {
  const cor = tom === 'neutro' ? { bg: colors.border, fg: colors.textMuted, ring: colors.borderStrong } : coresStatus(tom)
  return (
    <View style={[styles.etiqueta, { backgroundColor: cor.bg, borderColor: cor.ring }]}>
      <Text style={[styles.etiquetaTexto, { color: cor.fg }]}>{children}</Text>
    </View>
  )
}

export function EtiquetasDoCartao({ children }: { children: ReactNode }) {
  return <View style={styles.etiquetas}>{children}</View>
}

// Rodapé do card, depois do traço: o profissional ou o TaxiDog responsável.
export function PeDoCartao({ icone: Icone, tamanho = 13, children }: { icone: ComponentType<IconeProps>; tamanho?: number; children: ReactNode }) {
  return (
    <View style={styles.pe}>
      <Icone size={tamanho} color={COR_APAGADA} />
      {typeof children === 'string' ? <Text style={styles.peTexto}>{children}</Text> : children}
    </View>
  )
}

// A ação do card (`.kanban-card-acao`): o botão da etapa seguinte, na
// largura toda, ou um aviso curto no lugar dele.
export function AcaoDoCartao({ children }: { children: ReactNode }) {
  return <View style={styles.acao}>{children}</View>
}

export function NotaDoCartao({ children }: { children: ReactNode }) {
  return <Text style={styles.nota}>{children}</Text>
}

const styles = StyleSheet.create({
  colunas: { gap: 20 },
  coluna: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  colunaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  colunaTitulo: { fontSize: 15, lineHeight: 24, fontWeight: '700', color: colors.text },
  contagem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  contagemTexto: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', letterSpacing: 0.48 },
  colunaCorpo: { padding: 12, gap: 12 },
  colunaVazia: { padding: 12, fontSize: 14, lineHeight: 20, color: COR_APAGADA },

  cartao: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  cartaoPressionado: { borderColor: colors.borderStrong },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  hora: { fontSize: 14, lineHeight: 22.4, fontWeight: '700', color: colors.text },
  dia: { fontSize: 12, fontWeight: '400', color: COR_APAGADA },
  valor: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.successFg },
  cartaoPet: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cartaoPetTexto: { flexShrink: 1 },
  foto: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fotoImagem: { width: '100%', height: '100%' },
  petNome: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text },
  petDescricao: { fontSize: 12, lineHeight: 16, color: COR_APAGADA },
  linha: { fontSize: 13, lineHeight: 20.8, color: colors.textDim, marginBottom: 2 },
  linhaFinal: { marginBottom: 0 },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  etiqueta: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  etiquetaTexto: { fontSize: 12, lineHeight: 19.2, fontWeight: '600' },
  pe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  peTexto: { flexShrink: 1, fontSize: 12, lineHeight: 19.2, color: COR_APAGADA },
  acao: { marginTop: 8 },
  nota: { marginTop: 8, fontSize: 12, lineHeight: 16, color: COR_APAGADA },
})
