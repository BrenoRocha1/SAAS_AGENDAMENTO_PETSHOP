import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { AtribuirPlano } from '@/components/AtribuirPlano'
import { IconPencil, IconPlus } from '@/components/IconesDoSite'
import { Folha } from '@/components/Folha'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Opcao, Segmentos } from '@/components/Opcao'
import { Seletor } from '@/components/Seletor'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda } from '@/lib/format'
import { numeroParaCampo, paraNumero, soDigitos } from '@/lib/mascaras'
import { ROTULO_FORMA_PAGAMENTO, ehFormaPagamento, formasAtivas, normalizarFormasLoja, rotuloForma, type FormaPagamento } from '@/lib/pagamento'
import {
  PERIODICIDADES,
  ROTULO_STATUS_COBRANCA,
  statusCobrancaExibido,
  sufixoPeriodo,
  type Assinatura,
  type CobrancaDaLoja,
  type Periodicidade,
  type Plano,
  type ResumoCancelamento,
  type StatusCobrancaExibido,
} from '@/lib/planos'
import { colors, radius, spacing, typography } from '@/theme/theme'

type Aba = 'planos' | 'assinaturas' | 'cobrancas' | 'historico'

// fn_historico_planos: planos, assinaturas, renovações, cobranças e usos.
interface ItemHistorico {
  tipo: string
  descricao: string
  em: string
  pet?: string | null
  cliente?: string | null
}

function dataHora(iso: string): string {
  const d = new Date(iso)
  const dois = (n: number) => String(n).padStart(2, '0')
  return Number.isNaN(d.getTime()) ? '' : `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}, ${dois(d.getHours())}:${dois(d.getMinutes())}`
}
type FiltroCobranca = 'pendentes' | 'vencidas' | 'pagas' | 'todas'
type FiltroAssinatura = 'ativa' | 'pendencia' | 'cancelada' | 'todas'

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function passaNoFiltro(a: Assinatura, f: FiltroAssinatura): boolean {
  if (f === 'todas') return true
  if (f === 'pendencia') return a.status === 'ativa' && a.cobrancas_vencidas > 0
  return a.status === f
}

interface ServicoLoja { id_servico: string; nome: string; preco: number; status: string }

const COR_COBRANCA: Record<StatusCobrancaExibido, { fundo: string; texto: string }> = {
  pendente: { fundo: colors.warningBg, texto: colors.warningFg },
  vencido: { fundo: colors.dangerBg, texto: colors.dangerFg },
  pago: { fundo: colors.successBg, texto: colors.successFg },
  cancelado: { fundo: colors.surfaceMuted, texto: colors.textMuted },
}

const MSG_SEM_PLANOS = 'Os planos ainda não foram ativados no sistema da loja.'

