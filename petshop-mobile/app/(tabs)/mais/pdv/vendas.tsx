import { useCallback, useMemo, useRef, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { CartaoVazio } from '@/components/CartaoVazio'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { IconAlert, IconInbox } from '@/components/IconesDoSite'
import { StatusBadge } from '@/components/StatusBadge'
import { Text, TextInput } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { dataBR, hojeBrasilISO, somarDiasISO } from '@/lib/agenda'
import { dataParaISO, isoParaData, mascaraData } from '@/lib/mascaras'
import { FORMAS_PAGAMENTO, ROTULO_FORMA_PAGAMENTO, rotuloForma, type FormaPagamento } from '@/lib/pagamento'
import { dataHoraVenda, mensagemPdv, rotuloNumeroVenda, textoQuantidade, type VendaHistorico } from '@/lib/pdv'
import { supabase } from '@/lib/supabase'
import { formatarReais } from '@/lib/taxidog'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

const LIMITE_VENDAS = 300

// Vendas do caixa — a mesma página do site (/lojista/pdv/vendas) em largura
// de celular: período, números do período, o total por forma de pagamento e
// a lista; tocar numa venda abre o detalhe, onde o responsável (ou um
// administrador) pode cancelá-la — os produtos voltam para o estoque.
export default function PdvVendasScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.podeGerenciarProdutos
  const podeCancelar = contexto?.role === 'lojista' || !!contexto?.acessoTotal

  const hoje = hojeBrasilISO()
  const [periodo, setPeriodo] = useState({ de: hoje, ate: hoje })
  // O que está digitado nos dois campos de data (só vale em "Filtrar").
  const [deTexto, setDeTexto] = useState(isoParaData(hoje))
  const [ateTexto, setAteTexto] = useState(isoParaData(hoje))
  const [vendas, setVendas] = useState<VendaHistorico[]>([])
  const [truncado, setTruncado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState(false)

  const [aberta, setAberta] = useState<VendaHistorico | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const pedido = useRef(0)

  const { de, ate } = periodo
  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const meu = ++pedido.current
    setCarregando(true)
    const inicio = `${de}T00:00:00-03:00`
    // Brasil não tem horário de verão desde 2019: o dia seguinte é +24h.
    const fim = new Date(Date.parse(`${ate}T00:00:00-03:00`) + 24 * 60 * 60 * 1000).toISOString()
    const vendasRes = await supabase
      .from('venda')
      .select('id_venda, numero, created_at, cliente_nome, subtotal, desconto, total, forma_pagamento, valor_recebido, troco, status, operador_nome, cancelada_em, cancelada_motivo')
      .eq('id_lojista', idLojista)
      .gte('created_at', inicio)
      .lt('created_at', fim)
      .order('created_at', { ascending: false })
      .limit(LIMITE_VENDAS)
    if (meu !== pedido.current) return
    if (vendasRes.error) {
      setCarregando(false)
      return setErroCarga(true)
    }
    const linhas = (vendasRes.data ?? []) as Record<string, unknown>[]

    // Itens em lotes (uma URL com centenas de ids estoura o limite do PostgREST).
    const ids = linhas.map(v => v.id_venda as string)
    const lotes: string[][] = []
    for (let i = 0; i < ids.length; i += 40) lotes.push(ids.slice(i, i + 40))
    const itensRes = await Promise.all(lotes.map(lote =>
      supabase
        .from('venda_item')
        .select('id_item, id_venda, produto_nome, unidade_venda, quantidade, preco_unitario, subtotal')
        .in('id_venda', lote)
        .order('produto_nome')))
    if (meu !== pedido.current) return
    const itensPorVenda = new Map<string, VendaHistorico['itens']>()
    for (const r of itensRes) {
      for (const i of (r.data ?? []) as Record<string, unknown>[]) {
        const lista = itensPorVenda.get(i.id_venda as string) ?? []
        lista.push({
          id_item: i.id_item as string,
          produto_nome: i.produto_nome as string,
          unidade_venda: i.unidade_venda as string,
          quantidade: Number(i.quantidade),
          preco_unitario: Number(i.preco_unitario),
          subtotal: Number(i.subtotal),
        })
        itensPorVenda.set(i.id_venda as string, lista)
      }
    }

    setErroCarga(false)
    setTruncado(linhas.length >= LIMITE_VENDAS)
    setVendas(linhas.map(v => ({
      id_venda: v.id_venda as string,
      numero: Number(v.numero),
      created_at: v.created_at as string,
      cliente_nome: (v.cliente_nome as string | null) ?? null,
      subtotal: Number(v.subtotal),
      desconto: Number(v.desconto),
      total: Number(v.total),
      forma_pagamento: v.forma_pagamento as FormaPagamento,
      valor_recebido: v.valor_recebido === null ? null : Number(v.valor_recebido),
      troco: v.troco === null ? null : Number(v.troco),
      status: v.status as VendaHistorico['status'],
      operador_nome: (v.operador_nome as string | null) ?? null,
      cancelada_em: (v.cancelada_em as string | null) ?? null,
      cancelada_motivo: (v.cancelada_motivo as string | null) ?? null,
      itens: itensPorVenda.get(v.id_venda as string) ?? [],
    })))
    setCarregando(false)
  }, [idLojista, pode, de, ate])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  const resumo = useMemo(() => {
    const ok = vendas.filter(v => v.status === 'concluida')
    const faturamento = ok.reduce((s, v) => s + v.total, 0)
    return {
      qtd: ok.length,
      canceladas: vendas.length - ok.length,
      faturamento,
      ticket: ok.length ? faturamento / ok.length : 0,
      descontos: ok.reduce((s, v) => s + v.desconto, 0),
      porForma: FORMAS_PAGAMENTO
        .map(f => ({ forma: f, total: ok.filter(v => v.forma_pagamento === f).reduce((s, v) => s + v.total, 0) }))
        .filter(x => x.total > 0),
    }
  }, [vendas])

  if (!pode) {
    return (
      <ScreenContainer>
        <DetailHeader title="Vendas do caixa" />
        <CartaoVazio icone={IconAlert} titulo="Sem permissão para ver as vendas do caixa" texto="Fale com o responsável pelo petshop para liberar esse acesso." />
      </ScreenContainer>
    )
  }

  // O período pedido, com as mesmas travas do site: nunca no futuro, nunca
  // invertido e no máximo 1 ano para trás.
  function escolher(novoDe: string, novoAte: string) {
    let a = novoDe
    let b = novoAte
    if (a > b) [a, b] = [b, a]
    if (b > hoje) b = hoje
    if (a > b) a = b
    const limite = somarDiasISO(hoje, -366)
    if (a < limite) a = limite
    setPeriodo({ de: a, ate: b })
    setDeTexto(isoParaData(a))
    setAteTexto(isoParaData(b))
  }

  function filtrar() {
    const a = dataParaISO(deTexto)
    const b = dataParaISO(ateTexto)
    if (!a || !b) return
    escolher(a, b)
  }

  const presets = [
    { rotulo: 'Hoje', de: hoje, ate: hoje },
    { rotulo: 'Ontem', de: somarDiasISO(hoje, -1), ate: somarDiasISO(hoje, -1) },
    { rotulo: '7 dias', de: somarDiasISO(hoje, -6), ate: hoje },
    { rotulo: '30 dias', de: somarDiasISO(hoje, -29), ate: hoje },
  ]
  const mesmoDia = de === ate

  function fechar() {
    if (enviando) return
    setAberta(null)
    setCancelando(false)
    setMotivo('')
    setErro(null)
  }

  async function cancelar() {
    if (!aberta || enviando) return
    setEnviando(true)
    setErro(null)
    const { error } = await supabase.rpc('fn_cancelar_venda_pdv', { p_id_venda: aberta.id_venda, p_motivo: motivo.trim() || null })
    setEnviando(false)
    if (error) return setErro(mensagemPdv(error, 'Não foi possível cancelar a venda.'))
    const id = aberta.id_venda
    setVendas(vs => vs.map(v => (v.id_venda === id
      ? { ...v, status: 'cancelada', cancelada_em: new Date().toISOString(), cancelada_motivo: motivo.trim() || null }
      : v)))
    setAberta(null)
    setCancelando(false)
    setMotivo('')
  }

  return (
    <ScreenContainer refreshing={carregando} onRefresh={carregar}>
      <DetailHeader title="Vendas do caixa" />

      {/* ── Período ── */}
      <View style={styles.filtros}>
        <View style={styles.chips}>
          {presets.map(p => {
            const ativo = p.de === de && p.ate === ate
            return (
              <Pressable key={p.rotulo} onPress={() => escolher(p.de, p.ate)} accessibilityRole="button" accessibilityState={{ selected: ativo }} style={[styles.chip, ativo && styles.chipAtivo]}>
                <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{p.rotulo}</Text>
              </Pressable>
            )
          })}
        </View>
        <View style={styles.datas}>
          <TextInput
            value={deTexto}
            onChangeText={t => setDeTexto(mascaraData(t))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel="De"
            style={styles.data}
          />
          <Text style={styles.ate}>até</Text>
          <TextInput
            value={ateTexto}
            onChangeText={t => setAteTexto(mascaraData(t))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            maxLength={10}
            accessibilityLabel="Até"
            style={styles.data}
          />
          <BotaoPequeno rotulo="Filtrar" onPress={filtrar} />
        </View>
      </View>

      {erroCarga ? (
        <Aviso tipo="erro" texto="Não foi possível carregar as vendas agora. Tente novamente." />
      ) : (
        <View style={carregando && styles.apagado}>
          {/* ── Números do período ── */}
          <View style={styles.metricas}>
            <Metrica rotulo="Vendas" valor={String(resumo.qtd)} />
            <Metrica rotulo="Faturamento" valor={formatarReais(resumo.faturamento)} />
            <Metrica rotulo="Ticket médio" valor={formatarReais(resumo.ticket)} />
            <Metrica rotulo="Descontos" valor={formatarReais(resumo.descontos)} />
          </View>

          {resumo.porForma.length > 0 && (
            <View style={styles.porForma}>
              {resumo.porForma.map(x => (
                <View key={x.forma} style={styles.pilula}>
                  <Text style={styles.pilulaTexto}>{ROTULO_FORMA_PAGAMENTO[x.forma]}</Text>
                  <Text style={[styles.pilulaTexto, styles.pilulaForte]}>{formatarReais(x.total)}</Text>
                </View>
              ))}
              {resumo.canceladas > 0 && (
                <View style={styles.pilula}>
                  <Text style={styles.pilulaTexto}>Canceladas</Text>
                  <Text style={[styles.pilulaTexto, styles.pilulaForte]}>{resumo.canceladas}</Text>
                </View>
              )}
            </View>
          )}

          {/* ── Lista ── */}
          {vendas.length === 0 ? (
            carregando ? null : (
              <CartaoVazio icone={IconInbox} titulo={`Nenhuma venda ${mesmoDia ? `em ${dataBR(de)}` : 'no período'}`} texto="As vendas feitas no caixa aparecem aqui.">
                <BotaoPequeno variante="primario" rotulo="Ir para o caixa" onPress={() => router.back()} />
              </CartaoVazio>
            )
          ) : (
            <View style={styles.vendas}>
              {vendas.map((v, i) => {
                const cancelada = v.status === 'cancelada'
                return (
                  <Pressable
                    key={v.id_venda}
                    onPress={() => setAberta(v)}
                    accessibilityRole="button"
                    accessibilityLabel={`Venda ${rotuloNumeroVenda(v.numero)}, ${formatarReais(v.total)}${cancelada ? ', cancelada' : ''}`}
                    style={({ pressed }) => [styles.venda, i === vendas.length - 1 && styles.vendaUltima, pressed && styles.vendaTocada]}
                  >
                    <View style={styles.vendaLinha}>
                      <Text style={styles.vendaNumero}>{rotuloNumeroVenda(v.numero)}</Text>
                      <Text style={styles.vendaHora}>{dataHoraVenda(v.created_at, !mesmoDia)}</Text>
                    </View>
                    <View style={styles.vendaLinha}>
                      {cancelada ? <StatusBadge status="Cancelado" rotulo="Cancelada" /> : <Text style={styles.vendaForma}>{rotuloForma(v.forma_pagamento)}</Text>}
                      <Text style={[styles.vendaTotal, cancelada && styles.vendaTotalCancelada]}>{formatarReais(v.total)}</Text>
                    </View>
                    <Text style={styles.vendaResumo} numberOfLines={1}>{v.itens.map(x => x.produto_nome).join(', ') || '—'}</Text>
                    <Text style={styles.vendaCliente} numberOfLines={1}>{v.cliente_nome ?? 'Sem cliente'}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}
          {truncado && <Text style={styles.truncado}>Mostrando as vendas mais recentes do período. Reduza o intervalo para ver as demais.</Text>}
        </View>
      )}

      {/* ── Detalhe da venda ── */}
      <Folha visivel={!!aberta} titulo={aberta ? `Venda ${rotuloNumeroVenda(aberta.numero)}` : 'Venda'} onFechar={fechar} ocupado={enviando}>
        {aberta && (
          <>
            {aberta.status === 'cancelada' && <StatusBadge status="Cancelado" rotulo="Cancelada" style={styles.selo} />}

            <View style={styles.meta}>
              <Dado rotulo="Data" valor={dataHoraVenda(aberta.created_at, true)} />
              <Dado rotulo="Pagamento" valor={rotuloForma(aberta.forma_pagamento)} />
              <Dado rotulo="Cliente" valor={aberta.cliente_nome ?? 'Sem cliente'} />
              <Dado rotulo="Atendente" valor={aberta.operador_nome ?? '—'} />
            </View>

            <View>
              {aberta.itens.map((item, i) => (
                <View key={item.id_item} style={[styles.detalheItem, i === aberta.itens.length - 1 && styles.detalheItemUltimo]}>
                  <View style={styles.detalheItemTextos}>
                    <Text style={styles.detalheNome}>{item.produto_nome}</Text>
                    <Text style={styles.detalheApoio}>{textoQuantidade(item.quantidade, item.unidade_venda)} × {formatarReais(item.preco_unitario)}</Text>
                  </View>
                  <Text style={styles.detalheSubtotal}>{formatarReais(item.subtotal)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.totais}>
              <View style={styles.linha}>
                <Text style={styles.linhaRotulo}>Subtotal</Text>
                <Text style={styles.linhaValor}>{formatarReais(aberta.subtotal)}</Text>
              </View>
              {aberta.desconto > 0 && (
                <View style={styles.linha}>
                  <Text style={styles.linhaRotulo}>Desconto</Text>
                  <Text style={[styles.linhaValor, styles.descontoValor]}>− {formatarReais(aberta.desconto)}</Text>
                </View>
              )}
              <View style={styles.linha}>
                <Text style={styles.totalRotulo}>Total</Text>
                <Text style={styles.totalValor}>{formatarReais(aberta.total)}</Text>
              </View>
              {aberta.valor_recebido !== null && (
                <View style={styles.linha}>
                  <Text style={styles.linhaRotulo}>Recebido {formatarReais(aberta.valor_recebido)}</Text>
                  <Text style={styles.linhaValor}>Troco {formatarReais(aberta.troco ?? 0)}</Text>
                </View>
              )}
            </View>

            {aberta.status === 'cancelada' && (
              <Aviso
                tipo="erro"
                texto={`Venda cancelada${aberta.cancelada_em ? ` em ${dataHoraVenda(aberta.cancelada_em, true)}` : ''}; o estoque foi devolvido.${aberta.cancelada_motivo ? ` Motivo: ${aberta.cancelada_motivo}` : ''}`}
              />
            )}

            {erro && <Aviso tipo="erro" texto={erro} />}

            {cancelando && (
              <Campo
                rotulo="Motivo do cancelamento (opcional)"
                value={motivo}
                onChangeText={setMotivo}
                placeholder="Ex.: cliente desistiu"
                maxLength={200}
                autoFocus
                editable={!enviando}
                ajuda="Os produtos voltam para o estoque."
              />
            )}

            {aberta.status === 'concluida' && (
              <View style={styles.rodape}>
                {!podeCancelar ? (
                  <Text style={styles.semCancelar}>Só o responsável ou um administrador cancela vendas.</Text>
                ) : cancelando ? (
                  <>
                    <BotaoPequeno normal variante="perigo" rotulo={enviando ? 'Cancelando…' : 'Confirmar cancelamento'} desativado={enviando} onPress={cancelar} />
                    <BotaoPequeno normal variante="fantasma" rotulo="Voltar" desativado={enviando} onPress={() => { setCancelando(false); setErro(null) }} />
                  </>
                ) : (
                  <BotaoPequeno normal variante="perigoClaro" rotulo="Cancelar venda" onPress={() => setCancelando(true)} />
                )}
              </View>
            )}
          </>
        )}
      </Folha>
    </ScreenContainer>
  )
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.metrica}>
      <Text style={styles.metricaRotulo}>{rotulo}</Text>
      <Text style={styles.metricaValor} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
    </View>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.dado}>
      <Text style={styles.dadoRotulo}>{rotulo}</Text>
      <Text style={styles.dadoValor}>{valor}</Text>
    </View>
  )
}

// Medidas do pdv.css do site em largura de celular (até 900px).
const styles = StyleSheet.create({
  apagado: { opacity: 0.6 },
  // `.pdv-filtros`: as opções prontas e, na linha de baixo, as duas datas.
  filtros: { gap: 12, marginBottom: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { height: 34, paddingHorizontal: 14.4, borderRadius: 17, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipAtivo: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  chipTexto: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colors.textMuted },
  chipTextoAtivo: { color: colors.white },
  datas: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  data: { width: 108, height: 34, paddingVertical: 0, paddingHorizontal: 9.6, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, fontSize: 13, color: colors.text },
  ate: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  // `.pdv-metricas`: duas por linha.
  metricas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  metrica: { flexGrow: 1, flexBasis: '40%', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  metricaRotulo: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: '#858d99' },
  metricaValor: { marginTop: 2, fontFamily: FONTE_TITULO, fontSize: 24, lineHeight: 38.4, fontWeight: '800', letterSpacing: -0.48, color: colors.text },
  // `.pdv-por-forma`
  porForma: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5.6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pilulaTexto: { fontSize: 13, lineHeight: 20.8, color: colors.textMuted },
  pilulaForte: { fontWeight: '700', color: colors.text },
  // `.pdv-vendas` e `.pdv-venda-linha`
  vendas: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  venda: { gap: 2, paddingVertical: 12.8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  vendaUltima: { borderBottomWidth: 0 },
  vendaTocada: { backgroundColor: colors.surfaceMuted },
  vendaLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  vendaNumero: { fontSize: 14, lineHeight: 22.4, fontWeight: '700', color: colors.text },
  vendaHora: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  vendaForma: { fontSize: 13, lineHeight: 20.8, color: colors.textMuted },
  vendaTotal: { fontSize: 14, lineHeight: 22.4, fontWeight: '700', color: colors.text },
  vendaTotalCancelada: { fontWeight: '500', color: '#858d99', textDecorationLine: 'line-through' },
  vendaResumo: { fontSize: 14, lineHeight: 22.4, color: '#1f2937' },
  vendaCliente: { fontSize: 12, lineHeight: 19.2, color: '#858d99' },
  truncado: { marginTop: 12, fontSize: 12, lineHeight: 19.2, color: '#858d99', textAlign: 'center' },
  // ---------- Detalhe ----------
  selo: { alignSelf: 'flex-start' },
  // `.pdv-detalhe-meta`: dois por linha.
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dado: { flexGrow: 1, flexBasis: '40%' },
  dadoRotulo: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  dadoValor: { fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text },
  // `.pdv-detalhe-item`
  detalheItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8.8, borderBottomWidth: 1, borderBottomColor: colors.border },
  detalheItemUltimo: { borderBottomWidth: 0 },
  detalheItemTextos: { flex: 1, minWidth: 0 },
  detalheNome: { fontSize: 14, lineHeight: 22.4, color: colors.text },
  detalheApoio: { fontSize: 12, lineHeight: 19.2, color: '#858d99' },
  detalheSubtotal: { fontSize: 14, lineHeight: 22.4, fontWeight: '700', color: colors.text },
  totais: { gap: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  linhaRotulo: { fontSize: 14, lineHeight: 22.4, color: colors.textMuted },
  linhaValor: { fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text },
  descontoValor: { color: colors.successFg },
  totalRotulo: { fontSize: 17, lineHeight: 27.2, fontWeight: '700', color: colors.text },
  totalValor: { fontFamily: FONTE_TITULO, fontSize: 20, lineHeight: 32, fontWeight: '600', color: colors.text },
  // Pé da janela, como nas outras do app.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
  semCancelar: { fontSize: 12, lineHeight: 19.2, color: '#858d99' },
})
