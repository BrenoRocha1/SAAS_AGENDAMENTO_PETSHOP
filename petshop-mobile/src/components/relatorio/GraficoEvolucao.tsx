import { useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as TextoSvg } from 'react-native-svg'
import { Text } from '@/components/Texto'
import { formatarReais } from '@/lib/taxidog'
import { colors } from '@/theme/theme'
import { COR_APAGADA } from './Secao'

export interface PontoDaEvolucao {
  // Rótulo do eixo (ex.: "18/09").
  rotulo: string
  faturamento: number
  vendas: number
}

// Medidas do gráfico do site (Recharts): 256 de altura; a área começa 68 à
// esquerda (4 de margem + 64 do eixo), 8 antes da direita e do topo, e
// deixa 30 embaixo para as datas.
const ALTURA = 256
const ESQUERDA = 68
const DIREITA = 8
const TOPO = 8
const BASE = ALTURA - 30
const COR_DO_EIXO = '#666666'
const LARGURA_DA_DATA = 32
const VAO_ENTRE_DATAS = 28

// Eixo: "R$ 1,2 mil" em vez de "R$ 1.200,00", para caber.
const reaisCurto = (v: number) =>
  v >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil` : `R$ ${Math.round(v)}`

// Cinco marcas "redondas" de zero até cobrir o maior valor (a mesma conta
// do Recharts: 640 → 0, 200, 400, 600, 800).
function marcasDoEixo(maximo: number): number[] {
  if (!(maximo > 0)) return [0, 1, 2, 3, 4]
  for (let correcao = 0; ; correcao++) {
    const bruto = maximo / 4
    const digitos = Math.floor(Math.log10(bruto)) + 1
    const base = Math.pow(10, digitos)
    const escala = digitos !== 1 ? 0.05 : 0.1
    const passo = Number(((Math.ceil(bruto / base / escala) + correcao) * escala * base).toPrecision(12))
    if (Math.ceil(maximo / passo) <= 4) return [0, 1, 2, 3, 4].map(i => Number((passo * i).toPrecision(12)))
  }
}

interface Coordenada { x: number; y: number }

// Curva suave que não passa do ponto (a "monotone" do d3, usada pelo site).
function curva(p: Coordenada[]): string {
  const n = p.length
  if (n === 0) return ''
  if (n === 1) return `M${p[0].x},${p[0].y}`
  if (n === 2) return `M${p[0].x},${p[0].y}L${p[1].x},${p[1].y}`
  const sinal = (v: number) => (v < 0 ? -1 : 1)
  const inclinacao3 = (a: Coordenada, b: Coordenada, c: Coordenada) => {
    const h0 = b.x - a.x
    const h1 = c.x - b.x
    const s0 = (b.y - a.y) / h0
    const s1 = (c.y - b.y) / h1
    const meio = (s0 * h1 + s1 * h0) / (h0 + h1)
    return (sinal(s0) + sinal(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(meio)) || 0
  }
  const inclinacao2 = (a: Coordenada, b: Coordenada, t: number) => {
    const h = b.x - a.x
    return h ? (3 * (b.y - a.y) / h - t) / 2 : t
  }
  const t: number[] = new Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) t[i] = inclinacao3(p[i - 1], p[i], p[i + 1])
  t[0] = inclinacao2(p[0], p[1], t[1])
  t[n - 1] = inclinacao2(p[n - 2], p[n - 1], t[n - 2])
  const r = (v: number) => Math.round(v * 1000) / 1000
  let d = `M${r(p[0].x)},${r(p[0].y)}`
  for (let i = 0; i < n - 1; i++) {
    const dx = (p[i + 1].x - p[i].x) / 3
    d += `C${r(p[i].x + dx)},${r(p[i].y + dx * t[i])},${r(p[i + 1].x - dx)},${r(p[i + 1].y - dx * t[i + 1])},${r(p[i + 1].x)},${r(p[i + 1].y)}`
  }
  return d
}

// Quais datas aparecem embaixo: a última sempre e, voltando, as que cabem
// com folga entre uma e outra.
function datasVisiveis(xs: number[], largura: number): { indice: number; centro: number }[] {
  const visiveis: { indice: number; centro: number }[] = []
  let limite = Infinity
  for (let i = xs.length - 1; i >= 0; i--) {
    let inicio = xs[i] - LARGURA_DA_DATA / 2
    let fim = xs[i] + LARGURA_DA_DATA / 2
    const ultima = i === xs.length - 1
    // A última recua para caber inteira na largura do gráfico.
    if (ultima && fim > largura) { fim = largura; inicio = fim - LARGURA_DA_DATA }
    if (ultima || (fim <= limite - VAO_ENTRE_DATAS && inicio >= 0)) {
      visiveis.push({ indice: i, centro: (inicio + fim) / 2 })
      limite = inicio
    }
  }
  return visiveis
}

// Faturamento por dia em área. Tocar no gráfico mostra o dia mais próximo
// (valor e número de vendas).
export function GraficoEvolucao({ pontos, rotuloDasVendas = 'Vendas' }: {
  pontos: PontoDaEvolucao[]
  // Como chamar a contagem na dica (ex.: "Atendimentos").
  rotuloDasVendas?: string
}) {
  const [largura, setLargura] = useState(0)
  const [ativo, setAtivo] = useState<number | null>(null)
  // No navegador o toque final chega sem a posição: ela é guardada quando o
  // dedo encosta.
  const xDoToque = useRef(0)

  const marcas = marcasDoEixo(Math.max(0, ...pontos.map(p => p.faturamento)))
  const topoDaEscala = marcas[marcas.length - 1] || 1
  const larguraDaArea = Math.max(0, largura - ESQUERDA - DIREITA)
  const xDe = (i: number) => (pontos.length > 1 ? ESQUERDA + (larguraDaArea * i) / (pontos.length - 1) : ESQUERDA + larguraDaArea / 2)
  const yDe = (v: number) => BASE - ((BASE - TOPO) * v) / topoDaEscala
  const coordenadas = pontos.map((p, i) => ({ x: xDe(i), y: yDe(p.faturamento) }))
  const linha = curva(coordenadas)
  const area = coordenadas.length > 1
    ? `${linha}L${coordenadas[coordenadas.length - 1].x},${BASE}L${coordenadas[0].x},${BASE}Z`
    : ''

  function guardarToque(e: GestureResponderEvent) {
    xDoToque.current = e.nativeEvent.locationX
  }

  function tocar() {
    if (pontos.length === 0 || larguraDaArea <= 0) return
    const x = xDoToque.current
    const passo = pontos.length > 1 ? larguraDaArea / (pontos.length - 1) : 1
    const indice = Math.max(0, Math.min(pontos.length - 1, Math.round((x - ESQUERDA) / passo)))
    setAtivo(atual => (atual === indice ? null : indice))
  }

  const escolhido = ativo !== null && ativo < pontos.length ? ativo : null
  const dica = escolhido !== null ? pontos[escolhido] : null
  // A dica fica do lado do ponto que tem mais espaço.
  const dicaNaEsquerda = escolhido !== null && coordenadas[escolhido].x > largura / 2

  return (
    <View style={styles.caixa} onLayout={e => setLargura(e.nativeEvent.layout.width)}>
      {largura > 0 && (
        <Pressable onPressIn={guardarToque} onPress={tocar} accessibilityRole="image" accessibilityLabel="Gráfico do faturamento por dia">
          <Svg width={largura} height={ALTURA}>
            <Defs>
              <LinearGradient id="evolucaoFaturamento" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.primary600} stopOpacity={0.25} />
                <Stop offset="100%" stopColor={colors.primary600} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            {marcas.map(m => (
              <Line key={`g${m}`} x1={ESQUERDA} x2={largura - DIREITA} y1={yDe(m)} y2={yDe(m)} stroke={colors.border} strokeOpacity={0.5} strokeDasharray="3 3" />
            ))}
            {marcas.map(m => (
              <TextoSvg key={`y${m}`} x={ESQUERDA - 8} y={yDe(m) + 4.3} textAnchor="end" fontSize={12} fontFamily="Inter_400Regular" fill={COR_DO_EIXO}>
                {reaisCurto(m)}
              </TextoSvg>
            ))}
            {datasVisiveis(coordenadas.map(c => c.x), largura).map(d => (
              <TextoSvg key={`x${d.indice}`} x={d.centro} y={BASE + 22} textAnchor="middle" fontSize={12} fontFamily="Inter_400Regular" fill={COR_DO_EIXO}>
                {pontos[d.indice].rotulo}
              </TextoSvg>
            ))}

            {area ? <Path d={area} fill="url(#evolucaoFaturamento)" /> : null}
            {linha ? <Path d={linha} fill="none" stroke={colors.primary600} strokeWidth={2} /> : null}
            {/* Com um ou dois dias não há curva: marca os pontos. */}
            {pontos.length <= 2 && coordenadas.map((c, i) => (
              <Circle key={`p${i}`} cx={c.x} cy={c.y} r={3} fill={colors.surface} stroke={colors.primary600} strokeWidth={2} />
            ))}

            {escolhido !== null && (
              <>
                <Line x1={coordenadas[escolhido].x} x2={coordenadas[escolhido].x} y1={TOPO} y2={BASE} stroke="#cccccc" />
                <Circle cx={coordenadas[escolhido].x} cy={coordenadas[escolhido].y} r={4} fill={colors.primary600} stroke={colors.surface} strokeWidth={2} />
              </>
            )}
          </Svg>
        </Pressable>
      )}

      {dica && escolhido !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.dica,
            dicaNaEsquerda ? { right: largura - coordenadas[escolhido].x + 10 } : { left: coordenadas[escolhido].x + 10 },
          ]}
        >
          <Text style={styles.dicaTitulo}>{dica.rotulo}</Text>
          <View style={styles.dicaLinha}>
            <Text style={styles.dicaRotulo}>Faturamento</Text>
            <Text style={styles.dicaValor}>{formatarReais(dica.faturamento)}</Text>
          </View>
          <View style={styles.dicaLinha}>
            <Text style={styles.dicaRotulo}>{rotuloDasVendas}</Text>
            <Text style={styles.dicaValor}>{dica.vendas}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  caixa: { height: ALTURA },
  dica: {
    position: 'absolute',
    top: 24,
    minWidth: 128,
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dicaTitulo: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.text },
  dicaLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  dicaRotulo: { fontSize: 12, lineHeight: 16, color: COR_APAGADA },
  dicaValor: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.text, fontVariant: ['tabular-nums'] },
})
