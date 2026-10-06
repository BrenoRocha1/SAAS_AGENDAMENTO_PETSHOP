import { useCallback, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { BarraTopo } from '@/components/BarraTopo'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { Segmentos } from '@/components/Opcao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { diaSemanaCurto, hojeBrasilISO } from '@/lib/agenda'
import { cancelarAgendamento } from '@/lib/agendamentos'
import {
  carregarAgendamentosDoCliente,
  horarioAindaVem,
  primeiraHora,
  visitaAtiva,
  type AgendamentoCliente,
  type DadosAgendamentosCliente,
  type Visita,
} from '@/lib/cliente'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda, linkWhatsApp } from '@/lib/format'
import { ROTULO_FORMA_PLANO, ROTULO_STATUS_PAGAMENTO, ehFormaPlano, ehStatusPagamento, rotuloForma } from '@/lib/pagamento'
import { rotuloEstoque } from '@/lib/produto'
import { ROTULO_MODALIDADE, rotuloStatusCorrida } from '@/lib/taxidog'
import { colors, radius, spacing, typography } from '@/theme/theme'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Agendamentos do cliente — os mesmos cartões do painel web: o próximo em
// destaque, "Próximos" e "Histórico", e dentro de cada um o que ainda dá
// para fazer (remarcar e alterar só enquanto a loja não aceitou; cancelar
// até o horário; avaliar depois de finalizado).
export default function AgendamentosClienteScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const idCliente = user?.id
  const [dados, setDados] = useState<DadosAgendamentosCliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<'proximos' | 'historico'>('proximos')
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  // Painéis.
  const [cancelando, setCancelando] = useState<AgendamentoCliente | null>(null)
  const [motivo, setMotivo] = useState('')
  const [avaliando, setAvaliando] = useState<AgendamentoCliente | null>(null)
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!idCliente) return
    const r = await carregarAgendamentosDoCliente(idCliente)
    setDados(r.dados ?? null)
    setErro(r.erro ?? null)
    setLoading(false)
  }, [idCliente])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  const hoje = hojeBrasilISO()
  const visitas = dados?.visitas ?? []
  // Próximos: o mais perto primeiro. Histórico: o mais recente primeiro.
  const proximas = visitas.filter(v => visitaAtiva(v, hoje)).sort((a, b) => (a.dt + primeiraHora(a)).localeCompare(b.dt + primeiraHora(b)))
  const historico = visitas.filter(v => !visitaAtiva(v, hoje)).sort((a, b) => (b.dt + primeiraHora(b)).localeCompare(a.dt + primeiraHora(a)))
  const [destaque, ...demais] = proximas
  const lista = aba === 'proximos' ? demais : historico

  function alternar(chave: string) {
    setAbertas(atual => {
      const nova = new Set(atual)
      if (nova.has(chave)) nova.delete(chave)
      else nova.add(chave)
      return nova
    })
  }

  async function confirmarCancelamento() {
    if (!cancelando) return
    setErroPainel(null)
    setEnviando(true)
    const r = await cancelarAgendamento(cancelando.id_agendamento, motivo)
    setEnviando(false)
    if (r.erro) return setErroPainel(r.erro)
    setCancelando(null)
    carregar()
  }

  function abrirAvaliacao(ag: AgendamentoCliente) {
    const existente = dados?.avaliacoes[ag.id_agendamento]
    setNota(existente?.nota ?? 0)
    setComentario(existente?.comentario ?? '')
    setErroPainel(null)
    setAvaliando(ag)
  }

  async function salvarAvaliacao() {
    if (!avaliando) return
    if (nota < 1) return setErroPainel('Escolha uma nota de 1 a 5.')
    setErroPainel(null)
    setEnviando(true)
    const existente = dados?.avaliacoes[avaliando.id_agendamento]
    const { error } = existente
      ? await supabase.rpc('fn_editar_avaliacao', { p_id_avaliacao: existente.id_avaliacao, p_nota: nota, p_comentario: comentario.trim() || null })
      : await supabase.rpc('fn_criar_avaliacao', { p_id_agendamento: avaliando.id_agendamento, p_nota: nota, p_comentario: comentario.trim() || null })
    setEnviando(false)
    if (error) return setErroPainel(mensagemDoBanco(error, 'Não foi possível salvar a avaliação.'))
    setAvaliando(null)
    carregar()
  }

  const renderDetalhes = (v: Visita) => (
    <View style={styles.detalhes}>
      {v.itens.map(ag => {
        const aindaVem = horarioAindaVem(ag)
        const podeCancelar = (ag.status === 'Pendente' || ag.status === 'Confirmado') && aindaVem
        const podeAlterar = ag.status === 'Pendente' && aindaVem
        const avaliacao = dados?.avaliacoes[ag.id_agendamento]
        const plano = dados?.noPlano[ag.id_agendamento]
        return (
          <View key={ag.id_agendamento} style={styles.servico}>
            <View style={styles.linha}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.titulo}>{ag.servico?.nome ?? 'Serviço'}</Text>
                <Text style={styles.texto}>{ag.hr_agendamento.slice(0, 5)} · {ag.servico?.duracao ?? '—'} min</Text>
              </View>
              {v.itens.length > 1 && <StatusBadge status={ag.status} />}
              {plano && ag.status !== 'Cancelado' ? (
                <View style={styles.seloPlano}><Text style={styles.seloPlanoTexto}>Pelo plano</Text></View>
              ) : (
                <Text style={styles.valor}>{formatarMoeda(ag.valor)}</Text>
              )}
            </View>

            {/* Avaliação — só de atendimento finalizado (o banco confere de novo). */}
            {ag.status === 'Concluído' && (
              avaliacao ? (
                <View style={{ gap: 4 }}>
                  <View style={styles.linha}>
                    <Text style={styles.texto}>Sua avaliação</Text>
                    <Estrelas nota={avaliacao.nota} />
                    <Pressable onPress={() => abrirAvaliacao(ag)} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.link}>Editar</Text>
                    </Pressable>
                  </View>
                  {avaliacao.comentario ? <Text style={styles.texto}>“{avaliacao.comentario}”</Text> : null}
                </View>
              ) : (
                <Botao rotulo="Avaliar atendimento" icone="star-outline" compacto onPress={() => abrirAvaliacao(ag)} />
              )
            )}

            {podeAlterar && (
              <View style={styles.duas}>
                <Botao
                  rotulo="Remarcar"
                  icone="calendar-outline"
                  variante="secundario"
                  compacto
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/cliente/agendamentos/remarcar', params: { id: ag.id_agendamento } } as never)}
                />
                <Botao
                  rotulo="Alterar"
                  icone="create-outline"
                  variante="secundario"
                  compacto
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/cliente/agendamentos/editar', params: { id: ag.id_agendamento } } as never)}
                />
              </View>
            )}
            {ag.status === 'Confirmado' && aindaVem && (
              <Text style={styles.texto}>A loja já aceitou — para mudar a data, o serviço ou o pet, fale com a loja.</Text>
            )}
            {podeCancelar && (
              <Botao
                rotulo={v.itens.length > 1 ? 'Cancelar este serviço' : 'Cancelar agendamento'}
                icone="close-circle-outline"
                variante="perigo"
                compacto
                onPress={() => { setMotivo(''); setErroPainel(null); setCancelando(ag) }}
              />
            )}
          </View>
        )
      })}

      {v.taxidog && (
        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>TaxiDog</Text>
          <View style={styles.linha}>
            <Text style={[styles.texto, { flex: 1 }]}>
              {ROTULO_MODALIDADE[v.taxidog.modalidade]} · {rotuloStatusCorrida({ status: v.taxidog.status, modalidade: v.taxidog.modalidade, temTaxiDog: v.taxidog.temTaxiDog, statusAgendamento: v.status })}
            </Text>
            <Text style={styles.valor}>{formatarMoeda(v.taxidog.valor)}</Text>
          </View>
          <Text style={styles.textoPequeno}>{v.taxidog.endereco}</Text>
        </View>
      )}

      {v.produtos.length > 0 && (
        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>Produtos comprados</Text>
          {v.produtos.map((p, i) => (
            <View key={i} style={styles.linha}>
              <Text style={[styles.texto, { flex: 1 }]}>{p.nome} — {rotuloEstoque(p.quantidade, p.unidade_venda)}</Text>
              <Text style={styles.valor}>{formatarMoeda(p.preco_unitario * p.quantidade)}</Text>
            </View>
          ))}
        </View>
      )}

      {v.pagamento && v.status !== 'Cancelado' && (
        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>Pagamento</Text>
          {/* Tudo coberto (ex.: plano): não há o que pagar neste agendamento. */}
          {v.valor === 0 ? (
            <Text style={styles.texto}>
              {ehFormaPlano(v.pagamento.forma) ? `${ROTULO_FORMA_PLANO} — nada a pagar` : 'Nada a pagar neste agendamento'}
            </Text>
          ) : (
            <Text style={styles.texto}>
              {rotuloForma(v.pagamento.forma)}
              {ehStatusPagamento(v.pagamento.status) ? ` · ${ROTULO_STATUS_PAGAMENTO[v.pagamento.status]}` : ''}
            </Text>
          )}
          {v.valor > 0 && v.pagamento.pix && v.pagamento.status === 'pendente' && (
            <View style={styles.pix}>
              <Text style={styles.textoPequeno}>Chave Pix da loja{v.pagamento.pix.nome ? ` (${v.pagamento.pix.nome})` : ''}</Text>
              <Text style={styles.pixChave} selectable>{v.pagamento.pix.chave}</Text>
            </View>
          )}
        </View>
      )}

      {v.itens.some(i => i.obs) && <Text style={styles.texto}>{v.itens.map(i => i.obs).filter(Boolean).join(' · ')}</Text>}

      {(() => {
        const whats = linkWhatsApp(v.itens[0].lojista?.telefone)
        return whats ? (
          <Botao rotulo="Falar com a loja" icone="logo-whatsapp" variante="secundario" compacto onPress={() => Linking.openURL(whats)} />
        ) : null
      })()}
    </View>
  )

  const renderVisita = (v: Visita, emDestaque = false) => {
    const [, mes, dia] = v.dt.split('-')
    const aberta = emDestaque || abertas.has(v.chave)
    const temTaxi = !!v.taxidog && v.taxidog.status !== 'cancelada'
    return (
      <Card key={v.chave} style={[styles.cartao, emDestaque && styles.cartaoDestaque]}>
        <Pressable
          onPress={() => alternar(v.chave)}
          disabled={emDestaque}
          accessibilityRole="button"
          accessibilityState={{ expanded: aberta }}
          style={styles.resumo}
        >
          <View style={styles.data}>
            <Text style={styles.dataDia}>{dia}</Text>
            <Text style={styles.dataMes}>{MESES[Number(mes) - 1]}</Text>
            <Text style={styles.dataSemana}>{diaSemanaCurto(v.dt)}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.titulo, v.status === 'Cancelado' && styles.riscado]} numberOfLines={2}>
              {v.itens.map(i => i.servico?.nome ?? 'Serviço').join(' + ')}
            </Text>
            <Text style={styles.texto} numberOfLines={1}>
              {v.itens[0].pet?.nome ?? 'Pet'} · {primeiraHora(v).slice(0, 5)} · {v.itens[0].lojista?.nome_loja ?? ''}
            </Text>
            <View style={styles.selos}>
              <StatusBadge status={v.status} />
              {temTaxi && <View style={styles.seloNeutro}><Text style={styles.seloNeutroTexto}>TaxiDog</Text></View>}
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={styles.valor}>{formatarMoeda(v.valor)}</Text>
            {!emDestaque && <IconeApp name={aberta ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textFaint} />}
          </View>
        </Pressable>
        {aberta && renderDetalhes(v)}
      </Card>
    )
  }

  return (
    <ScreenContainer
      refreshing={loading}
      onRefresh={carregar}
      topo={<BarraTopo rotuloMenu="Menu" onMenu={() => router.push('/cliente/menu' as never)} />}
    >
      <View style={styles.cabecalho}>
        <Text style={styles.h1}>Agendamentos</Text>
        <Pressable
          onPress={() => router.push('/cliente/agendamentos/novo' as never)}
          accessibilityRole="button"
          accessibilityLabel="Novo agendamento"
          style={({ pressed }) => [styles.novo, pressed && { opacity: 0.8 }]}
        >
          <IconeApp name="add" size={18} color={colors.white} />
          <Text style={styles.novoTexto}>Novo</Text>
        </Pressable>
      </View>

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {!loading && visitas.length === 0 && !erro ? (
        <EmptyState icon="calendar-outline" ilustracao="agendar" title="Nenhum agendamento ainda" subtitle="Toque em Novo para marcar o primeiro serviço do seu pet." />
      ) : (
        <>
          {destaque && (
            <View style={{ marginBottom: spacing.xl }}>
              <Text style={styles.secao}>Seu próximo agendamento</Text>
              {renderVisita(destaque, true)}
            </View>
          )}

          {visitas.length > 0 && (
            <Segmentos
              valor={aba}
              onChange={setAba}
              opcoes={[
                { valor: 'proximos', rotulo: `Próximos (${proximas.length})` },
                { valor: 'historico', rotulo: `Histórico (${historico.length})` },
              ]}
            />
          )}

          <View style={{ gap: spacing.md, marginTop: spacing.md }}>
            {lista.length === 0 && !loading && visitas.length > 0 ? (
              <Text style={styles.texto}>
                {aba === 'proximos'
                  ? (destaque ? 'Nenhum outro agendamento marcado.' : 'Você não tem agendamentos marcados.')
                  : 'Nenhum agendamento anterior.'}
              </Text>
            ) : (
              lista.map(v => renderVisita(v))
            )}
          </View>
        </>
      )}

      {/* Cancelar */}
      <Folha visivel={!!cancelando} titulo="Cancelar agendamento" onFechar={() => setCancelando(null)} ocupado={enviando}>
        <Text style={styles.texto}>
          {cancelando?.servico?.nome ?? 'Serviço'} de {cancelando?.pet?.nome ?? 'seu pet'}, às {cancelando?.hr_agendamento.slice(0, 5)}.
        </Text>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Motivo (opcional)" value={motivo} onChangeText={setMotivo} placeholder="Ex.: compromisso de última hora" maxLength={300} multiline />
        <Botao rotulo="Confirmar cancelamento" variante="perigo" onPress={confirmarCancelamento} carregando={enviando} />
        <Botao rotulo="Voltar" variante="secundario" onPress={() => setCancelando(null)} desativado={enviando} />
      </Folha>

      {/* Avaliar */}
      <Folha visivel={!!avaliando} titulo="Avaliar atendimento" onFechar={() => setAvaliando(null)} ocupado={enviando}>
        <Text style={styles.texto}>
          {avaliando?.servico?.nome ?? 'Serviço'} de {avaliando?.pet?.nome ?? 'seu pet'} em {avaliando?.lojista?.nome_loja ?? 'a loja'}.
        </Text>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <View style={styles.estrelasInput}>
          {[1, 2, 3, 4, 5].map(n => (
            <Pressable
              key={n}
              onPress={() => setNota(n)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
              accessibilityState={{ selected: nota === n }}
              style={styles.estrelaBotao}
            >
              <IconeApp name={n <= nota ? 'star' : 'star-outline'} size={34} color={n <= nota ? colors.accent500 : colors.textFaint} />
            </Pressable>
          ))}
        </View>
        <Campo rotulo="Comentário (opcional)" value={comentario} onChangeText={setComentario} placeholder="Conte como foi" maxLength={500} multiline />
        <Botao rotulo="Enviar avaliação" onPress={salvarAvaliacao} carregando={enviando} />
      </Folha>
    </ScreenContainer>
  )
}