// Planos e cobranças recorrentes (migration 060): os planos da loja, quem
// assina e as cobranças. Tudo por funções do banco (fn_planos_da_loja,
// fn_salvar_plano, fn_cancelar_assinatura…), que já conferem quem pode —
// dono ou administrador. Atribuir um plano a um pet: daqui (AtribuirPlano)
// ou da ficha do pet — os dois pela mesma fn_assinar_plano.
export default function PlanosScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const hoje = hojeBrasilISO()
  const [aba, setAba] = useState<Aba>('planos')
  const [filtro, setFiltro] = useState<FiltroCobranca>('pendentes')
  const [planos, setPlanos] = useState<Plano[]>([])
  const [servicos, setServicos] = useState<ServicoLoja[]>([])
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([])
  const [historico, setHistorico] = useState<ItemHistorico[]>([])
  const [cobrancas, setCobrancas] = useState<CobrancaDaLoja[]>([])
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Atribuir plano (cliente → pet → revisão).
  const [atribuindo, setAtribuindo] = useState<Plano | null>(null)
  // Assinaturas: busca e status.
  const [buscaAssinatura, setBuscaAssinatura] = useState('')
  const [filtroAssinatura, setFiltroAssinatura] = useState<FiltroAssinatura>('ativa')

  // Painéis (um por vez).
  const [painel, setPainel] = useState<'plano' | 'cancelar' | 'cobranca' | null>(null)
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Plano
  const [editando, setEditando] = useState<Plano | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [intervalo, setIntervalo] = useState('')
  const [incluidos, setIncluidos] = useState<Record<string, number>>({})
  // Cancelar assinatura
  const [cancelando, setCancelando] = useState<Assinatura | null>(null)
  const [motivo, setMotivo] = useState('')
  const [cancelarCobrancas, setCancelarCobrancas] = useState(true)
  const [devolverAgendamentos, setDevolverAgendamentos] = useState(true)
  // Cobrança
  const [cobranca, setCobranca] = useState<CobrancaDaLoja | null>(null)
  const [forma, setForma] = useState<FormaPagamento | ''>('')

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    setLoading(true)
    // A lista de planos sempre; o resto, só o da aba aberta.
    const [planosRes, extra] = await Promise.all([
      supabase.rpc('fn_planos_da_loja'),
      aba === 'planos'
        ? supabase.from('servico').select('id_servico, nome, preco, status').eq('id_lojista', idLojista).is('excluido_em', null).order('nome')
        : aba === 'assinaturas'
          ? supabase.rpc('fn_assinaturas_da_loja', { p_id_cliente: null, p_detalhes: false })
          : aba === 'historico'
            ? supabase.rpc('fn_historico_planos', { p_limite: 150 })
            : Promise.all([
              supabase.rpc('fn_cobrancas_planos', { p_filtro: filtro, p_data_ini: null, p_data_fim: null }),
              supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }),
            ]),
    ])
    setLoading(false)
    if (planosRes.error) {
      setErro(faltaMigration(planosRes.error) ? MSG_SEM_PLANOS : mensagemDoBanco(planosRes.error, 'Não foi possível carregar os planos.'))
      return
    }
    setErro(null)
    setPlanos(((planosRes.data ?? []) as Plano[]).map(p => ({ ...p, valor: Number(p.valor) })))
    if (Array.isArray(extra)) {
      const [cob, formasLoja] = extra
      setCobrancas(((cob.data ?? []) as CobrancaDaLoja[]).map(c => ({ ...c, valor: Number(c.valor) })))
      setFormas(formasAtivas(normalizarFormasLoja(formasLoja.data)))
    } else if (aba === 'planos') {
      setServicos(((extra.data ?? []) as ServicoLoja[]).map(s => ({ ...s, preco: Number(s.preco) })))
    } else if (aba === 'historico') {
      setHistorico((extra.data ?? []) as ItemHistorico[])
    } else {
      setAssinaturas(((extra.data ?? []) as Assinatura[]).map(a => ({ ...a, valor: Number(a.valor) })))
    }
  }, [idLojista, pode, aba, filtro])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Planos" />
        <SemPermissao area="ver os planos" />
      </ScreenContainer>
    )
  }

  // ── Plano ──
  function abrirPlano(p: Plano | null) {
    setEditando(p)
    setNome(p?.nome ?? '')
    setDescricao(p?.descricao ?? '')
    setValor(p ? numeroParaCampo(p.valor) : '')
    setPeriodicidade(p?.periodicidade ?? 'mensal')
    setIntervalo(p?.intervalo_dias ? String(p.intervalo_dias) : '30')
    setIncluidos(Object.fromEntries((p?.servicos ?? []).map(s => [s.id_servico, s.quantidade])))
    setErroPainel(null)
    setPainel('plano')
  }

  function mudarQuantidade(idServico: string, delta: number) {
    setIncluidos(atual => {
      const nova = Math.max(0, Math.min(999, (atual[idServico] ?? 0) + delta))
      const copia = { ...atual }
      if (nova === 0) delete copia[idServico]
      else copia[idServico] = nova
      return copia
    })
  }

  async function salvarPlano() {
    const v = paraNumero(valor)
    const dias = Number(soDigitos(intervalo) || '0')
    const lista = Object.entries(incluidos).map(([id_servico, quantidade]) => ({ id_servico, quantidade }))
    if (nome.trim().length < 2) return setErroPainel('Dê um nome ao plano.')
    if (!Number.isFinite(v) || v < 0) return setErroPainel('Informe o valor do plano.')
    if (periodicidade === 'personalizado' && (dias < 1 || dias > 730)) return setErroPainel('No período personalizado, informe a cada quantos dias (1 a 730).')
    if (lista.length === 0) return setErroPainel('Inclua pelo menos um serviço no plano.')
    setErroPainel(null)
    setSalvando(true)
    const { error } = await supabase.rpc('fn_salvar_plano', {
      p_id_plano: editando?.id_plano ?? null,
      p_nome: nome.trim(),
      p_descricao: descricao.trim() || null,
      p_valor: Math.round(v * 100) / 100,
      p_periodicidade: periodicidade,
      p_intervalo_dias: periodicidade === 'personalizado' ? dias : null,
      p_servicos: lista,
    })
    setSalvando(false)
    if (error) return setErroPainel(mensagemDoBanco(error, 'Não foi possível salvar o plano.'))
    setPainel(null)
    carregar()
  }

  async function alternarPlano(p: Plano, ativo: boolean) {
    setErro(null)
    setOcupado(p.id_plano)
    const { error } = await supabase.rpc('fn_alterar_status_plano', { p_id_plano: p.id_plano, p_ativo: ativo })
    setOcupado(null)
    if (error) return setErro(mensagemDoBanco(error, 'Não foi possível mudar o plano.'))
    setPlanos(lista => lista.map(x => (x.id_plano === p.id_plano ? { ...x, ativo } : x)))
  }

  // ── Assinatura ──
  function abrirCancelamento(a: Assinatura) {
    setCancelando(a)
    setMotivo('')
    setCancelarCobrancas(true)
    setDevolverAgendamentos(true)
    setErroPainel(null)
    setPainel('cancelar')
  }

  async function cancelarAssinatura() {
    if (!cancelando) return
    setErroPainel(null)
    setSalvando(true)
    const { data, error } = await supabase.rpc('fn_cancelar_assinatura', {
      p_id_assinatura: cancelando.id_assinatura,
      p_motivo: motivo.trim() || null,
      p_cancelar_cobrancas: cancelarCobrancas,
      p_devolver_agendamentos: devolverAgendamentos,
    })
    setSalvando(false)
    if (error) return setErroPainel(mensagemDoBanco(error, 'Não foi possível cancelar a assinatura.'))
    const r = data as ResumoCancelamento | null
    const partes = [
      r?.cobrancas_canceladas ? `${r.cobrancas_canceladas} ${r.cobrancas_canceladas === 1 ? 'cobrança cancelada' : 'cobranças canceladas'} (${formatarMoeda(r.valor_cancelado)})` : null,
      r?.agendamentos_devolvidos ? `${r.agendamentos_devolvidos} ${r.agendamentos_devolvidos === 1 ? 'agendamento voltou' : 'agendamentos voltaram'} ao preço normal` : null,
    ].filter(Boolean)
    setInfo(`Assinatura cancelada.${partes.length ? ` ${partes.join(' · ')}.` : ''}`)
    setPainel(null)
    carregar()
  }

  // ── Cobrança ──
  function abrirCobranca(c: CobrancaDaLoja) {
    setCobranca(c)
    setForma(ehFormaPagamento(c.forma_pagamento) ? c.forma_pagamento : formas.length === 1 ? formas[0] : '')
    setErroPainel(null)
    setPainel('cobranca')
  }

  async function atualizarCobranca(status: 'pendente' | 'pago' | 'cancelado') {
    if (!cobranca) return
    if (status === 'pago' && !forma) return setErroPainel('Escolha como o cliente pagou.')
    setErroPainel(null)
    setSalvando(true)
    const { error } = await supabase.rpc('fn_atualizar_cobranca_plano', { p_id_cobranca: cobranca.id_cobranca, p_forma: forma || null, p_status: status })
    setSalvando(false)
    if (error) return setErroPainel(mensagemDoBanco(error, 'Não foi possível atualizar a cobrança.'))
    setPainel(null)
    carregar()
  }

  const servicosAtivos = servicos.filter(s => s.status === 'Ativo' || incluidos[s.id_servico])
  // Quanto os serviços do plano custariam avulsos, no período.
  const valorAvulso = Object.entries(incluidos).reduce((soma, [id, q]) => soma + (servicos.find(s => s.id_servico === id)?.preco ?? 0) * q, 0)

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Planos" />

      <Segmentos
        valor={aba}
        onChange={setAba}
        opcoes={[
          { valor: 'planos', rotulo: 'Planos' },
          { valor: 'assinaturas', rotulo: 'Assinaturas' },
          { valor: 'cobrancas', rotulo: 'Cobranças' },
          { valor: 'historico', rotulo: 'Histórico' },
        ]}
      />

      <View style={styles.corpo}>
        {erro && <Aviso tipo={erro === MSG_SEM_PLANOS ? 'alerta' : 'erro'} texto={erro} />}
        {info && <Aviso tipo="sucesso" texto={info} />}

        {/* ── Planos ── */}
        {aba === 'planos' && erro !== MSG_SEM_PLANOS && (
          <>
            <Botao rotulo="Novo plano" icone="add" onPress={() => abrirPlano(null)} />
            {!loading && planos.length === 0 ? (
              <EmptyState icon="ribbon-outline" ilustracao="planos" title="Nenhum plano cadastrado" subtitle="Um plano junta serviços por um valor fixo no período — ex.: 4 banhos por mês." />
            ) : (
              [...planos].sort((x, y) => Number(y.ativo) - Number(x.ativo)).map(p => (
                <View key={p.id_plano} style={[styles.planoCard, !p.ativo && styles.planoCardInativo]}>
                  <View style={styles.planoTopo}>
                    <Text style={[styles.planoNome, !p.ativo && styles.apagado]}>{p.nome}</Text>
                    <View style={styles.planoStatus}>
                      <View style={[styles.seloPlano, p.ativo ? styles.seloAtivo : styles.seloInativo]}>
                        <Text style={[styles.seloPlanoTexto, { color: p.ativo ? colors.successFg : '#858d99' }]}>{p.ativo ? 'Ativo' : 'Inativo'}</Text>
                      </View>
                      <Interruptor
                        value={p.ativo}
                        disabled={ocupado === p.id_plano}
                        onValueChange={v => alternarPlano(p, v)}
                        accessibilityLabel={p.ativo ? `Desativar o plano ${p.nome}` : `Ativar o plano ${p.nome}`}
                      />
                    </View>
                  </View>
                  <Text style={[styles.planoPreco, !p.ativo && styles.apagado]}>
                    {formatarMoeda(p.valor)}<Text style={styles.planoSufixo}> {sufixoPeriodo(p.periodicidade, p.intervalo_dias)}</Text>
                  </Text>
                  {p.descricao ? <Text style={styles.planoDesc} numberOfLines={2}>{p.descricao}</Text> : null}
                  <Text style={styles.planoRotulo}>INCLUI POR PERÍODO</Text>
                  <View style={styles.chips}>
                    {p.servicos.map(s => (
                      <View key={s.id_servico} style={styles.chip}>
                        <Text style={styles.chipTexto}><Text style={styles.chipQtd}>{s.quantidade}×</Text> {s.servico}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.planoRodape}>
                    <Pressable
                      onPress={() => { if (p.assinaturas_ativas > 0) { setBuscaAssinatura(p.nome); setFiltroAssinatura('ativa'); setAba('assinaturas') } }}
                      disabled={p.assinaturas_ativas === 0}
                      accessibilityRole={p.assinaturas_ativas > 0 ? 'button' : undefined}
                      style={styles.assinantes}
                    >
                      <IconeApp name="people-outline" size={15} color={colors.primary500} />
                      <Text style={styles.assinantesTexto}>
                        {p.assinaturas_ativas === 0 ? 'Nenhuma assinatura ativa' : `${p.assinaturas_ativas} ${p.assinaturas_ativas === 1 ? 'assinatura ativa' : 'assinaturas ativas'}`}
                      </Text>
                    </Pressable>
                    <View style={styles.planoAcoes}>
                      <View style={{ flex: 1 }}>
                        <BotaoPequeno normal rotulo="Editar" icone={IconPencil} onPress={() => abrirPlano(p)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <BotaoPequeno normal variante="primario" rotulo="Atribuir plano" icone={IconPlus} desativado={!p.ativo} onPress={() => setAtribuindo(p)} />
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── Histórico ── */}
        {aba === 'historico' && erro !== MSG_SEM_PLANOS && (
          !loading && historico.length === 0 ? (
            <EmptyState icon="time-outline" title="Nada registrado ainda" />
          ) : (
            <Card style={styles.historico}>
              {historico.map((h, i) => (
                <View key={`${h.em}-${i}`} style={[styles.historicoItem, i === historico.length - 1 && styles.historicoUltimo]}>
                  <Text style={styles.historicoData}>{dataHora(h.em)}</Text>
                  <Text style={styles.historicoTexto}>
                    {h.pet ? <Text style={{ fontWeight: '700' }}>{h.pet}{h.cliente ? ` (${h.cliente})` : ''}: </Text> : null}
                    {h.descricao}
                  </Text>
                </View>
              ))}
            </Card>
          )
        )}

        {/* ── Assinaturas ── (o mesmo do site: busca, status e cards compactos) */}
        {aba === 'assinaturas' && erro !== MSG_SEM_PLANOS && (() => {
          const termo = semAcento(buscaAssinatura.trim())
          const daBusca = termo ? assinaturas.filter(a => semAcento([a.cliente, a.pet, a.plano].filter(Boolean).join(' ')).includes(termo)) : assinaturas
          const lista = daBusca.filter(a => passaNoFiltro(a, filtroAssinatura))
          const conta = (f: FiltroAssinatura) => daBusca.filter(a => passaNoFiltro(a, f)).length
          return (
            <>
              <Campo rotulo="Buscar" value={buscaAssinatura} onChangeText={setBuscaAssinatura} placeholder="Cliente, pet ou plano" />
              <Segmentos
                valor={filtroAssinatura}
                onChange={setFiltroAssinatura}
                opcoes={[
                  { valor: 'ativa', rotulo: `Ativas ${conta('ativa')}` },
                  { valor: 'pendencia', rotulo: `Vencidas ${conta('pendencia')}` },
                  { valor: 'cancelada', rotulo: `Canceladas ${conta('cancelada')}` },
                  { valor: 'todas', rotulo: `Todas ${conta('todas')}` },
                ]}
              />
              {!loading && lista.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  ilustracao="planos"
                  title={assinaturas.length === 0 ? 'Nenhuma assinatura ainda' : 'Nenhuma assinatura encontrada'}
                  subtitle={assinaturas.length === 0 ? 'Na aba Planos, use “Atribuir plano” para vincular um plano a um pet.' : 'Mude a busca ou o filtro de status.'}
                />
              ) : (
                lista.map(a => (
                  <View key={a.id_assinatura} style={styles.assinCard}>
                    <View style={styles.planoTopo}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.titulo, a.status === 'cancelada' && styles.apagado]}>{a.pet ?? 'Pet removido'} · {a.plano}</Text>
                        <Text style={styles.sub}>{a.cliente ?? 'Cliente removido'}</Text>
                      </View>
                      <View style={[styles.selo, { backgroundColor: a.status === 'cancelada' ? colors.surfaceMuted : colors.successBg }]}>
                        <Text style={[styles.seloTexto, { color: a.status === 'cancelada' ? colors.textMuted : colors.successFg }]}>{a.status === 'cancelada' ? 'CANCELADA' : 'ATIVA'}</Text>
                      </View>
                    </View>
                    <LinhaAssin rotulo="Valor" valor={`${formatarMoeda(a.valor)}${sufixoPeriodo(a.periodicidade, a.intervalo_dias)}`} />
                    <LinhaAssin rotulo="Início" valor={dataBR(a.data_inicio)} />
                    <LinhaAssin
                      rotulo={a.status === 'cancelada' ? 'Situação' : 'Próxima renovação'}
                      valor={a.status === 'cancelada'
                        ? `Cancelada${a.cancelada_em ? ` em ${dataBR(a.cancelada_em.slice(0, 10))}` : ''}`
                        : a.proxima_cobranca ? dataBR(a.proxima_cobranca) : a.data_inicio > hoje ? `Começa em ${dataBR(a.data_inicio)}` : '—'}
                    />
                    {a.status === 'ativa' && a.cobrancas_vencidas > 0 && (
                      <Text style={styles.pendencia}>{a.cobrancas_vencidas} {a.cobrancas_vencidas === 1 ? 'cobrança vencida' : 'cobranças vencidas'}</Text>
                    )}
                    {a.status === 'ativa' && a.periodo_atual && (
                      <Text style={styles.sub}>
                        Período até {dataBR(a.periodo_atual.fim)}: {a.periodo_atual.beneficios.map(b => `${b.servico} ${b.usados}/${b.quantidade}`).join(' · ')}
                      </Text>
                    )}
                    <View style={styles.planoAcoes}>
                      {a.id_cliente && (
                        <View style={{ flex: 1 }}>
                          <BotaoPequeno normal rotulo="Detalhes" onPress={() => router.push(`/clientes/${a.id_cliente}`)} />
                        </View>
                      )}
                      {a.status === 'ativa' && (
                        <View style={{ flex: 1 }}>
                          <BotaoPequeno normal variante="perigo" rotulo="Cancelar" onPress={() => abrirCancelamento(a)} />
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </>
          )
        })()}

        {/* ── Cobranças ── */}
        {aba === 'cobrancas' && erro !== MSG_SEM_PLANOS && (
          <>
            <Segmentos
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'pendentes', rotulo: 'A vencer' },
                { valor: 'vencidas', rotulo: 'Vencidas' },
                { valor: 'pagas', rotulo: 'Pagas' },
                { valor: 'todas', rotulo: 'Todas' },
              ]}
            />
            {!loading && cobrancas.length === 0 ? (
              <EmptyState icon="cash-outline" title="Nenhuma cobrança aqui" />
            ) : (
              cobrancas.map(c => {
                const st = statusCobrancaExibido(c.status, c.vencimento, hoje)
                const cor = COR_COBRANCA[st]
                return (
                  <Card key={c.id_cobranca} style={styles.linha} onPress={() => abrirCobranca(c)}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.titulo} numberOfLines={1}>{c.pet ?? 'Pet excluído'} — {c.plano}</Text>
                      <Text style={styles.sub} numberOfLines={1}>{c.cliente ?? 'Cliente excluído'}</Text>
                      <Text style={styles.sub}>
                        Vence {dataBR(c.vencimento)}{c.status === 'pago' ? ` · ${rotuloForma(c.forma_pagamento)}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.valor}>{formatarMoeda(c.valor)}</Text>
                      <View style={[styles.selo, { backgroundColor: cor.fundo }]}>
                        <Text style={[styles.seloTexto, { color: cor.texto }]}>{ROTULO_STATUS_COBRANCA[st]}</Text>
                      </View>
                    </View>
                  </Card>
                )
              })
            )}
          </>
        )}
      </View>

      {/* Plano — a mesma janela "Novo plano / Editar plano" do site (PlanosLista). */}
      <Folha visivel={painel === 'plano'} titulo={editando ? 'Editar plano' : 'Novo plano'} onFechar={() => setPainel(null)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Nome do plano" obrigatorio value={nome} onChangeText={setNome} placeholder="Ex: Banho Premium" maxLength={100} />

        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Serviços incluídos e quantidade por período<Text style={styles.estrela}> *</Text></Text>
          {servicosAtivos.length === 0 ? (
            <Text style={styles.semServico}>Cadastre serviços em Serviços antes de criar um plano.</Text>
          ) : (
            <View>
              {servicosAtivos.map(s => {
                const qtd = incluidos[s.id_servico] ?? 0
                return (
                  <View key={s.id_servico} style={styles.servico}>
                    <Text style={[styles.servicoNome, qtd === 0 && styles.apagado]} numberOfLines={2}>{s.nome}</Text>
                    <Pressable onPress={() => mudarQuantidade(s.id_servico, -1)} disabled={qtd === 0} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Menos ${s.nome}`} style={styles.passo}>
                      <IconeApp name="remove" size={18} color={qtd === 0 ? colors.textFaint : colors.text} />
                    </Pressable>
                    <Text style={styles.qtd}>{qtd}</Text>
                    <Pressable onPress={() => mudarQuantidade(s.id_servico, 1)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Mais ${s.nome}`} style={styles.passo}>
                      <IconeApp name="add" size={18} color={colors.text} />
                    </Pressable>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        <View style={styles.grupo}>
          <Campo rotulo="Valor (R$)" obrigatorio value={valor} onChangeText={setValor} keyboardType="decimal-pad" placeholder="149.90" maxLength={10} />
          {valorAvulso > 0 && <Text style={styles.nota}>Avulso esses serviços dariam {formatarMoeda(valorAvulso)} por período.</Text>}
        </View>

        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Período de cobrança<Text style={styles.estrela}> *</Text></Text>
          <Seletor titulo="Período de cobrança" valor={periodicidade} opcoes={PERIODICIDADES} onChange={setPeriodicidade} />
        </View>
        {periodicidade === 'personalizado' && (
          <Campo rotulo="Cobrar a cada quantos dias" obrigatorio value={intervalo} onChangeText={t => setIntervalo(soDigitos(t))} keyboardType="number-pad" maxLength={3} />
        )}

        <Campo rotulo="Descrição (opcional)" value={descricao} onChangeText={setDescricao} placeholder="O que o cliente ganha com o plano" maxLength={500} multiline />
        {editando && editando.assinaturas_ativas > 0 && (
          <Text style={styles.nota}>
            Quem já assinou continua pagando o valor da assinatura. Os serviços novos valem a partir do próximo período de cada assinatura.
          </Text>
        )}

        {/* `.modal-footer` no celular: só o "Salvar plano" (o "Cancelar" é da tela grande). */}
        <View style={styles.rodape}>
          <BotaoPequeno
            normal
            variante="primario"
            rotulo={salvando ? 'Salvando...' : 'Salvar plano'}
            desativado={salvando || Object.keys(incluidos).length === 0}
            onPress={salvarPlano}
          />
        </View>
      </Folha>

      {/* Cancelar assinatura */}
      <Folha visivel={painel === 'cancelar'} titulo="Cancelar assinatura" onFechar={() => setPainel(null)} ocupado={salvando}>
        {cancelando && (
          <>
            <Text style={styles.sub}>{cancelando.pet ?? 'Pet'} — {cancelando.plano} ({cancelando.cliente ?? 'cliente'})</Text>
            {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
            <LinhaSwitch
              titulo="Cancelar as cobranças em aberto"
              detalhe={cancelando.cobrancas_em_aberto > 0 ? `${cancelando.cobrancas_em_aberto} em aberto. Desligado, elas continuam a receber.` : 'Nenhuma em aberto agora.'}
              valor={cancelarCobrancas}
              onChange={setCancelarCobrancas}
            />
            <LinhaSwitch
              titulo="Devolver agendamentos ao preço normal"
              detalhe="Os agendamentos ainda por fazer que usam o plano voltam a ser cobrados avulsos."
              valor={devolverAgendamentos}
              onChange={setDevolverAgendamentos}
            />
            <Campo rotulo="Motivo (opcional)" value={motivo} onChangeText={setMotivo} maxLength={300} multiline />
            <Botao rotulo="Cancelar assinatura" variante="perigo" onPress={cancelarAssinatura} carregando={salvando} />
            <Botao rotulo="Voltar" variante="secundario" onPress={() => setPainel(null)} desativado={salvando} />
          </>
        )}
      </Folha>

      {/* Cobrança */}
      <Folha visivel={painel === 'cobranca'} titulo="Cobrança do plano" onFechar={() => setPainel(null)} ocupado={salvando}>
        {cobranca && (
          <>
            <Text style={styles.titulo}>{cobranca.pet ?? 'Pet'} — {cobranca.plano}</Text>
            <Text style={styles.sub}>
              {formatarMoeda(cobranca.valor)} · vence {dataBR(cobranca.vencimento)} · período de {dataBR(cobranca.periodo_inicio)} a {dataBR(cobranca.periodo_fim)}
            </Text>
            {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
            {cobranca.status !== 'cancelado' && (
              <>
                <Text style={styles.rotulo}>Como pagou</Text>
                <View style={{ gap: spacing.sm }}>
                  {formas.map(f => (
                    <Opcao key={f} titulo={ROTULO_FORMA_PAGAMENTO[f]} selecionada={forma === f} onPress={() => setForma(f)} />
                  ))}
                </View>
              </>
            )}
            {cobranca.status !== 'pago' && cobranca.status !== 'cancelado' && (
              <Botao rotulo="Marcar como paga" icone="checkmark" variante="sucesso" onPress={() => atualizarCobranca('pago')} carregando={salvando} />
            )}
            {cobranca.status === 'pago' && (
              <Botao rotulo="Voltar para pendente" variante="secundario" onPress={() => atualizarCobranca('pendente')} carregando={salvando} />
            )}
            {cobranca.status === 'pendente' && (
              <Botao rotulo="Cancelar esta cobrança" variante="perigo" onPress={() => atualizarCobranca('cancelado')} desativado={salvando} />
            )}
            {cobranca.status === 'cancelado' && (
              <Botao rotulo="Reabrir cobrança" variante="secundario" onPress={() => atualizarCobranca('pendente')} carregando={salvando} />
            )}
          </>
        )}
      </Folha>
      {atribuindo && idLojista && (
        <AtribuirPlano
          key={atribuindo.id_plano}
          plano={atribuindo}
          idLojista={idLojista}
          hojeISO={hoje}
          formas={formas}
          onFechar={() => setAtribuindo(null)}
          onConcluido={carregar}
        />
      )}
    </ScreenContainer>
  )
}

function LinhaAssin({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.assinLinha}>
      <Text style={styles.sub}>{rotulo}</Text>
      <Text style={styles.assinValor}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  corpo: { marginTop: spacing.lg, gap: spacing.md },
  // Cards dos planos e das assinaturas — `.pl-card` / `.pl-assin-cel` do site em 375.
  planoCard: { gap: 12, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  planoCardInativo: { backgroundColor: colors.bg },
  planoTopo: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  planoNome: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text },
  planoStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seloPlano: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  seloAtivo: { backgroundColor: colors.successBg },
  seloInativo: { backgroundColor: colors.surfaceMuted },
  seloPlanoTexto: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  planoPreco: { fontSize: 26, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  planoSufixo: { fontSize: 14, fontWeight: '600', letterSpacing: 0, color: colors.textMuted },
  planoDesc: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  planoRotulo: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.66, color: '#858d99', marginBottom: -4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primary50 },
  chipTexto: { fontSize: 13, lineHeight: 18, color: colors.text },
  chipQtd: { fontWeight: '800', color: colors.primary600 },
  planoRodape: { gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  assinantes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assinantesTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textDim },
  planoAcoes: { flexDirection: 'row', gap: 8 },
  assinCard: { gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  assinLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  assinValor: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textDim },
  pendencia: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.dangerFg },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titulo: { ...typography.cartao.titulo, color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.cartao.sub, color: colors.textMuted },
  // Histórico — a lista `.plano-historico` do site.
  historico: { gap: spacing.sm },
  historicoItem: { gap: 2, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  historicoUltimo: { borderBottomWidth: 0 },
  historicoData: { fontSize: 12, color: '#858d99' },
  historicoTexto: { fontSize: 14, color: colors.textDim },
  rotulo: { ...typography.label.md, color: colors.textDim },
  // Janela do plano, medida no site em 375 de largura.
  grupo: { gap: 4 },
  estrela: { color: colors.dangerFg },
  semServico: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  // A Folha deixa 24 no fim; janela com botões no pé (`.modal-footer`) deixa 16.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
  valor: { ...typography.label.md, color: colors.text },
  selo: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  servico: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  servicoNome: { fontSize: 16, lineHeight: 25.6, color: colors.text, flex: 1 },
  passo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  qtd: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text, minWidth: 24, textAlign: 'center' },
})
