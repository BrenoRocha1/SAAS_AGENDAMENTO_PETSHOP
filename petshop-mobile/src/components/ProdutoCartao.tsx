import { Image, Pressable, StyleSheet, View } from 'react-native'
import { IconGrid, IconList, IconPackage } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, shadow } from '@/theme/theme'

export type ModoVisualizacao = 'lista' | 'grade'

// Lista | grade (`.view-toggle` do site, ao lado da busca): trilha branca, a
// escolhida em índigo claro.
export function TrocaDeVisualizacao({ modo, onChange }: { modo: ModoVisualizacao; onChange: (modo: ModoVisualizacao) => void }) {
  const opcoes = [
    { valor: 'lista', rotulo: 'Ver em lista', Icone: IconList },
    { valor: 'grade', rotulo: 'Ver em grade', Icone: IconGrid },
  ] as const
  return (
    <View style={styles.troca}>
      {opcoes.map(({ valor, rotulo, Icone }) => (
        <Pressable
          key={valor}
          onPress={() => onChange(valor)}
          accessibilityRole="button"
          accessibilityLabel={rotulo}
          accessibilityState={{ selected: modo === valor }}
          style={[styles.trocaBotao, modo === valor && styles.trocaAtiva]}
        >
          <Icone size={15} color={modo === valor ? colors.primary300 : '#858d99'} />
        </Pressable>
      ))}
    </View>
  )
}

// Card de produto da grade — o `.prod-card` do site no celular
// (petshop-app/src/components/lojista/produtos-grade.css): a foto em cima
// (4:3) com o selo do estoque por cima, o nome, a categoria, o preço e
// quanto tem em estoque. Dois por linha; o card abre a janela do produto.
export function ProdutoCartao({ nome, categoria, foto, preco, unidade, estoque, selo, inativo, onPress }: {
  nome: string
  categoria: string | null
  foto?: string | null
  // "R$ 18,90" e "kg".
  preco: string
  unidade: string
  // "45,5 kg".
  estoque: string
  // Estoque baixo ou zerado: o selo por cima da foto.
  selo?: { texto: string; tom: 'baixo' | 'zerado' } | null
  inativo?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${nome}, ver e ajustar o estoque`}
      style={({ pressed }) => [styles.card, pressed && styles.pressionado]}
    >
      <View style={styles.foto}>
        {foto
          ? <Image source={{ uri: foto }} style={[styles.imagem, inativo && styles.apagada]} resizeMode="cover" />
          : <IconPackage size={38} color={colors.primary300} style={inativo ? styles.apagada : undefined} />}
        {(selo || inativo) && (
          <View style={styles.selos}>
            {selo && (
              <View style={styles.selo}>
                <Text style={[styles.seloTexto, { color: selo.tom === 'zerado' ? colors.dangerFg : colors.warningFg }]}>{selo.texto}</Text>
              </View>
            )}
            {inativo && (
              <View style={styles.selo}>
                <Text style={styles.seloTexto}>Inativo</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.nome} numberOfLines={2}>{nome}</Text>
        <Text style={styles.sub} numberOfLines={1}>{categoria ?? 'Sem categoria'}</Text>
        <Text style={styles.preco}>
          {preco} <Text style={styles.unidade}>/ {unidade}</Text>
        </Text>
        <View style={styles.pe}>
          <Text style={styles.peTexto}>{estoque} em estoque</Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // `.prod-busca-linha .view-toggle`
  troca: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  trocaBotao: { width: 38, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  trocaAtiva: { backgroundColor: 'rgba(79,70,229,0.12)' },

  card: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden', ...shadow.sm },
  pressionado: { borderColor: colors.primary200 },
  foto: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(79,70,229,0.12)' },
  imagem: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  apagada: { opacity: 0.45 },
  selos: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  selo: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)' },
  seloTexto: { fontSize: 11, lineHeight: 17.6, fontWeight: '700', color: colors.textMuted },
  info: { flex: 1, gap: 2, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12 },
  nome: { fontSize: 15, lineHeight: 19.5, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, lineHeight: 17.55, color: '#858d99' },
  // `margin-top: auto`: o preço e o estoque ficam no pé do card, mesmo
  // quando o vizinho da linha tem o nome em duas linhas.
  preco: { marginTop: 'auto', paddingTop: 6, fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 21.6, fontWeight: '800', letterSpacing: -0.16, color: colors.text },
  unidade: { fontFamily: undefined, fontSize: 12, lineHeight: 16.2, fontWeight: '500', letterSpacing: 0, color: '#858d99' },
  pe: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  peTexto: { fontSize: 13, lineHeight: 17.55, color: colors.textDim },
})