function Estrelas({ nota }: { nota: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(n => (
        <IconeApp key={n} name={n <= nota ? 'star' : 'star-outline'} size={14} color={n <= nota ? colors.accent500 : colors.textFaint} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  h1: { ...typography.heading.xl, color: colors.text },
  novo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary600,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  novoTexto: { ...typography.label.md, color: colors.white },
  secao: { ...typography.heading.sm, color: colors.text, marginBottom: spacing.md },
  cartao: { gap: spacing.md },
  cartaoDestaque: { borderColor: colors.primary200 },
  resumo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  data: { width: 46, alignItems: 'center' },
  dataDia: { ...typography.heading.lg, color: colors.text },
  dataMes: { ...typography.label.sm, color: colors.textMuted, textTransform: 'uppercase' },
  dataSemana: { ...typography.body.sm, color: colors.textFaint },
  titulo: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  riscado: { textDecorationLine: 'line-through', color: colors.textMuted },
  texto: { ...typography.body.md, color: colors.textMuted },
  textoPequeno: { ...typography.body.sm, color: colors.textMuted },
  valor: { ...typography.label.md, color: colors.successFg },
  link: { ...typography.label.md, color: colors.primary600 },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  seloNeutro: { backgroundColor: colors.surfaceMuted, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  seloNeutroTexto: { fontSize: 11, fontWeight: '700', color: colors.textDim },
  seloPlano: { backgroundColor: colors.primary50, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  seloPlanoTexto: { fontSize: 11, fontWeight: '700', color: colors.primary700 },
  detalhes: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  servico: { gap: spacing.sm },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  duas: { flexDirection: 'row', gap: spacing.md },
  bloco: { gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md },
  blocoTitulo: { ...typography.label.sm, color: colors.textDim, textTransform: 'uppercase' },
  pix: { marginTop: 4, gap: 2 },
  pixChave: { ...typography.body.lg, fontWeight: '600', color: colors.text },
  estrelasInput: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  estrelaBotao: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
