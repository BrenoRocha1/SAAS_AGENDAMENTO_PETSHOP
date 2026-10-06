import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import { colors } from '@/theme/theme'
import { COR_APAGADA } from './Secao'

// Valor da opção que abre o calendário ("Personalizado").
export const PERIODO_PERSONALIZADO = 'personalizado'

interface Props<T extends string> {
  opcoes: { valor: T; rotulo: string }[]
  valor: T
  onMudar: (valor: T) => void
  // Período que está valendo (AAAA-MM-DD) — é o que o botão do calendário mostra.
  ini: string
  fim: string
  // O calendário em si quem desenha é a tela (CalendarioPeriodo), por cima do
  // que vem embaixo; aqui só se abre e fecha.
  calendarioAberto: boolean
  onCalendario: (aberto: boolean) => void
}

const FOLGA = 20
// O site mede a opção a partir da borda da página, não do trilho: sobram
// estes 34 (16 da tela + 16 do cartão + as bordas) na conta da rolagem.
const DESVIO_DO_TRILHO = 34

// Filtro de período dos relatórios: as opções num controle segmentado que
// rola de lado e, embaixo, quando a escolhida é "Personalizado", o botão
// com o período que abre o calendário.
export function FiltroPeriodo<T extends string>({ opcoes, valor, onMudar, ini, fim, calendarioAberto, onCalendario }: Props<T>) {
  const rolagem = useRef<ScrollView>(null)
  const posicoes = useRef<Record<string, { x: number; largura: number }>>({})
  const [visivel, setVisivel] = useState(0)
  const [conteudo, setConteudo] = useState(0)
  const [deslocado, setDeslocado] = useState(0)
  const primeira = useRef(true)

  // A opção escolhida fica sempre inteira à vista, com folga para sair do esmaecido.
  useEffect(() => {
    const p = posicoes.current[valor]
    if (!p || visivel === 0 || conteudo <= visivel) return
    const inicio = DESVIO_DO_TRILHO + p.x - FOLGA
    const final = DESVIO_DO_TRILHO + p.x + p.largura + FOLGA - visivel
    const alvo = deslocado > inicio ? inicio : deslocado < final ? final : deslocado
    const x = Math.max(0, Math.min(conteudo - visivel, alvo))
    if (x !== deslocado) rolagem.current?.scrollTo({ x, animated: !primeira.current })
    primeira.current = false
    // A posição da rolagem entra só como leitura: quem dispara é a troca de opção.
  }, [valor, visivel, conteudo]) // eslint-disable-line react-hooks/exhaustive-deps

  const aoRolar = (e: NativeSyntheticEvent<NativeScrollEvent>) => setDeslocado(e.nativeEvent.contentOffset.x)
  const resto = conteudo - visivel - deslocado

  return (
    <View style={styles.filtro}>
      <View style={styles.trilho} accessibilityRole="radiogroup" accessibilityLabel="Período">
        <ScrollView
          ref={rolagem}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={aoRolar}
          scrollEventThrottle={16}
          onLayout={e => setVisivel(e.nativeEvent.layout.width)}
          onContentSizeChange={largura => setConteudo(largura)}
          contentContainerStyle={styles.opcoes}
        >
          {opcoes.map(o => {
            const escolhida = o.valor === valor
            return (
              <Pressable
                key={o.valor}
                onLayout={e => { posicoes.current[o.valor] = { x: e.nativeEvent.layout.x, largura: e.nativeEvent.layout.width } }}
                onPress={() => {
                  // Ao escolher "Personalizado" o calendário já abre.
                  onCalendario(o.valor === PERIODO_PERSONALIZADO)
                  if (!escolhida) onMudar(o.valor)
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: escolhida }}
                style={[styles.opcao, escolhida && styles.opcaoEscolhida]}
              >
                <Text style={[styles.opcaoTexto, escolhida && styles.opcaoTextoEscolhido]}>{o.rotulo}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
        {/* As pontas esmaecem só do lado em que ainda há o que ver. */}
        {deslocado > 1 && <Esmaecido lado="inicio" />}
        {resto > 1 && <Esmaecido lado="fim" />}
      </View>

      {valor === PERIODO_PERSONALIZADO && (
        <BotaoPequeno
          rotulo={ini === fim ? dataBR(ini) : `${dataBR(ini)} – ${dataBR(fim)}`}
          icone={IconCalendar}
          numeros
          style={styles.gatilho}
          onPress={() => onCalendario(!calendarioAberto)}
        />
      )}
    </View>
  )
}

function Esmaecido({ lado }: { lado: 'inicio' | 'fim' }) {
  return (
    <View pointerEvents="none" style={[styles.esmaecido, lado === 'inicio' ? styles.esmaecidoInicio : styles.esmaecidoFim]}>
      <Svg width={24} height={34}>
        <Defs>
          <LinearGradient id={`esmaecer-${lado}`} x1={lado === 'inicio' ? '0' : '1'} y1="0" x2={lado === 'inicio' ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={colors.surface} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.surface} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={24} height={34} fill={`url(#esmaecer-${lado})`} />
      </Svg>
    </View>
  )
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const LARGURA_DO_CALENDARIO = 320

// O período "de — até" num calendário: toca-se no primeiro e no último dia.
// O mês em grade é o mesmo do SeletorDataHora.
export function CalendarioPeriodo({ ini, fim, dataMax, largura = LARGURA_DO_CALENDARIO, onCancelar, onAplicar }: {
  ini: string
  fim: string
  // Último dia que dá para escolher (ex.: hoje, em relatório do que já aconteceu).
  dataMax?: string
  largura?: number
  onCancelar: () => void
  onAplicar: (ini: string, fim: string) => void
}) {
  const hoje = hojeBrasilISO()
  // `fim` nulo: o primeiro dia já foi marcado e falta o último.
  const [escolha, setEscolha] = useState<{ ini: string; fim: string | null }>({ ini, fim })
  const [mesAtual, setMesAtual] = useState(() => startOfMonth(new Date(`${fim}T12:00:00`)))

  const dias = eachDayOfInterval({ start: startOfWeek(startOfMonth(mesAtual)), end: endOfWeek(endOfMonth(mesAtual)) })
  const podeAvancar = !dataMax || format(startOfMonth(addMonths(mesAtual, 1)), 'yyyy-MM-dd') <= dataMax

  function marcar(iso: string) {
    setEscolha(atual => {
      // Com o período completo, o toque começa outro.
      if (atual.fim !== null) return { ini: iso, fim: null }
      return iso < atual.ini ? { ini: iso, fim: atual.ini } : { ini: atual.ini, fim: iso }
    })
  }

  const ultimo = escolha.fim ?? escolha.ini
  const variosDias = escolha.fim !== null && escolha.fim !== escolha.ini
  const mes = format(mesAtual, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <View style={[styles.calendarioCaixa, { width: largura }]} accessibilityRole="none" accessibilityLabel="Escolher período">
      <View style={styles.calendario}>
        <View style={styles.cabecalho}>
          <Pressable onPress={() => setMesAtual(m => subMonths(m, 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mês anterior" style={styles.nav}>
            <IconChevronLeft size={14} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.mes}>{mes[0].toUpperCase() + mes.slice(1)}</Text>
          <Pressable
            onPress={() => setMesAtual(m => addMonths(m, 1))}
            disabled={!podeAvancar}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            style={[styles.nav, !podeAvancar && styles.navApagada]}
          >
            <IconChevronRight size={14} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.semana}>
          {DIAS_CURTOS.map(d => <Text key={d} style={styles.diaDaSemana}>{d}</Text>)}
        </View>

        <View style={styles.dias}>
          {dias.map(d => {
            const iso = format(d, 'yyyy-MM-dd')
            if (!isSameMonth(d, mesAtual)) return <View key={iso} style={styles.celula} />
            const ponta = iso === escolha.ini || iso === ultimo
            const dentro = escolha.fim !== null && iso > escolha.ini && iso < escolha.fim
            const parado = !!dataMax && iso > dataMax
            return (
              <Pressable
                key={iso}
                onPress={() => marcar(iso)}
                disabled={parado}
                accessibilityRole="button"
                accessibilityState={{ selected: ponta || dentro, disabled: parado }}
                style={[
                  styles.celula,
                  styles.dia,
                  dentro && styles.diaNoIntervalo,
                  ponta && styles.diaEscolhido,
                  variosDias && iso === escolha.ini && styles.diaInicio,
                  variosDias && iso === escolha.fim && styles.diaFim,
                ]}
              >
                <Text
                  style={[
                    styles.diaTexto,
                    iso === hoje && styles.diaHoje,
                    dentro && styles.diaTextoNoIntervalo,
                    parado && styles.diaApagado,
                    ponta && styles.diaTextoEscolhido,
                  ]}
                >
                  {format(d, 'd')}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.rodape}>
        <Text style={styles.resumo}>
          {escolha.fim === null ? (
            <>De <Text style={styles.forte}>{dataBR(escolha.ini)}</Text> — toque no último dia.</>
          ) : variosDias ? (
            <><Text style={styles.forte}>{dataBR(escolha.ini)}</Text> a <Text style={styles.forte}>{dataBR(escolha.fim)}</Text></>
          ) : (
            <>Só o dia <Text style={styles.forte}>{dataBR(escolha.ini)}</Text></>
          )}
        </Text>
        <View style={styles.acoes}>
          <BotaoPequeno variante="fantasma" rotulo="Cancelar" onPress={onCancelar} />
          <BotaoPequeno variante="primario" rotulo="Aplicar" onPress={() => onAplicar(escolha.ini, ultimo)} />
        </View>
      </View>
    </View>
  )
}

// Medidas do filtro do site em 375 de largura.
const styles = StyleSheet.create({
  filtro: { gap: 12 },
  trilho: { height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  opcoes: { padding: 3, gap: 2 },
  // 14 de respiro no site; aqui 13 mais o 1 do contorno (que só aparece na escolhida).
  opcao: { height: 28, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  opcaoEscolhida: { backgroundColor: colors.primary50, borderColor: colors.primary200 },
  opcaoTexto: { fontSize: 14, lineHeight: 14, fontWeight: '500', color: COR_APAGADA },
  opcaoTextoEscolhido: { color: colors.primary700 },
  esmaecido: { position: 'absolute', top: 0, bottom: 0, width: 24 },
  esmaecidoInicio: { left: 0 },
  esmaecidoFim: { right: 0 },
  gatilho: { alignSelf: 'flex-start' },
  // Calendário (`.periodo-popover`)
  calendarioCaixa: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: '#111827',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  calendario: { padding: 16 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 28, marginBottom: 12 },
  nav: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  navApagada: { opacity: 0.35 },
  mes: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text },
  semana: { flexDirection: 'row', gap: 2 },
  diaDaSemana: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 19.2, fontWeight: '500', color: '#858d99', paddingBottom: 8 },
  dias: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  // Sete por linha, sem vão entre os dias: o intervalo forma uma faixa contínua.
  celula: { width: `${100 / 7}%`, height: 36 },
  dia: { alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  diaNoIntervalo: { borderRadius: 0, backgroundColor: 'rgba(79,70,229,0.1)' },
  diaEscolhido: { backgroundColor: colors.primary600 },
  diaInicio: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  diaFim: { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  diaTexto: { fontSize: 14, lineHeight: 22.4, color: colors.text },
  diaHoje: { fontWeight: '700', color: colors.primary600 },
  diaTextoNoIntervalo: { color: colors.primary700 },
  diaApagado: { color: colors.textFaint, fontWeight: '400' },
  diaTextoEscolhido: { color: colors.white, fontWeight: '600' },
  rodape: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  resumo: { fontSize: 13, lineHeight: 20.8, color: colors.textDim },
  forte: { fontWeight: '700', color: colors.text },
  acoes: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
})
