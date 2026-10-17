import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { EmptyState } from '@/components/EmptyState'
import { Folha } from '@/components/Folha'
import { IconeApp } from '@/components/IconeApp'
import { Text } from '@/components/Texto'
import { dataBR } from '@/lib/agenda'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda } from '@/lib/format'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento } from '@/lib/pagamento'
import {
  GRUPOS_HISTORICO,
  ROTULO_STATUS_COBRANCA,
  descreverEvento,
  fatorMensal,
  horaBR,
  rotuloDia,
  statusCobrancaExibido,
  sufixoPeriodo,
  type Assinatura,
  type CobrancaPlano,
  type GrupoHistorico,
  type ItemHistoricoPlano,
  type TomHistorico,
} from '@/lib/planos'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

// As abas Assinaturas e Histórico da tela de Planos e o painel de uma
// assinatura — o mesmo do site (AbasPlanos.tsx), com as medidas de
// `planos-tela.css` em 375 de largura.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const iniciais = (nome: string | null) => (nome ?? '?').trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

const COR_TOM: Record<TomHistorico, { fundo: string; texto: string }> = {
  sucesso: { fundo: colors.successBg, texto: colors.successFg },
  perigo: { fundo: colors.dangerBg, texto: colors.dangerFg },
  aviso: { fundo: colors.warningBg, texto: colors.warningFg },
  primario: { fundo: colors.primary50, texto: colors.primary600 },
  neutro: { fundo: colors.surfaceMuted, texto: colors.textMuted },
}

function Pilula({ texto, tom }: { texto: string; tom: TomHistorico }) {
  return (
    <View style={[s.pilula, { backgroundColor: COR_TOM[tom].fundo }]}>
      <Text style={[s.pilulaTexto, { color: COR_TOM[tom].texto }]}>{texto}</Text>
    </View>
  )
}

