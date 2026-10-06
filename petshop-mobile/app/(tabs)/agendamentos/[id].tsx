import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { IconeApp } from '@/components/IconeApp'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Avatar } from '@/components/Avatar'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { Opcao, Segmentos } from '@/components/Opcao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataExtensaISO, hojeBrasilISO } from '@/lib/agenda'
import {
  atribuirProfissional,
  atualizarPagamento,
  atualizarStatus,
  cancelarAgendamento,
  carregarAgendamento,
  type AgendamentoDetalhe,
  type TaxiDogPendente,
} from '@/lib/agendamentos'
import { formatarMoeda, formatarTelefone, linkWhatsApp } from '@/lib/format'
import {
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_STATUS_PAGAMENTO,
  ehFormaPagamento,
  ehFormaPlano,
  ehStatusPagamento,
  formasAtivas,
  normalizarFormasLoja,
  rotuloForma,
  type FormaPagamento,
} from '@/lib/pagamento'
import { PROXIMA_ETAPA, etapaEncerrada, etapaExigeDia, type StatusAgendamento } from '@/lib/statusAgendamento'
import { ROTULO_MODALIDADE, rotuloStatusCorrida } from '@/lib/taxidog'
import { colors, radius, spacing, typography } from '@/theme/theme'
import { dialogo } from '@/lib/dialogo'

const QUEM_CANCELOU: Record<string, string> = {
  cliente: 'pelo cliente',
  lojista: 'pela loja',
  funcionario: 'pela equipe da loja',
}

