import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Opcao, Segmentos } from '@/components/Opcao'
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

type Aba = 'planos' | 'assinaturas' | 'cobrancas'
type FiltroCobranca = 'pendentes' | 'vencidas' | 'pagas' | 'todas'

interface ServicoLoja { id_servico: string; nome: string; status: string }

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
// dono ou administrador. Vincular um plano a um pet fica na ficha do pet.
export default function PlanosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const hoje = hojeBrasilISO()
  const [aba, setAba] = useState<Aba>('planos')
  const [filtro, setFiltro] = useState<FiltroCobranca>('pendentes')
  const [planos, setPlanos] = useState<Plano[]>([])
  const [servicos, setServicos] = useState<ServicoLoja[]>([])
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([])
  const [cobrancas, setCobrancas] = useState<CobrancaDaLoja[]>([])
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

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
        ? supabase.from('servico').select('id_servico, nome, status').eq('id_lojista', idLojista).is('excluido_em', null).order('nome')
        : aba === 'assinaturas'
          ? supabase.rpc('fn_assinaturas_da_loja', { p_id_cliente: null, p_detalhes: false })
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
      setServicos((extra.data ?? []) as ServicoLoja[])
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
    setIntervalo(p?.intervalo_dias ? String(p.intervalo_dias) : '')
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

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Planos" />

      <Segmentos
        valor={aba}
        onChange={setAba}
        opcoes={[{ valor: 'planos', rotulo: 'Planos' }, { valor: 'assinaturas', rotulo: 'Assinaturas' }, { valor: 'cobrancas', rotulo: 'Cobranças' }]}
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
              planos.map(p => (
                <Card key={p.id_plano} style={{ gap: spacing.sm }}>
                  <View style={styles.linha}>
                    <Pressable style={{ flex: 1, gap: 2 }} onPress={() => abrirPlano(p)} accessibilityRole="button" accessibilityLabel={`Editar plano ${p.nome}`}>
                      <Text style={[styles.titulo, !p.ativo && styles.apagado]}>{p.nome}</Text>
                      <Text style={styles.sub}>{formatarMoeda(p.valor)}{sufixoPeriodo(p.periodicidade, p.intervalo_dias)}{p.ativo ? '' : ' · Desativado'}</Text>
                    </Pressable>
                    <Interruptor
                      value={p.ativo}
                      disabled={ocupado === p.id_plano}
                      onValueChange={v => alternarPlano(p, v)}
                      accessibilityLabel={`${p.nome} ativo`}
                    />
                  </View>
                  <Text style={styles.sub}>{p.servicos.map(s => `${s.quantidade}× ${s.servico}`).join(' · ')}</Text>
                  <Text style={styles.sub}>
                    {p.assinaturas_ativas} {p.assinaturas_ativas === 1 ? 'assinatura ativa' : 'assinaturas ativas'} · tocar no nome para editar
                  </Text>
                </Card>
              ))
            )}
            <Aviso tipo="info" texto="Para vincular um plano a um pet, abra a ficha do pet e toque em Vincular plano." />
          </>
        )}

        {/* ── Assinaturas ── */}
        {aba === 'assinaturas' && erro !== MSG_SEM_PLANOS && (
          !loading && assinaturas.length === 0 ? (
            <EmptyState icon="people-outline" ilustracao="planos" title="Nenhuma assinatura" subtitle="Vincule um plano a um pet na ficha do pet." />
          ) : (
            assinaturas.map(a => (
              <Card key={a.id_assinatura} style={{ gap: spacing.sm }}>
                <Text style={[styles.titulo, a.status === 'cancelada' && styles.apagado]}>
                  {a.pet ?? 'Pet excluído'} — {a.plano}
                </Text>
                <Text style={styles.sub}>
                  {a.cliente ?? 'Cliente excluído'} · {formatarMoeda(a.valor)}{sufixoPeriodo(a.periodicidade, a.intervalo_dias)}
                </Text>
                {a.status === 'cancelada' ? (
                  <Text style={styles.sub}>
                    Cancelada{a.cancelada_em ? ` em ${dataBR(a.cancelada_em.slice(0, 10))}` : ''}{a.motivo_cancelamento ? ` — ${a.motivo_cancelamento}` : ''}
                  </Text>
                ) : (
                  <>
                    {a.periodo_atual && (
                      <Text style={styles.sub}>
                        Período até {dataBR(a.periodo_atual.fim)}: {a.periodo_atual.beneficios.map(b => `${b.servico} ${b.usados}/${b.quantidade}`).join(' · ')}
                      </Text>
                    )}
                    <Text style={[styles.sub, a.cobrancas_vencidas > 0 && { color: colors.dangerFg }]}>
                      {a.cobrancas_vencidas > 0
                        ? `${a.cobrancas_vencidas} ${a.cobrancas_vencidas === 1 ? 'cobrança vencida' : 'cobranças vencidas'}`
                        : a.cobrancas_em_aberto > 0
                          ? `${a.cobrancas_em_aberto} ${a.cobrancas_em_aberto === 1 ? 'cobrança em aberto' : 'cobranças em aberto'}`
                          : 'Cobranças em dia'}
                      {a.proxima_cobranca ? ` · próxima em ${dataBR(a.proxima_cobranca)}` : ''}
                    </Text>
                    <Botao rotulo="Cancelar assinatura" variante="perigo" compacto onPress={() => abrirCancelamento(a)} />
                  </>
                )}
              </Card>
            ))
          )
        )}

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

      {/* Plano */}
      <Folha visivel={painel === 'plano'} titulo={editando ? 'Editar plano' : 'Novo plano'} onFechar={() => setPainel(null)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Nome do plano" value={nome} onChangeText={setNome} placeholder="Ex.: Banho mensal" maxLength={100} />
        <Campo rotulo="Valor (R$)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
        <Text style={styles.rotulo}>Cobrança</Text>
        <Segmentos valor={periodicidade} onChange={setPeriodicidade} opcoes={PERIODICIDADES} />
        {periodicidade === 'personalizado' && (
          <Campo rotulo="A cada quantos dias" value={intervalo} onChangeText={t => setIntervalo(soDigitos(t))} keyboardType="number-pad" maxLength={3} />
        )}
        <Text style={styles.rotulo}>Serviços incluídos por período</Text>
        {servicosAtivos.length === 0 && <Text style={styles.sub}>Nenhum serviço ativo — cadastre em Serviços.</Text>}
        {servicosAtivos.map(s => {
          const qtd = incluidos[s.id_servico] ?? 0
          return (
            <View key={s.id_servico} style={styles.servico}>
              <Text style={[styles.servicoNome, qtd === 0 && styles.apagado]} numberOfLines={2}>{s.nome}</Text>
              <Pressable onPress={() => mudarQuantidade(s.id_servico, -1)} disabled={qtd === 0} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Menos ${s.nome}`} style={styles.passo}>
                <IconeApp name="remove" size={18} color={qtd === 0 ? colors.textFaint : colors.text} />
              </Pressable>
              <Text style={styles.qtd}>{qtd}</Text>
              <Pressable onPress={() => mudarQuantidade(s.id_servico, 1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Mais ${s.nome}`} style={styles.passo}>
                <IconeApp name="add" size={18} color={colors.text} />
              </Pressable>
            </View>
          )
        })}
        <Campo rotulo="Descrição (opcional)" value={descricao} onChangeText={setDescricao} maxLength={500} multiline />
        {editando && editando.assinaturas_ativas > 0 && (
          <Aviso tipo="info" texto="Quem já assinou continua pagando o valor da assinatura. Os serviços novos valem a partir do próximo período de cada assinatura." />
        )}
        <Botao rotulo={editando ? 'Salvar plano' : 'Criar plano'} onPress={salvarPlano} carregando={salvando} />
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
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  corpo: { marginTop: spacing.lg, gap: spacing.md },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titulo: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  rotulo: { ...typography.label.md, color: colors.textDim },
  valor: { ...typography.label.md, color: colors.text },
  selo: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  servico: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  servicoNome: { ...typography.body.lg, color: colors.text, flex: 1 },
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
  qtd: { ...typography.heading.sm, color: colors.text, minWidth: 24, textAlign: 'center' },
})