// Abas e filtros da tela de Planos: uma linha só, sem borda, cada um com a
// largura do texto (o `.planos-abas` / `.pl-segmentos` do site).
export function BarraAbas<T extends string>({ opcoes, valor, onChange, suave = false }: {
  opcoes: { valor: T; rotulo: string }[]
  valor: T
  onChange: (v: T) => void
  // Filtro (fundo claro) em vez de aba (fundo cheio).
  suave?: boolean
}) {
  return (
    <View style={s.barra2}>
      {opcoes.map(o => {
        const ativo = o.valor === valor
        return (
          <Pressable
            key={o.valor}
            onPress={() => onChange(o.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            style={[s.aba, ativo && (suave ? s.abaSuave : s.abaCheia)]}
          >
            <Text style={[s.abaTexto, ativo && (suave ? s.abaTextoSuave : s.abaTextoCheia)]} numberOfLines={1}>{o.rotulo}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ════════════ Assinaturas ════════════
export type FiltroAssinatura = 'ativa' | 'vencida' | 'cancelada' | 'todas'
export function passaFiltro(a: Assinatura, f: FiltroAssinatura): boolean {
  if (f === 'todas') return true
  if (f === 'vencida') return a.status === 'ativa' && a.cobrancas_vencidas > 0
  return a.status === f
}
export const filtrarPorBusca = (lista: Assinatura[], busca: string) => {
  const termo = semAcento(busca.trim())
  return termo ? lista.filter(a => semAcento([a.cliente, a.pet, a.plano].filter(Boolean).join(' ')).includes(termo)) : lista
}

export function ResumoAssinaturas({ assinaturas, filtro, onFiltro }: { assinaturas: Assinatura[]; filtro: FiltroAssinatura; onFiltro: (f: FiltroAssinatura) => void }) {
  const ativas = assinaturas.filter(a => a.status === 'ativa')
  const receita = ativas.reduce((soma, a) => soma + Number(a.valor) * fatorMensal(a.periodicidade, a.intervalo_dias), 0)
  const vencidas = ativas.filter(a => a.cobrancas_vencidas > 0).length
  return (
    <View style={s.resumo}>
      <Pressable style={[s.resumoCard, filtro === 'ativa' && s.resumoAtivo]} onPress={() => onFiltro('ativa')} accessibilityRole="button">
        <Text style={s.resumoRotulo}>Assinaturas ativas</Text>
        <Text style={s.resumoValor}>{ativas.length}</Text>
      </Pressable>
      <View style={s.resumoCard}>
        <Text style={s.resumoRotulo}>Receita por mês</Text>
        <Text style={s.resumoValor} numberOfLines={1} adjustsFontSizeToFit>{formatarMoeda(receita)}</Text>
      </View>
      <Pressable style={[s.resumoCard, filtro === 'vencida' && s.resumoAtivo]} onPress={() => onFiltro('vencida')} accessibilityRole="button">
        <Text style={s.resumoRotulo}>Com cobrança vencida</Text>
        <Text style={[s.resumoValor, vencidas > 0 && { color: colors.dangerFg }]}>{vencidas}</Text>
      </Pressable>
    </View>
  )
}

export function LinhaAssinatura({ a, hoje, ultima, onPress }: { a: Assinatura; hoje: string; ultima: boolean; onPress: () => void }) {
  const cancelada = a.status === 'cancelada'
  const renova = cancelada
    ? `Cancelada em ${dataBR((a.cancelada_em ?? '').slice(0, 10))}`
    : a.proxima_cobranca ? `Renova ${dataBR(a.proxima_cobranca)}`
    : a.data_inicio > hoje ? `Começa ${dataBR(a.data_inicio)}` : ''
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.linha, !ultima && s.linhaBorda, pressed && { backgroundColor: colors.bg }]}>
      <View style={s.avatar}><Text style={s.avatarTexto}>{iniciais(a.pet)}</Text></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={s.linhaTopo}>
          <Text style={[s.pet, cancelada && { color: colors.textMuted }]} numberOfLines={1}>{a.pet ?? 'Pet removido'}</Text>
          {cancelada
            ? <Pilula texto="Cancelada" tom="neutro" />
            : a.cobrancas_vencidas > 0
              ? <Pilula texto={`${a.cobrancas_vencidas} ${a.cobrancas_vencidas === 1 ? 'vencida' : 'vencidas'}`} tom="perigo" />
              : <Pilula texto="Em dia" tom="sucesso" />}
        </View>
        <Text style={s.sub} numberOfLines={1}>{a.cliente ?? 'Cliente removido'}</Text>
        <Text style={s.planoLinha}>
          <Text style={s.planoNome}>{a.plano}</Text> · {formatarMoeda(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)}
        </Text>
        {renova ? <Text style={s.mini}>{renova}</Text> : null}
      </View>
    </Pressable>
  )
}

// Painel de uma assinatura: período, cobranças, usos e histórico.
export function DetalheAssinatura({ resumo, hoje, onFechar, onRegistrarPagamento, onCancelar }: {
  resumo: Assinatura
  hoje: string
  onFechar: () => void
  onRegistrarPagamento: (a: Assinatura, c: CobrancaPlano) => void
  onCancelar: (a: Assinatura) => void
}) {
  const router = useRouter()
  const [a, setA] = useState<Assinatura | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let atual = true
    if (!resumo.id_cliente) return
    supabase.rpc('fn_assinaturas_da_loja', { p_id_cliente: resumo.id_cliente, p_detalhes: true }).then(({ data, error }) => {
      if (!atual) return
      if (error) return setErro(mensagemDoBanco(error, 'Não foi possível abrir a assinatura.'))
      const achada = ((data ?? []) as Assinatura[]).find(x => x.id_assinatura === resumo.id_assinatura) ?? null
      setErro(achada ? null : 'Assinatura não encontrada.')
      setA(achada)
    })
    return () => { atual = false }
  }, [resumo.id_cliente, resumo.id_assinatura, tentativa])

  const base = a ?? resumo
  const ativa = base.status === 'ativa'
  const cobrancas = a?.cobrancas ?? []
  const usos = (a?.utilizacoes ?? []).filter(u => !u.estornada_em)
  const historico = a?.historico ?? []

  return (
    <Folha visivel titulo={base.pet ?? 'Assinatura'} onFechar={onFechar}>
      {base.id_cliente && (
        <Pressable onPress={() => { onFechar(); router.push(`/clientes/${base.id_cliente}`) }} accessibilityRole="link">
          <Text style={s.link}>{base.cliente}</Text>
        </Pressable>
      )}

      <View style={s.planoCaixa}>
        <Text style={s.rotulo}>PLANO</Text>
        <Text style={s.planoCaixaNome}>{base.plano}</Text>
        <Text style={s.sub}>{formatarMoeda(base.valor)}{sufixoPeriodo(base.periodicidade, base.intervalo_dias)} · desde {dataBR(base.data_inicio)}</Text>
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {ativa
            ? (base.cobrancas_vencidas > 0
                ? <Pilula texto={`${base.cobrancas_vencidas} ${base.cobrancas_vencidas === 1 ? 'cobrança vencida' : 'cobranças vencidas'}`} tom="perigo" />
                : <Pilula texto="Ativa · em dia" tom="sucesso" />)
            : <Pilula texto={`Cancelada em ${dataBR((base.cancelada_em ?? '').slice(0, 10))}`} tom="neutro" />}
        </View>
      </View>

      {ativa && base.periodo_atual && (
        <View style={{ gap: 8 }}>
          <Text style={s.rotulo}>PERÍODO ATUAL</Text>
          <Text style={s.sub}>{dataBR(base.periodo_atual.inicio)} a {dataBR(base.periodo_atual.fim)}{base.proxima_cobranca ? ` · renova ${dataBR(base.proxima_cobranca)}` : ''}</Text>
          {base.periodo_atual.beneficios.map(b => (
            <View key={b.servico} style={{ gap: 4 }}>
              <View style={s.beneficioTopo}>
                <Text style={s.beneficioNome}>{b.servico}</Text>
                <Text style={s.mini}><Text style={{ fontWeight: '700', color: colors.text }}>{b.usados}</Text> de {b.quantidade} usados · {Math.max(0, b.quantidade - b.usados)} restantes</Text>
              </View>
              <View style={s.barra}><View style={[s.barraCheia, { width: `${Math.min(100, (b.usados / Math.max(1, b.quantidade)) * 100)}%` }]} /></View>
            </View>
          ))}
        </View>
      )}

      {erro ? (
        <View style={s.estado}>
          <Text style={s.sub}>{erro}</Text>
          <Botao rotulo="Tentar de novo" variante="secundario" compacto onPress={() => { setErro(null); setTentativa(n => n + 1) }} />
        </View>
      ) : !a ? (
        <View style={s.estado}><ActivityIndicator color={colors.primary600} /><Text style={s.sub}>Carregando cobranças e histórico…</Text></View>
      ) : (
        <>
          <Text style={s.rotulo}>COBRANÇAS · {cobrancas.length}</Text>
          {cobrancas.length === 0 ? <Text style={s.sub}>Nenhuma cobrança ainda.</Text> : (
            <View style={s.caixa}>
              {cobrancas.map((c, i) => {
                const st = statusCobrancaExibido(c.status, c.vencimento, hoje)
                const tom: TomHistorico = st === 'pago' ? 'sucesso' : st === 'vencido' ? 'perigo' : st === 'pendente' ? 'aviso' : 'neutro'
                return (
                  <View key={c.id_cobranca} style={[s.cobranca, i > 0 && s.linhaBordaTopo]}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={s.valor}>{formatarMoeda(Number(c.valor))}</Text>
                      <Text style={s.mini}>Vence {dataBR(c.vencimento)} · período {c.numero}{c.pago_em ? ` · pago em ${dataBR(c.pago_em.slice(0, 10))}` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Pilula texto={c.status === 'pago' && ehFormaPagamento(c.forma_pagamento) ? `Pago · ${ROTULO_FORMA_PAGAMENTO[c.forma_pagamento]}` : ROTULO_STATUS_COBRANCA[st]} tom={tom} />
                      <Pressable onPress={() => onRegistrarPagamento(a, c)} hitSlop={8} accessibilityRole="button">
                        <Text style={s.link}>{c.status === 'pendente' ? 'Registrar pagamento' : 'Alterar'}</Text>
                      </Pressable>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          <Text style={s.rotulo}>SERVIÇOS USADOS · {usos.length}</Text>
          {usos.length === 0 ? <Text style={s.sub}>Nenhum serviço do plano usado ainda.</Text> : (
            <View style={s.caixa}>
              {usos.map((u, i) => (
                <View key={i} style={[s.cobranca, i > 0 && s.linhaBordaTopo]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.valor}>{u.servico}</Text>
                    <Text style={s.mini}>{u.data ? dataBR(u.data) : ''}{u.hora ? ` às ${u.hora.slice(0, 5)}` : ''} · período {u.periodo}{u.funcionario ? ` · ${u.funcionario}` : ''}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {historico.length > 0 && (
            <>
              <Text style={s.rotulo}>HISTÓRICO</Text>
              <View style={s.caixa}>
                {historico.map((h, i) => <EventoHistorico key={i} item={h} hoje={hoje} mostrarDia primeiro={i === 0} />)}
              </View>
            </>
          )}

          {ativa && <Botao rotulo="Cancelar assinatura" variante="perigo" onPress={() => onCancelar(a)} />}
        </>
      )}
    </Folha>
  )
}

// ════════════ Histórico ════════════
function iconeDoEvento(tipo: string, tom: TomHistorico): string {
  if (tipo === 'pagamento_registrado') return 'checkmark'
  if (tipo === 'beneficio_utilizado') return 'star-outline'
  if (tipo === 'plano_excluido') return 'trash-outline'
  if (tipo.startsWith('cobranca')) return 'cash-outline'
  return tom === 'sucesso' ? 'add' : tom === 'perigo' ? 'close' : tom === 'aviso' ? 'cash-outline' : tom === 'primario' ? 'repeat' : 'information-circle-outline'
}

function EventoHistorico({ item, hoje, mostrarDia = false, primeiro }: { item: ItemHistoricoPlano; hoje: string; mostrarDia?: boolean; primeiro: boolean }) {
  const ev = descreverEvento(item.tipo, item.descricao)
  const quem = [item.pet, item.cliente].filter(Boolean).join(' · ')
  // Plano apagado de vez: o nome ainda está na frase gravada ("Plano "X" …").
  const plano = item.plano ?? item.descricao.match(/"([^"]+)"/)?.[1] ?? null
  return (
    <View style={[s.evento, !primeiro && s.linhaBordaTopo]}>
      <View style={[s.eventoIcone, { backgroundColor: COR_TOM[ev.tom].fundo }]}>
        <IconeApp name={iconeDoEvento(item.tipo, ev.tom) as never} size={16} color={COR_TOM[ev.tom].texto} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={s.linhaTopo}>
          <Text style={s.eventoTitulo}>{ev.titulo}</Text>
          <Text style={s.mini}>{mostrarDia ? `${rotuloDia(item.em, hoje)}, ` : ''}{horaBR(item.em)}</Text>
        </View>
        {(quem || plano) ? (
          <View style={s.eventoQuem}>
            {quem ? <Text style={s.eventoQuemTexto}>{quem}</Text> : null}
            {plano ? <View style={s.eventoPlano}><Text style={s.eventoPlanoTexto}>{plano}</Text></View> : null}
          </View>
        ) : null}
        {ev.detalhe ? <Text style={s.eventoDetalhe}>{ev.detalhe}</Text> : null}
      </View>
    </View>
  )
}

export function HistoricoPlanos({ itens, hoje, carregando }: { itens: ItemHistoricoPlano[]; hoje: string; carregando: boolean }) {
  const [grupo, setGrupo] = useState<GrupoHistorico | 'todos'>('todos')
  const [busca, setBusca] = useState('')
  const dias = useMemo(() => {
    const termo = semAcento(busca.trim())
    const porDia = new Map<string, ItemHistoricoPlano[]>()
    for (const h of itens) {
      if (grupo !== 'todos' && descreverEvento(h.tipo, h.descricao).grupo !== grupo) continue
      if (termo && !semAcento([h.pet, h.cliente, h.plano, h.descricao].filter(Boolean).join(' ')).includes(termo)) continue
      const dia = rotuloDia(h.em, hoje)
      porDia.set(dia, [...(porDia.get(dia) ?? []), h])
    }
    return [...porDia.entries()]
  }, [itens, grupo, busca, hoje])

  if (!carregando && itens.length === 0) {
    return <EmptyState icon="time-outline" ilustracao="planos" title="Nada registrado ainda" subtitle="Aqui aparece tudo o que acontece com os planos: atribuições, renovações, pagamentos, usos e cancelamentos." />
  }
  return (
    <>
      <Campo rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder="Pet, cliente ou plano" />
      <View style={s.chips}>
        {GRUPOS_HISTORICO.map(g => (
          <Pressable key={g.valor} onPress={() => setGrupo(g.valor)} accessibilityRole="button" accessibilityState={{ selected: grupo === g.valor }} style={[s.chip, grupo === g.valor && s.chipAtivo]}>
            <Text style={[s.chipTexto, grupo === g.valor && { color: colors.primary600 }]}>{g.rotulo}</Text>
          </Pressable>
        ))}
      </View>
      {dias.length === 0 ? <Text style={[s.sub, { textAlign: 'center', paddingVertical: 24 }]}>Nada encontrado com esse filtro.</Text> : dias.map(([dia, eventos]) => (
        <View key={dia} style={{ gap: 8 }}>
          <Text style={s.rotulo}>{dia.toUpperCase()}</Text>
          <View style={s.caixa}>
            {eventos.map((h, i) => <EventoHistorico key={`${h.em}-${i}`} item={h} hoje={hoje} primeiro={i === 0} />)}
          </View>
        </View>
      ))}
    </>
  )
}

const s = StyleSheet.create({
  barra2: { flexDirection: 'row', gap: 2 },
  aba: { flexGrow: 1, flexShrink: 1, minHeight: 38, paddingHorizontal: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  abaCheia: { backgroundColor: colors.primary600 },
  abaSuave: { backgroundColor: colors.primary50 },
  abaTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textMuted },
  abaTextoCheia: { color: colors.white },
  abaTextoSuave: { color: colors.primary600 },
  pilula: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pilulaTexto: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  resumo: { flexDirection: 'row', gap: 8 },
  resumoCard: { flex: 1, gap: 4, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  resumoAtivo: { borderColor: colors.primary600, borderWidth: 2, paddingVertical: 9, paddingHorizontal: 11 },
  resumoRotulo: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: colors.textMuted },
  resumoValor: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: colors.text },
  linha: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  linhaBorda: { borderBottomWidth: 1, borderBottomColor: colors.border },
  linhaBordaTopo: { borderTopWidth: 1, borderTopColor: colors.border },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  avatarTexto: { fontSize: 13, fontWeight: '800', color: colors.primary600 },
  pet: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  mini: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
  planoLinha: { marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  planoNome: { fontWeight: '600', color: colors.textDim },
  link: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.primary600 },
  planoCaixa: { gap: 2, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  planoCaixaNome: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  rotulo: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.5, color: '#858d99' },
  beneficioTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  beneficioNome: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.text },
  barra: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barraCheia: { height: 6, borderRadius: 3, backgroundColor: colors.primary500 },
  estado: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  caixa: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  cobranca: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 },
  valor: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text },
  evento: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  eventoIcone: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventoTitulo: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text },
  eventoQuem: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  eventoQuemTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textDim },
  eventoPlano: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: colors.primary50 },
  eventoPlanoTexto: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.primary600 },
  eventoDetalhe: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 9 },
  chipAtivo: { backgroundColor: colors.primary50 },
  chipTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textMuted },
})
