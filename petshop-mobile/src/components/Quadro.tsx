import { useState, type ComponentType, type ReactNode } from 'react'
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Folha } from '@/components/Folha'
import { IconCar, IconClock, IconDog, IconKanban, IconPlus, type IconeProps } from '@/components/IconesDoSite'
import { Opcao } from '@/components/Opcao'
import { Text } from '@/components/Texto'
import { coresStatus } from '@/lib/statusAgendamento'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, shadow } from '@/theme/theme'

// As peças do quadro (Kanban) do site em largura de celular
// (petshop-app/src/components/lojista/quadro.css): a troca de visão num
// seletor, os filtros em etiquetas, as etapas em abas com a contagem e, embaixo,
// só os cards da etapa escolhida. Usadas no Gestor de Agendamentos e no
// quadro do TaxiDog.

const COR_APAGADA = '#858d99'
// O índigo claro do horário e do avatar (`--primary-soft-bg`).
const SUAVE = 'rgba(79,70,229,0.12)'

// '#3b82f6' → 'rgba(59,130,246,0.09)': o fundo da aba escolhida.
function comTransparencia(hex: string, alfa: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`
}

// "Agendamentos | TaxiDog" (`.quadro-visoes`): o que o quadro mostra.
export function VisoesDoQuadro({ ativa, onTrocar, style }: {
  ativa: 'agendamentos' | 'taxidog'
  // Chamada ao tocar na visão que não está aberta.
  onTrocar: () => void
  style?: StyleProp<ViewStyle>
}) {
  const visoes = [
    { id: 'agendamentos', rotulo: 'Agendamentos', Icone: IconKanban },
    { id: 'taxidog', rotulo: 'TaxiDog', Icone: IconCar },
  ] as const
  return (
    <View style={[styles.visoes, style]}>
      {visoes.map(({ id, rotulo, Icone }) => {
        const aberta = id === ativa
        return (
          <Pressable
            key={id}
            onPress={() => { if (!aberta) onTrocar() }}
            accessibilityRole="button"
            accessibilityState={{ selected: aberta }}
            style={[styles.visao, aberta && styles.visaoAtiva]}
          >
            <Icone size={15} color={aberta ? colors.primary300 : colors.textMuted} />
            <Text style={[styles.visaoTexto, aberta && styles.visaoTextoAtivo]}>{rotulo}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// O "Novo" ao lado da faixa do dia (`.gestor-novo`): quadrado, da altura dela.
export function NovoDoQuadro({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Novo agendamento"
      style={({ pressed }) => [styles.novo, pressed && styles.novoPressionado]}
    >
      <IconPlus size={20} color={colors.white} />
      <Text style={styles.novoTexto}>Novo</Text>
    </Pressable>
  )
}

// Filtro numa etiqueta (`.filtro-chip`): mostra o nome do filtro ou o que
// está escolhido e, ao tocar, abre o painel com as opções.
export function FiltroDoQuadro({ icone: Icone, rotulo, todos, valor, opcoes, onChange }: {
  icone: ComponentType<IconeProps>
  // Nome curto do filtro ("Profissional").
  rotulo: string
  // A opção de não filtrar ("Todos os profissionais").
  todos: string
  valor: string
  opcoes: { valor: string; rotulo: string }[]
  onChange: (valor: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const escolhida = opcoes.find(o => o.valor === valor)
  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={`${rotulo}: ${escolhida?.rotulo ?? todos}`}
        style={[styles.filtro, !!escolhida && styles.filtroAtivo]}
      >
        <Icone size={15} color={colors.primary600} />
        <Text style={[styles.filtroTexto, !!escolhida && styles.filtroTextoAtivo]} numberOfLines={1}>{escolhida?.rotulo ?? rotulo}</Text>
        <View style={[styles.filtroSeta, !!escolhida && styles.filtroSetaAtiva]} />
      </Pressable>

      <Folha visivel={aberto} titulo={rotulo} onFechar={() => setAberto(false)}>
        <View style={styles.filtroOpcoes}>
          {[{ valor: '', rotulo: todos }, ...opcoes].map(o => (
            <Opcao
              key={o.valor}
              titulo={o.rotulo}
              selecionada={o.valor === valor}
              onPress={() => {
                setAberto(false)
                if (o.valor !== valor) onChange(o.valor)
              }}
            />
          ))}
        </View>
      </Folha>
    </>
  )
}

// As etapas em abas (`.quadro-etapas`): a contagem em cima, o nome embaixo e
// a cor da etapa no traço de cima. `status`: de qual etapa do atendimento
// vem a cor (amarelo, azul, roxo, verde).
export function EtapasDoQuadro<T extends string>({ etapas, valor, onChange }: {
  etapas: { id: T; rotulo: string; total: number; status: string }[]
  valor: T
  onChange: (id: T) => void
}) {
  return (
    <View style={styles.etapas} accessibilityRole="tablist">
      {etapas.map(e => {
        const cor = coresStatus(e.status).solid
        const aberta = e.id === valor
        return (
          <Pressable
            key={e.id}
            onPress={() => onChange(e.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: aberta }}
            accessibilityLabel={`${e.rotulo}: ${e.total}`}
            style={[styles.etapa, aberta && { borderColor: cor, backgroundColor: comTransparencia(cor, 0.09) }]}
          >
            <View style={[styles.etapaTraco, { backgroundColor: cor }]} />
            <Text style={styles.etapaTotal}>{e.total}</Text>
            <Text style={[styles.etapaNome, aberta && styles.etapaNomeAtivo]} numberOfLines={1}>{e.rotulo}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Os cards da etapa aberta, um embaixo do outro (sem a moldura da coluna).
export function CartoesDaEtapa({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.cartoes, style]}>{children}</View>
}

export function EtapaVazia({ children }: { children: ReactNode }) {
  return <Text style={styles.etapaVazia}>{children}</Text>
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

// Horário numa etiqueta índigo à esquerda (com o dia ao lado, quando não é
// o dia mostrado) e valor à direita.
export function TopoDoCartao({ hora, dia, valor }: { hora: string; dia?: string | null; valor: string }) {
  return (
    <View style={styles.cartaoTopo}>
      <View style={styles.horaLinha}>
        <View style={styles.hora}>
          <IconClock size={13} color={colors.primary300} />
          <Text style={styles.horaTexto}>{hora}</Text>
        </View>
        {dia ? <Text style={styles.dia}>{dia}</Text> : null}
      </View>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  )
}

export function PetDoCartao({ foto, nome, descricao }: { foto: string | null | undefined; nome: string; descricao?: string | null }) {
  return (
    <View style={styles.cartaoPet}>
      <View style={styles.foto}>
        {foto ? <Image source={{ uri: foto }} style={styles.fotoImagem} accessibilityLabel={nome} /> : <IconDog size={20} color={colors.primary300} />}
      </View>
      <View style={styles.cartaoPetTexto}>
        <Text style={styles.petNome}>{nome}</Text>
        {descricao ? <Text style={styles.petDescricao}>{descricao}</Text> : null}
      </View>
    </View>
  )
}

// Linha do card com o ícone do que ela diz (cliente, serviço, endereço),
// sempre numa linha só. `final`: a última antes do rodapé (sem o vão de baixo).
export function LinhaDoCartao({ icone: Icone, children, final }: { icone: ComponentType<IconeProps>; children: ReactNode; final?: boolean }) {
  return (
    <View style={[styles.linha, final && styles.linhaFinal]}>
      <Icone size={14} color={colors.primary600} />
      <Text style={styles.linhaTexto} numberOfLines={1}>{children}</Text>
    </View>
  )
}

// Selo de texto comum (`.badge` sem maiúsculas): tipo de transporte, rota,
// situação da corrida. `tom` = etapa de onde vêm as cores, ou cinza.
export function EtiquetaDoQuadro({ tom = 'neutro', children }: { tom?: string; children: ReactNode }) {
  // A neutra é branca com borda fina (`.kanban-card-tag`), sem cinza.
  const cor = tom === 'neutro' ? { bg: colors.surface, fg: colors.textDim, ring: colors.borderStrong } : coresStatus(tom)
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
      <Icone size={tamanho} color={colors.primary600} />
      {typeof children === 'string' ? <Text style={styles.peTexto} numberOfLines={1}>{children}</Text> : children}
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
  // `.quadro-visoes`
  visoes: { flexDirection: 'row', padding: 3, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  visao: { flex: 1, height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 9 },
  visaoAtiva: { backgroundColor: SUAVE },
  visaoTexto: { fontSize: 14, lineHeight: 14, fontWeight: '600', color: colors.textMuted },
  visaoTextoAtivo: { color: colors.primary300 },

  // `.gestor-novo`
  novo: { width: 60, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14, backgroundColor: colors.primary600 },
  novoPressionado: { opacity: 0.85 },
  novoTexto: { fontSize: 11, lineHeight: 17.6, fontWeight: '600', color: colors.white },

  // `.filtro-chip`
  filtro: { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  filtroAtivo: { borderColor: 'rgba(79,70,229,0.25)', backgroundColor: 'rgba(79,70,229,0.08)' },
  filtroTexto: { flex: 1, fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: '#1f2937' },
  filtroTextoAtivo: { color: colors.primary300 },
  filtroSeta: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: COR_APAGADA },
  filtroSetaAtiva: { borderTopColor: colors.primary300 },
  filtroOpcoes: { gap: 8 },

  // `.quadro-etapas`
  etapas: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  etapa: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', gap: 1, paddingTop: 4, paddingHorizontal: 2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  etapaTraco: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  etapaTotal: { fontFamily: FONTE_TITULO, fontSize: 18, lineHeight: 21.6, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  etapaNome: { fontSize: 11, lineHeight: 14.3, fontWeight: '600', color: COR_APAGADA },
  etapaNomeAtivo: { color: '#1f2937' },
  cartoes: { gap: 12 },
  etapaVazia: { paddingVertical: 32, paddingHorizontal: 16, textAlign: 'center', fontSize: 14, lineHeight: 20, color: COR_APAGADA },

  // `.kanban-card`: branco com sombra leve — sem cinza de fundo.
  cartao: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  cartaoPressionado: { borderColor: colors.primary200 },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  horaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  hora: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 8, paddingRight: 10, borderRadius: 13, backgroundColor: SUAVE },
  horaTexto: { fontSize: 13, lineHeight: 13, fontWeight: '700', color: colors.primary300, fontVariant: ['tabular-nums'] },
  dia: { fontSize: 12, lineHeight: 19.2, fontWeight: '400', color: COR_APAGADA },
  valor: { fontFamily: FONTE_TITULO, fontSize: 15, lineHeight: 24, fontWeight: '800', letterSpacing: -0.15, color: colors.successFg },
  cartaoPet: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  cartaoPetTexto: { flexShrink: 1 },
  foto: { width: 40, height: 40, borderRadius: 20, backgroundColor: SUAVE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fotoImagem: { width: '100%', height: '100%' },
  petNome: { fontSize: 15, lineHeight: 19.5, fontWeight: '700', color: colors.text },
  petDescricao: { fontSize: 12, lineHeight: 16.2, color: COR_APAGADA },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  linhaTexto: { flexShrink: 1, fontSize: 13, lineHeight: 20.8, color: '#1f2937' },
  linhaFinal: { marginBottom: 0 },
  etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  etiqueta: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  etiquetaTexto: { fontSize: 12, lineHeight: 19.2, fontWeight: '600' },
  pe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  peTexto: { flexShrink: 1, fontSize: 12, lineHeight: 19.2, color: colors.textMuted },
  acao: { marginTop: 8 },
  nota: { marginTop: 8, fontSize: 12, lineHeight: 16, color: COR_APAGADA },
})