export default function AgendamentoDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const [ag, setAg] = useState<AgendamentoDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Painéis (um por vez).
  const [painel, setPainel] = useState<'cancelar' | 'pagamento' | 'profissional' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [pago, setPago] = useState<'pendente' | 'pago'>('pendente')
  const [equipe, setEquipe] = useState<{ id_funcionario: string; nome: string }[] | null>(null)

  const carregar = useCallback(async () => {
    const r = await carregarAgendamento(id)
    setAg(r.dados ?? null)
    setErroCarga(r.erro ?? null)
    setLoading(false)
  }, [id])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  // Formas de pagamento que a loja aceita (migration 057).
  const idLojista = contexto?.idLojista
  useEffect(() => {
    if (!idLojista) return
    let cancelado = false
    supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }).then(({ data }) => {
      if (!cancelado) setFormas(formasAtivas(normalizarFormasLoja(data)))
    })
    return () => { cancelado = true }
  }, [idLojista])

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Agendamento" />
        <View style={styles.centro}><ActivityIndicator color={colors.primary600} /></View>
      </ScreenContainer>
    )
  }

  if (!ag || !contexto) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Agendamento" />
        <EmptyState icon="alert-circle-outline" ilustracao="nao-encontrado" title="Agendamento não encontrado" subtitle={erroCarga ?? undefined} />
      </ScreenContainer>
    )
  }

  const a = ag
  const ctx = contexto
  const podeGerenciar = ctx.podeGerenciarAgenda
  const encerrado = etapaEncerrada(a.status)
  const proxima = PROXIMA_ETAPA[a.status]
  const aindaNaoEODia = !!proxima && etapaExigeDia(proxima.status) && a.dt_agendamento > hojeBrasilISO()
  const podeAlterar = a.status === 'Pendente' || a.status === 'Confirmado'
  const telefone = a.cliente?.telefone ?? null
  const whatsapp = linkWhatsApp(telefone)

  async function avancar(status: StatusAgendamento, taxidog?: 'ignorar' | 'cliente_trouxe') {
    setErro(null)
    setAviso(null)
    setEnviando(true)
    const r = await atualizarStatus(ctx, a.id_agendamento, status, taxidog ? { taxidog } : undefined)
    setEnviando(false)
    if (r.taxidogPendente) {
      perguntarTaxiDog(status, r.taxidogPendente)
      return
    }
    if (r.erro) {
      setErro(r.erro)
      return
    }
    if (r.aviso) setAviso(r.aviso)
    carregar()
  }

  // A busca do TaxiDog ainda não chegou e a loja quer iniciar/finalizar:
  // avisa (não bloqueia) — o cliente pode ter trazido o pet.
  function perguntarTaxiDog(status: StatusAgendamento, p: TaxiDogPendente) {
    if (p.emMovimento) {
      dialogo(
        'TaxiDog a caminho',
        `${p.pet} já está no carro do TaxiDog, a caminho da loja. Quer seguir mesmo assim?`,
        [
          { text: 'Voltar', style: 'cancel' },
          { text: 'Seguir mesmo assim', onPress: () => avancar(status, 'ignorar') },
        ],
      )
      return
    }
    dialogo(
      'Busca do TaxiDog pendente',
      `O TaxiDog ainda não buscou ${p.pet}. O cliente trouxe o pet?`,
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Seguir sem mexer no TaxiDog', onPress: () => avancar(status, 'ignorar') },
        { text: 'Cliente trouxe o pet', onPress: () => avancar(status, 'cliente_trouxe') },
      ],
    )
  }

  function pedirAvanco() {
    if (!proxima) return
    if (proxima.status === 'Concluído') {
      dialogo('Finalizar atendimento', `Confirma que o atendimento de ${a.pet?.nome ?? 'este pet'} terminou?`, [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Finalizar', onPress: () => avancar('Concluído') },
      ])
      return
    }
    avancar(proxima.status)
  }

  function abrirPainel(qual: 'cancelar' | 'pagamento' | 'profissional') {
    setErroPainel(null)
    if (qual === 'cancelar') setMotivo('')
    if (qual === 'pagamento') {
      setForma(ehFormaPagamento(a.forma_pagamento) ? a.forma_pagamento : '')
      setPago(a.status_pagamento === 'pago' ? 'pago' : 'pendente')
    }
    if (qual === 'profissional' && !equipe) {
      supabase
        .from('funcionario')
        .select('id_funcionario, nome')
        .eq('id_lojista', ctx.idLojista)
        .eq('ativo', true)
        .order('nome')
        .then(({ data }) => setEquipe((data ?? []) as { id_funcionario: string; nome: string }[]))
    }
    setPainel(qual)
  }

  async function confirmarCancelamento() {
    setErroPainel(null)
    setEnviando(true)
    const r = await cancelarAgendamento(a.id_agendamento, motivo)
    setEnviando(false)
    if (r.erro) {
      setErroPainel(r.erro)
      return
    }
    setPainel(null)
    carregar()
  }

  async function salvarPagamento() {
    if (!forma) {
      setErroPainel('Escolha a forma de pagamento.')
      return
    }
    setErroPainel(null)
    setEnviando(true)
    const r = await atualizarPagamento(a.id_agendamento, forma, pago)
    setEnviando(false)
    if (r.erro) {
      setErroPainel(r.erro)
      return
    }
    setPainel(null)
    carregar()
  }

  async function escolherProfissional(idFuncionario: string | null) {
    setErroPainel(null)
    setEnviando(true)
    const r = await atribuirProfissional(ctx, a.id_agendamento, idFuncionario)
    setEnviando(false)
    if (r.erro) {
      setErroPainel(r.erro)
      return
    }
    setPainel(null)
    carregar()
  }

  const totalProdutos = a.produtos.reduce((s, p) => s + p.quantidade * p.preco_unitario, 0)

  return (
    <ScreenContainer onRefresh={carregar} refreshing={false}>
      <DetailHeader title="Agendamento" />

      <Card style={styles.topo}>
        <Avatar nome={a.pet?.nome ?? 'Pet'} fotoUrl={a.pet?.foto_url} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.pet} numberOfLines={1}>{a.pet?.nome ?? 'Pet excluído'}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[a.pet?.especie, a.pet?.raca, a.pet?.porte].filter(Boolean).join(' • ') || '—'}
          </Text>
          <View style={{ marginTop: 4 }}><StatusBadge status={a.status} /></View>
        </View>
      </Card>

      {erro && <Aviso tipo="erro" texto={erro} style={styles.bloco} />}
      {aviso && <Aviso tipo="info" texto={aviso} style={styles.bloco} />}

      {a.status === 'Cancelado' && (
        <Aviso
          tipo="alerta"
          style={styles.bloco}
          texto={`Cancelado ${QUEM_CANCELOU[a.cancelado_por ?? ''] ?? ''}${a.motivo_cancelamento ? ` — ${a.motivo_cancelamento}` : ''}`.trim()}
        />
      )}

      <Card style={[styles.bloco, styles.linhas]}>
        <Linha icone="calendar-outline" rotulo="Quando" valor={`${dataExtensaISO(a.dt_agendamento)}, às ${a.hr_agendamento.slice(0, 5)}`} />
        <Linha
          icone="cut-outline"
          rotulo="Serviço"
          valor={`${a.servico?.nome ?? 'Serviço'}${a.servico?.duracao ? ` (${a.servico.duracao} min)` : ''}`}
        />
        {a.produtos.length > 0 && (
          <Linha
            icone="cube-outline"
            rotulo="Produtos"
            valor={`${a.produtos.map(p => `${p.quantidade}× ${p.nome}`).join(', ')} — ${formatarMoeda(totalProdutos)}`}
          />
        )}
        {a.transporte && (
          <Linha
            icone="car-outline"
            rotulo="TaxiDog"
            valor={`${ROTULO_MODALIDADE[a.transporte.modalidade]} — ${rotuloStatusCorrida({
              status: a.transporte.status,
              modalidade: a.transporte.modalidade,
              temTaxiDog: a.transporte.temTaxiDog,
              statusAgendamento: a.status,
            })}\n${a.transporte.endereco}${a.transporte.id_agendamento !== a.id_agendamento ? '\n(pedido em outro serviço desta visita)' : ''}`}
          />
        )}
        {a.plano && <Linha icone="ribbon-outline" rotulo="Plano" valor={`Coberto pelo plano ${a.plano}`} />}
        <Linha icone="cash-outline" rotulo="Valor" valor={formatarMoeda(a.valor)} forte />
        {a.obs ? <Linha icone="document-text-outline" rotulo="Obs." valor={a.obs} /> : null}
      </Card>

      {/* Pagamento */}
      <Card style={[styles.bloco, styles.linhaAcao]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rotuloCartao}>Pagamento</Text>
          <Text style={styles.valorCartao}>
            {rotuloForma(a.forma_pagamento)}
            {/* Coberto pelo plano (migration 082): não há pagamento a receber nem forma a trocar. */}
            {ehFormaPlano(a.forma_pagamento)
              ? ' · nada a pagar'
              : ehStatusPagamento(a.status_pagamento) ? ` · ${ROTULO_STATUS_PAGAMENTO[a.status_pagamento]}` : ''}
          </Text>
        </View>
        {podeGerenciar && a.status !== 'Cancelado' && formas.length > 0 && !ehFormaPlano(a.forma_pagamento) && (
          <Botao rotulo="Alterar" variante="secundario" compacto onPress={() => abrirPainel('pagamento')} />
        )}
      </Card>

      {/* Profissional */}
      <Card style={[styles.bloco, styles.linhaAcao]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rotuloCartao}>Profissional</Text>
          <Text style={styles.valorCartao}>{a.funcionario?.nome ?? 'Ninguém atribuído'}</Text>
        </View>
        {ctx.acessoTotal && !encerrado && (
          <Botao rotulo="Trocar" variante="secundario" compacto onPress={() => abrirPainel('profissional')} />
        )}
      </Card>

      {/* Cliente */}
      <Card style={[styles.bloco, { gap: spacing.md }]}>
        <View style={{ gap: 2 }}>
          <Text style={styles.rotuloCartao}>Cliente</Text>
          <Text style={styles.valorCartao}>{a.cliente?.nome ?? 'Cliente excluído'}</Text>
          {telefone ? <Text style={styles.sub}>{formatarTelefone(telefone)}</Text> : null}
        </View>
        {telefone ? (
          <View style={styles.duasColunas}>
            <Botao rotulo="Ligar" icone="call-outline" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${telefone}`)} />
            {whatsapp && (
              <Botao rotulo="WhatsApp" icone="logo-whatsapp" variante="secundario" compacto style={{ flex: 1 }} onPress={() => Linking.openURL(whatsapp)} />
            )}
          </View>
        ) : null}
        {a.id_cliente && ctx.podeGerenciarClientesPets && (
          <Pressable onPress={() => router.push(`/clientes/${a.id_cliente}`)} hitSlop={6} accessibilityRole="link">
            <Text style={styles.link}>Ver ficha do cliente</Text>
          </Pressable>
        )}
      </Card>

      {/* Ações */}
      {podeGerenciar && !encerrado && (
        <View style={[styles.bloco, { gap: spacing.md }]}>
          {proxima && (
            aindaNaoEODia ? (
              <Aviso tipo="info" texto="O atendimento só pode ser iniciado a partir do dia do agendamento." />
            ) : (
              <Botao
                rotulo={proxima.acao}
                icone={proxima.status === 'Concluído' ? 'checkmark-done' : proxima.status === 'Em andamento' ? 'play' : 'checkmark'}
                onPress={pedirAvanco}
                carregando={enviando && !painel}
              />
            )
          )}
          {podeAlterar && (
            <View style={styles.duasColunas}>
              <Botao
                rotulo="Remarcar"
                icone="calendar-outline"
                variante="secundario"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/agendamentos/remarcar', params: { id: a.id_agendamento } })}
              />
              <Botao
                rotulo="Alterar"
                icone="create-outline"
                variante="secundario"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/agendamentos/editar', params: { id: a.id_agendamento } })}
              />
            </View>
          )}
          <Botao rotulo="Cancelar agendamento" icone="close-circle-outline" variante="perigo" onPress={() => abrirPainel('cancelar')} />
        </View>
      )}

      {/* Cancelar */}
      <Folha visivel={painel === 'cancelar'} titulo="Cancelar agendamento" onFechar={() => setPainel(null)} ocupado={enviando}>
        <Text style={styles.textoPainel}>
          {a.pet?.nome ?? 'O pet'} — {a.servico?.nome ?? 'serviço'}, {dataExtensaISO(a.dt_agendamento).toLowerCase()} às {a.hr_agendamento.slice(0, 5)}.
          O motivo fica registrado no agendamento.
        </Text>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Motivo (opcional)" value={motivo} onChangeText={setMotivo} placeholder="Ex.: cliente pediu para desmarcar" maxLength={300} multiline />
        <Botao rotulo="Cancelar agendamento" variante="perigo" onPress={confirmarCancelamento} carregando={enviando} />
        <Botao rotulo="Voltar" variante="secundario" onPress={() => setPainel(null)} desativado={enviando} />
      </Folha>

      {/* Pagamento */}
      <Folha visivel={painel === 'pagamento'} titulo="Pagamento" onFechar={() => setPainel(null)} ocupado={enviando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Text style={styles.rotuloPainel}>Forma</Text>
        <View style={{ gap: spacing.sm }}>
          {formas.map(f => (
            <Opcao key={f} titulo={ROTULO_FORMA_PAGAMENTO[f]} selecionada={forma === f} onPress={() => setForma(f)} />
          ))}
        </View>
        <Text style={styles.rotuloPainel}>Situação</Text>
        <Segmentos
          valor={pago}
          onChange={setPago}
          opcoes={[{ valor: 'pendente', rotulo: 'Pendente' }, { valor: 'pago', rotulo: 'Pago' }]}
        />
        <Botao rotulo="Salvar" onPress={salvarPagamento} carregando={enviando} />
      </Folha>

      {/* Profissional */}
      <Folha visivel={painel === 'profissional'} titulo="Profissional responsável" onFechar={() => setPainel(null)} ocupado={enviando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        {!equipe ? (
          <ActivityIndicator color={colors.primary600} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Opcao titulo="Ninguém atribuído" selecionada={!a.id_funcionario} desativada={enviando} onPress={() => escolherProfissional(null)} />
            {equipe.map(f => (
              <Opcao
                key={f.id_funcionario}
                titulo={f.nome}
                selecionada={a.id_funcionario === f.id_funcionario}
                desativada={enviando}
                onPress={() => escolherProfissional(f.id_funcionario)}
              />
            ))}
            {equipe.length === 0 && <Text style={styles.textoPainel}>Nenhum funcionário ativo na equipe.</Text>}
          </View>
        )}
      </Folha>
    </ScreenContainer>
  )
}

function Linha({ icone, rotulo, valor, forte }: { icone: keyof typeof Ionicons.glyphMap; rotulo: string; valor: string; forte?: boolean }) {
  return (
    <View style={styles.linha}>
      <IconeApp name={icone} size={16} color={colors.textFaint} style={{ marginTop: 3 }} />
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={[styles.linhaValor, forte && styles.linhaForte]}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pet: { ...typography.heading.md, color: colors.text },
  sub: { ...typography.body.md, color: colors.textMuted },
  bloco: { marginTop: spacing.md },
  linhas: { gap: spacing.md },
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  linhaRotulo: { ...typography.body.sm, color: colors.textMuted, width: 66, marginTop: 3 },
  linhaValor: { ...typography.body.lg, color: colors.text, flex: 1 },
  linhaForte: { fontWeight: '700' },
  linhaAcao: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rotuloCartao: { ...typography.body.sm, color: colors.textMuted },
  valorCartao: { ...typography.body.lg, fontWeight: '600', color: colors.text },
  duasColunas: { flexDirection: 'row', gap: spacing.md },
  link: { ...typography.label.md, color: colors.primary600 },
  textoPainel: { ...typography.body.md, color: colors.textDim },
  rotuloPainel: { ...typography.label.md, color: colors.textDim, borderRadius: radius.sm },
})
