import { useState } from 'react'
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { IconChevronLeft, IconChevronRight, IconClose, IconImage } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { AVISO_GALERIA, type FotoServico } from '@/lib/galeria'
import { colors } from '@/theme/theme'

// Fotos de referência de um serviço para o cliente (migration 101) — a
// mesma galeria do site (components/servicos/GaleriaServico): um
// botãozinho com o ícone e a quantidade e, ao tocar, a galeria em tela
// cheia. Sem foto, não mostra nada. Abrir não marca o serviço.
export function BotaoGaleriaServico({ fotos, nomeServico }: { fotos: FotoServico[] | undefined; nomeServico: string }) {
  const [aberta, setAberta] = useState(false)
  if (!fotos || fotos.length === 0) return null
  const rotulo = fotos.length === 1 ? 'Ver o modelo' : `Ver ${fotos.length} modelos`
  return (
    <>
      <Pressable onPress={() => setAberta(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${rotulo} de ${nomeServico}`}
        style={({ pressed }) => [styles.botao, pressed && styles.apertado]}>
        <IconImage size={14} color={colors.primary600} />
        <Text style={styles.botaoTexto}>{fotos.length}</Text>
      </Pressable>
      <GaleriaAmpliada visivel={aberta} fotos={fotos} titulo={nomeServico} onFechar={() => setAberta(false)} />
    </>
  )
}

export function GaleriaAmpliada({ visivel, fotos, titulo, inicial = 0, onFechar }: {
  visivel: boolean
  fotos: FotoServico[]
  titulo: string
  inicial?: number
  onFechar: () => void
}) {
  const [i, setI] = useState(inicial)
  const [falhou, setFalhou] = useState<Record<string, boolean>>({})
  const atual = Math.min(i, Math.max(0, fotos.length - 1))
  const foto = fotos[atual]
  const varias = fotos.length > 1
  const ir = (passo: number) => setI((atual + passo + fotos.length) % fotos.length)

  return (
    <Modal visible={visivel} animationType="fade" onRequestClose={onFechar} onShow={() => setI(inicial)} statusBarTranslucent>
      <SafeAreaView style={styles.tela} edges={['top', 'bottom']}>
        <View style={styles.topo}>
          <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
          {varias && <Text style={styles.contador}>{atual + 1} de {fotos.length}</Text>}
          <Pressable onPress={onFechar} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fechar" style={styles.fechar}>
            <IconClose size={20} color={colors.text} />
          </Pressable>
        </View>

        {foto && (
          <ScrollView contentContainerStyle={styles.corpo}>
            <View style={styles.palco}>
              {falhou[foto.id_foto] ? (
                <View style={styles.erro}>
                  <IconImage size={20} color={colors.textMuted} />
                  <Text style={styles.erroTexto}>Não foi possível carregar esta foto.</Text>
                </View>
              ) : (
                <Image key={foto.id_foto} source={{ uri: foto.url }} style={styles.foto} resizeMode="contain" accessibilityLabel={foto.nome}
                  onError={() => setFalhou(f => ({ ...f, [foto.id_foto]: true }))} />
              )}
              {varias && (
                <>
                  <Pressable onPress={() => ir(-1)} accessibilityRole="button" accessibilityLabel="Foto anterior" style={[styles.seta, styles.setaEsq]}>
                    <IconChevronLeft size={20} color={colors.text} />
                  </Pressable>
                  <Pressable onPress={() => ir(1)} accessibilityRole="button" accessibilityLabel="Próxima foto" style={[styles.seta, styles.setaDir]}>
                    <IconChevronRight size={20} color={colors.text} />
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.info}>
              <Text style={styles.nome}>{foto.nome}</Text>
              {foto.descricao ? <Text style={styles.desc}>{foto.descricao}</Text> : null}
              <Text style={styles.aviso}>{AVISO_GALERIA}</Text>
            </View>

            {varias && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tira}>
                {fotos.map((f, j) => (
                  <Pressable key={f.id_foto} onPress={() => setI(j)} accessibilityRole="button" accessibilityLabel={f.nome} accessibilityState={{ selected: j === atual }}
                    style={[styles.tiraItem, j === atual && styles.tiraItemAtivo]}>
                    <Image source={{ uri: f.url_mini }} style={styles.tiraFoto} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  )
}

// Medidas de `galeria-servico.css` do site em 375 de largura.
const styles = StyleSheet.create({
  botao: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 9,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, backgroundColor: colors.surface,
  },
  botaoTexto: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.primary600 },
  apertado: { opacity: 0.7 },
  tela: { flex: 1, backgroundColor: colors.surface },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 18, paddingRight: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  titulo: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  contador: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#858d99' },
  fechar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  corpo: { flexGrow: 1 },
  palco: { height: 420, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  foto: { width: '100%', height: '100%' },
  erro: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  erroTexto: { fontSize: 15, lineHeight: 20, color: colors.textMuted },
  seta: {
    position: 'absolute', top: '50%', marginTop: -20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
  },
  setaEsq: { left: 10 },
  setaDir: { right: 10 },
  info: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 4, gap: 4 },
  nome: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text },
  desc: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  aviso: { marginTop: 4, fontSize: 12, lineHeight: 17, color: '#858d99' },
  tira: { gap: 8, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16 },
  tiraItem: { width: 56, height: 56, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', opacity: 0.7, backgroundColor: colors.surfaceMuted },
  tiraItemAtivo: { borderColor: colors.primary600, opacity: 1 },
  tiraFoto: { width: '100%', height: '100%' },
})
