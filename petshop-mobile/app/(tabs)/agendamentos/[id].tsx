import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { FormasDePagamento, Segmentos } from '@/components/EscolhaPagamento'
import { EtapaTransporte } from '@/components/EtapaTransporte'
import { Folha } from '@/components/Folha'
import { IconCalendar, IconCar, IconCheck, IconLink, IconMoney, IconPencil, IconRepeat, IconStore, type IconeProps } from '@/components/IconesDoSite'
import { Seletor } from '@/components/Seletor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { acoesDisponiveis, chamarAcao } from '@/lib/acoes'
import { supabase } from '@/lib/supabase'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import {
  atribuirProfissional,
  atualizarPagamento,
  atualizarStatus,
  cancelarAgendamento,
  carregarAgendamento,
  type AgendamentoDetalhe,
  type TaxiDogPendente,
} from '@/lib/agendamentos'
import { formatarMoeda } from '@/lib/format'
import { mascaraCep } from '@/lib/mascaras'
import {
  ROTULO_FORMA_PAGAMENTO,
  ROTULO_FORMA_PLANO,
  ROTULO_STATUS_PAGAMENTO,
  ehFormaPagamento,
  ehFormaPlano,
  ehStatusPagamento,
  formasAtivas,
  normalizarFormasLoja,
  type FormaPagamento,
  type StatusPagamento,
} from '@/lib/pagamento'
import { PROXIMA_ETAPA, etapaExigeDia, type StatusAgendamento } from '@/lib/statusAgendamento'
import { ROTULO_MODALIDADE, rotuloTransporte, type ModalidadeTaxiDog } from '@/lib/taxidog'
import { ESTADO_TRANSPORTE_INICIAL, escolhaDoTransporte, transportePronto, type EstadoTransporte } from '@/lib/transporte'
import { colors, spacing } from '@/theme/theme'
import { dialogo } from '@/lib/dialogo'
import { perguntarBuscaTaxiDog } from '@/lib/perguntarTaxiDog'

const QUEM_CANCELOU: Record<string, string> = {
  cliente: 'pelo cliente',
  lojista: 'pela loja',
  funcionario: 'pela equipe da loja',
}

const ROTULO_ORIGEM: Record<'loja' | 'online', string> = {
  loja: 'Lançado pela loja',
  online: 'Agendamento online',
}

// Selo do pagamento nas cores dos status do atendimento, como o site.
const STATUS_QUE_A_LOJA_ESCOLHE: StatusPagamento[] = ['pendente', 'pago', 'cancelado']

const STATUS_DO_SELO: Record<StatusPagamento, StatusAgendamento> = {
  pendente: 'Pendente',
  pago: 'Concluído',
  cancelado: 'Cancelado',
}

// Corrida em andamento com o pet no carro: o transporte não muda agora.
const EM_MOVIMENTO = ['pet_embarcado', 'a_caminho_entrega', 'no_endereco_entrega']

interface Alteracao {
  em: string
  quem: 'Cliente' | 'Loja'
  texto: string
}

const dois = (n: number) => String(n).padStart(2, '0')

function dataCurta(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

function quando(ts: string) {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : `${dois(d.getDate())}/${dois(d.getMonth() + 1)}, ${dois(d.getHours())}:${dois(d.getMinutes())}`
}

// Trocas de serviço/pet e remarcações, com quem fez — as mesmas consultas
// do bloco "Alterações" do site (HistoricoAlteracoes). Sem nada registrado
// (ou sem as migrations), devolve lista vazia.
async function carregarAlteracoes(idAgendamento: string, idCliente: string | null): Promise<Alteracao[]> {
  const [alteracoes, remarcacoes] = await Promise.all([
    supabase.from('agendamento_alteracao')
      .select('campo, anterior, novo, valor_anterior, valor_novo, feito_por, created_at')
      .eq('id_agendamento', idAgendamento),
    supabase.from('agendamento_remarcacao')
      .select('dt_anterior, hr_anterior, dt_nova, hr_nova, motivo, id_usuario, created_at')
      .eq('id_agendamento', idAgendamento),
  ])
  const linhas: Alteracao[] = []
  for (const a of (alteracoes.data ?? []) as {
    campo: 'servico' | 'pet'; anterior: string | null; novo: string | null
    valor_anterior: number | null; valor_novo: number | null; feito_por: 'loja' | 'cliente'; created_at: string
  }[]) {
    const valores = a.valor_anterior != null && a.valor_novo != null && Number(a.valor_anterior) !== Number(a.valor_novo)
      ? ` (${formatarMoeda(Number(a.valor_anterior))} → ${formatarMoeda(Number(a.valor_novo))})`
      : ''
    linhas.push({
      em: a.created_at,
      quem: a.feito_por === 'cliente' ? 'Cliente' : 'Loja',
      texto: `trocou ${a.campo === 'servico' ? 'o serviço' : 'o pet'}: ${a.anterior ?? '—'} → ${a.novo ?? '—'}${valores}`,
    })
  }
  for (const r of (remarcacoes.data ?? []) as {
    dt_anterior: string; hr_anterior: string; dt_nova: string; hr_nova: string
    motivo: string | null; id_usuario: string | null; created_at: string
  }[]) {
    linhas.push({
      em: r.created_at,
      quem: idCliente && r.id_usuario === idCliente ? 'Cliente' : 'Loja',
      texto: `remarcou: ${dataCurta(r.dt_anterior)} ${r.hr_anterior.slice(0, 5)} → ${dataCurta(r.dt_nova)} ${r.hr_nova.slice(0, 5)}${r.motivo ? ` · "${r.motivo}"` : ''}`,
    })
  }
  return linhas.sort((x, y) => y.em.localeCompare(x.em)).slice(0, 10)
}

// Detalhes do agendamento — a MESMA janela do site
// (petshop-app/src/components/lojista/AgendaCalendar.tsx, "Detalhes do
// agendamento", com TransporteAgendamento, BeneficioAgendamento e
// PagamentoAgendamento): mesmas linhas, blocos, textos e botões, na mesma
// ordem, com as medidas tiradas dela em largura de celular. Lá é uma janela
// por cima da agenda; aqui é uma tela. Mudou lá, muda aqui.
export default function AgendamentoDetalheScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const [ag, setAg] = useState<AgendamentoDetalhe | null>(null)
  const [alteracoes, setAlteracoes] = useState<Alteracao[]>([])
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [erroPagamento, setErroPagamento] = useState<string | null>(null)
  const [equipe, setEquipe] = useState<{ id_funcionario: string; nome: string }[]>([])
  const [taxidogAtivo, setTaxidogAtivo] = useState(false)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  // Plano
  const [erroPlano, setErroPlano] = useState<string | null>(null)
  const [mexendoNoPlano, setMexendoNoPlano] = useState(false)
  // Transporte
  const [editandoTransporte, setEditandoTransporte] = useState(false)
  const [estadoTransporte, setEstadoTransporte] = useState<EstadoTransporte>(ESTADO_TRANSPORTE_INICIAL)
  const [erroTransporte, setErroTransporte] = useState<string | null>(null)
  const [avisoTransporte, setAvisoTransporte] = useState<string | null>(null)
  const [salvandoTransporte, setSalvandoTransporte] = useState(false)

  const carregar = useCallback(async () => {
    const r = await carregarAgendamento(id)
    setAg(r.dados ?? null)
    setErroCarga(r.erro ?? null)
    setLoading(false)
    if (r.dados) setAlteracoes(await carregarAlteracoes(r.dados.id_agendamento, r.dados.id_cliente))
  }, [id])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  // O que a loja tem: formas de pagamento aceitas (migration 057), TaxiDog
  // ligado (042) e a equipe, para o "Profissional responsável".
  const idLojista = contexto?.idLojista
  const acessoTotal = !!contexto?.acessoTotal
  useEffect(() => {
    if (!idLojista) return
    let cancelado = false
    supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }).then(({ data }) => {
      if (!cancelado) setFormas(formasAtivas(normalizarFormasLoja(data)))
    })
    supabase.from('taxidog_config').select('ativo').eq('id_lojista', idLojista).maybeSingle().then(({ data, error }) => {
      if (!cancelado) setTaxidogAtivo(!error && !!(data as { ativo: boolean } | null)?.ativo)
    })
    if (acessoTotal) {
      supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', idLojista).eq('ativo', true).order('nome').then(({ data }) => {
        if (!cancelado) setEquipe((data ?? []) as { id_funcionario: string; nome: string }[])
      })
    }
    return () => { cancelado = true }
  }, [idLojista, acessoTotal])

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Detalhes do agendamento" junto />
        <View style={styles.centro}><ActivityIndicator color={colors.primary600} /></View>
      </ScreenContainer>
    )
  }

  if (!ag || !contexto) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Detalhes do agendamento" junto />
        <EmptyState icon="alert-circle-outline" ilustracao="nao-encontrado" title="Agendamento não encontrado" subtitle={erroCarga ?? undefined} />
      </ScreenContainer>
    )
  }

  const a = ag
  const ctx = contexto
  const podeGerenciar = ctx.podeGerenciarAgenda
  const comSite = acoesDisponiveis()
  const cancelado = a.status === 'Cancelado'
  const emAberto = a.status === 'Pendente' || a.status === 'Confirmado' || a.status === 'Em andamento'
  const proxima = PROXIMA_ETAPA[a.status]
  const aindaNaoEODia = !!proxima && etapaExigeDia(proxima.status) && a.dt_agendamento > hojeBrasilISO()

  // ── Etapa do atendimento ──
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

  function perguntarTaxiDog(status: StatusAgendamento, p: TaxiDogPendente) {
    perguntarBuscaTaxiDog(p, escolha => avancar(status, escolha))
  }

  function pedirAvanco() {
    if (!proxima) return
    // Finalizar não tem volta: no celular, um toque sem querer pede confirmação.
    if (proxima.status === 'Concluído') {
      dialogo('Finalizar atendimento', `Confirma que o atendimento de ${a.pet?.nome ?? 'este pet'} terminou?`, [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Finalizar', onPress: () => avancar('Concluído') },
      ])
      return
    }
    avancar(proxima.status)
  }

  async function confirmarCancelamento() {
    setConfirmandoCancelar(false)
    setErro(null)
    setEnviando(true)
    const r = await cancelarAgendamento(a.id_agendamento, '')
    setEnviando(false)
    if (r.erro) return setErro(r.erro)
    carregar()
  }

  // ── Pagamento ──
  const formaAtual = ehFormaPagamento(a.forma_pagamento) ? a.forma_pagamento : null
  const statusPagamento = ehStatusPagamento(a.status_pagamento) ? a.status_pagamento : null
  // A forma atual aparece mesmo que a loja tenha desligado ela depois.
  const opcoesForma = formaAtual && !formas.includes(formaAtual) ? [formaAtual, ...formas] : formas

  async function salvarPagamento(novaForma: FormaPagamento | null, novoStatus: StatusPagamento | null) {
    setErroPagamento(null)
    setEnviando(true)
    const r = await atualizarPagamento(a.id_agendamento, novaForma, novoStatus)
    setEnviando(false)
    if (r.erro) setErroPagamento(r.erro)
    carregar()
  }

  async function escolherProfissional(idFuncionario: string | null) {
    setErro(null)
    setEnviando(true)
    const r = await atribuirProfissional(ctx, a.id_agendamento, idFuncionario)
    setEnviando(false)
    if (r.erro) return setErro(r.erro)
    carregar()
  }

  // ── Plano ──
  const disponivel = a.beneficio?.disponivel ?? null
  const usado = a.beneficio?.usado ?? null
  const restantes = disponivel ? disponivel.quantidade - disponivel.usados : 0

  async function mexerNoPlano(acao: 'usarBeneficioAction' | 'estornarBeneficioAction') {
    setErroPlano(null)
    setMexendoNoPlano(true)
    const r = await chamarAcao(acao, a.id_agendamento)
    setMexendoNoPlano(false)
    if (r.error) setErroPlano(r.error)
    carregar()
  }

  // ── Transporte ──
  const transporte = a.transporte
  const transporteAberto = transporte && transporte.status !== 'concluida' ? transporte : null
  // Pet já na loja: só a entrega ainda pode mudar.
  const petNaLoja = a.status === 'Em andamento' || a.status === 'Concluído'
    || (!!transporte && ['entregue_loja', 'pronto_entrega'].includes(transporte.status))
    || (transporte?.status === 'concluida' && transporte.modalidade === 'buscar')
  const modalidades: readonly ModalidadeTaxiDog[] = petNaLoja ? ['entregar'] : ['buscar', 'entregar', 'buscar_entregar']
  const transporteBloqueado = !!transporteAberto && EM_MOVIMENTO.includes(transporteAberto.status)
  // Um TaxiDog por visita: pode ter sido pedido em outro serviço do pet no dia.
  const daVisita = !!transporte && transporte.id_agendamento !== a.id_agendamento

  function abrirTransporte() {
    setEstadoTransporte(
      transporteAberto
        ? {
            ...ESTADO_TRANSPORTE_INICIAL,
            opcao: petNaLoja && transporteAberto.modalidade === 'buscar' ? 'levar' : 'taxidog',
            modalidade: petNaLoja ? 'entregar' : transporteAberto.modalidade,
            endereco: { ...transporteAberto.enderecoCampos, cep: mascaraCep(transporteAberto.enderecoCampos.cep) },
          }
        : { ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar', modalidade: petNaLoja ? 'entregar' : 'buscar_entregar' },
    )
    setErroTransporte(null)
    setAvisoTransporte(null)
    setEditandoTransporte(true)
  }

  async function salvarTransporte() {
    const escolha = estadoTransporte.opcao === 'taxidog' ? escolhaDoTransporte(estadoTransporte) : null
    if (estadoTransporte.opcao === 'taxidog' && !escolha) return
    setErroTransporte(null)
    setSalvandoTransporte(true)
    const r = await chamarAcao<{ mensagem?: string }>(
      'alterarTransporteAction',
      a.id_agendamento,
      escolha ? { modalidade: escolha.modalidade, endereco: escolha.endereco } : null,
    )
    setSalvandoTransporte(false)
    if (r.error) return setErroTransporte(r.error)
    setAvisoTransporte(r.mensagem ?? 'Transporte atualizado.')
    setEditandoTransporte(false)
    carregar()
  }

  const totalProdutos = a.produtos.reduce((s, p) => s + p.quantidade * p.preco_unitario, 0)
  const IconeOrigem = a.origem === 'loja' ? IconStore : IconLink

  return (
    <ScreenContainer onRefresh={carregar} refreshing={false}>
      <DetailHeader title="Detalhes do agendamento" junto />

      {erro && <Aviso tipo="erro" texto={erro} style={styles.aviso} />}
      {aviso && <Aviso tipo="info" texto={aviso} style={styles.aviso} />}
      {cancelado && (
        <Aviso
          tipo="alerta"
          style={styles.aviso}
          texto={`Cancelado ${QUEM_CANCELOU[a.cancelado_por ?? ''] ?? ''}${a.motivo_cancelamento ? ` — ${a.motivo_cancelamento}` : ''}`.trim()}
        />
      )}

      <View style={styles.corpo}>
        <Linha rotulo="Cliente" valor={a.cliente?.nome ?? 'Cliente excluído'} />
        <Linha rotulo="Pet" valor={a.pet?.nome ?? 'Pet excluído'} />
        <Linha rotulo="Serviço" valor={a.servico?.nome ?? 'Serviço'} />
        {/* Só o app mostra: o site ainda não lista os produtos nesta janela. */}
        {a.produtos.length > 0 && (
          <Linha rotulo="Produtos" valor={`${a.produtos.map(p => `${p.quantidade}× ${p.nome}`).join(', ')} — ${formatarMoeda(totalProdutos)}`} />
        )}

        {alteracoes.length > 0 && (
          <View style={styles.alteracoes}>
            <Text style={styles.blocoTitulo}>Alterações</Text>
            <View style={{ gap: 4 }}>
              {alteracoes.map((l, i) => (
                <Text key={`${l.em}-${i}`} style={styles.alteracao}>
                  <Text style={styles.apoio}>{quando(l.em)}</Text>{' '}
                  <Text style={[styles.forte, l.quem === 'Cliente' && { color: colors.warningFg }]}>{l.quem}</Text> {l.texto}
                </Text>
              ))}
            </View>
          </View>
        )}

        <Linha rotulo="Data" valor={dataBR(a.dt_agendamento)} />
        <Linha rotulo="Horário" valor={a.hr_agendamento.slice(0, 5)} />
        <Linha rotulo="Valor" valor={formatarMoeda(a.valor)} />
        {a.origem && (
          <Linha rotulo="Origem">
            <View style={styles.origem}>
              <IconeOrigem size={13} color={colors.text} />
              <Text style={styles.valor}>{ROTULO_ORIGEM[a.origem]}</Text>
            </View>
          </Linha>
        )}

        {/* Transporte */}
        {(transporte || taxidogAtivo) && !cancelado && (
          <View style={styles.bloco}>
            <View style={styles.blocoTopo}>
              <TituloDoBloco icone={IconCar} texto="Transporte" />
              {podeGerenciar && comSite && !transporteBloqueado && (
                <BotaoPequeno rotulo={transporte ? 'Alterar' : 'Adicionar TaxiDog'} onPress={abrirTransporte} />
              )}
            </View>

            {transporte ? (
              <View style={{ gap: 2 }}>
                <View style={styles.entre}>
                  <Text style={styles.texto}>{daVisita ? 'TaxiDog da visita' : 'TaxiDog'} · {ROTULO_MODALIDADE[transporte.modalidade]}</Text>
                  <Text style={[styles.texto, daVisita ? styles.apoioCor : styles.sucesso]}>{formatarMoeda(transporte.valor)}</Text>
                </View>
                <Text style={styles.apoio}>{rotuloTransporte(transporte)} · {transporte.endereco}</Text>
                {daVisita && (
                  <Text style={[styles.apoio, { color: colors.infoFg }]}>
                    Pedido no agendamento de outro serviço do pet neste dia — é o mesmo transporte (um TaxiDog por visita), e a taxa está nele.
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[styles.texto, styles.apoioCor]}>Sem TaxiDog — o cliente leva e busca o pet.</Text>
            )}

            {transporteBloqueado && <Text style={styles.apoio}>O pet está com o TaxiDog agora — dá para alterar depois que ele chegar.</Text>}
            {avisoTransporte && <Text style={[styles.apoio, { color: colors.successFg }]}>{avisoTransporte}</Text>}
          </View>
        )}

        {/* Plano */}
        {!cancelado && (usado || disponivel) && (
          <View style={styles.bloco}>
            <TituloDoBloco icone={IconRepeat} texto="Plano" />
            {usado ? (
              <>
                <Text style={styles.texto}>
                  Incluído no plano <Text style={styles.forte}>{usado.plano}</Text>
                  {Number(usado.valor_abatido) > 0 ? ` — ${formatarMoeda(Number(usado.valor_abatido))} do serviço saíram deste agendamento` : ''}.
                </Text>
                {podeGerenciar && comSite && (
                  <BotaoPequeno
                    rotulo={mexendoNoPlano ? 'Desfazendo...' : 'Desfazer uso do benefício'}
                    variante="fantasma"
                    desativado={mexendoNoPlano}
                    style={styles.aEsquerda}
                    onPress={() => mexerNoPlano('estornarBeneficioAction')}
                  />
                )}
              </>
            ) : disponivel && restantes > 0 ? (
              <>
                <Text style={styles.texto}>
                  Este serviço está incluído no plano do cliente (<Text style={styles.forte}>{disponivel.plano}</Text>: {restantes} de {disponivel.quantidade} restante{restantes !== 1 ? 's' : ''} no período).
                </Text>
                {podeGerenciar && comSite && (
                  <BotaoPequeno
                    rotulo={mexendoNoPlano ? 'Usando...' : 'Usar benefício do plano'}
                    variante="sucesso"
                    desativado={mexendoNoPlano}
                    style={styles.aEsquerda}
                    onPress={() => mexerNoPlano('usarBeneficioAction')}
                  />
                )}
              </>
            ) : disponivel ? (
              <Text style={[styles.texto, styles.apoioCor]}>
                Os usos deste serviço no plano {disponivel.plano} acabaram neste período ({disponivel.usados} de {disponivel.quantidade}) — ele fica como avulso.
              </Text>
            ) : null}
            {erroPlano && <Text style={[styles.apoio, { color: colors.dangerFg }]}>{erroPlano}</Text>}
          </View>
        )}

        {/* Pagamento */}
        {!cancelado && (
          ehFormaPlano(a.forma_pagamento) ? (
            // Pedido coberto pelo plano (migration 082): nada a escolher nem a receber.
            <View style={styles.bloco}>
              <TituloDoBloco icone={IconMoney} texto="Pagamento" />
              <Text style={styles.texto}>{ROTULO_FORMA_PLANO}</Text>
              <Text style={styles.apoio}>Coberto pelo plano — nada a pagar neste agendamento.</Text>
            </View>
          ) : (
            <View style={styles.bloco}>
              <View style={styles.blocoTopo}>
                <TituloDoBloco icone={IconMoney} texto="Pagamento" />
                {/* Quem pode alterar vê o status na escolha logo abaixo. */}
                {statusPagamento && !podeGerenciar && <StatusBadge status={STATUS_DO_SELO[statusPagamento]} rotulo={ROTULO_STATUS_PAGAMENTO[statusPagamento]} />}
              </View>

              {podeGerenciar ? (
                <View style={styles.pagamento}>
                  <FormasDePagamento formas={opcoesForma} valor={formaAtual} desativado={enviando} onChange={f => salvarPagamento(f, null)} />
                  <Segmentos<StatusPagamento>
                    cheio
                    rotulo="Status do pagamento"
                    valor={statusPagamento}
                    desativado={enviando || !formaAtual}
                    opcoes={STATUS_QUE_A_LOJA_ESCOLHE.map(st => ({ valor: st, rotulo: ROTULO_STATUS_PAGAMENTO[st] }))}
                    onChange={st => salvarPagamento(null, st)}
                  />
                </View>
              ) : (
                <Text style={styles.texto}>{formaAtual ? ROTULO_FORMA_PAGAMENTO[formaAtual] : 'Não informada'}</Text>
              )}
              {!formaAtual && podeGerenciar && <Text style={styles.apoio}>Sem forma de pagamento registrada — escolha a forma.</Text>}
              {erroPagamento && <Text style={[styles.apoio, { color: colors.dangerFg }]}>{erroPagamento}</Text>}
            </View>
          )
        )}

        <Linha rotulo="Status"><StatusBadge status={a.status} /></Linha>

        {a.obs ? (
          <View style={[styles.linha, styles.linhaEmColuna]}>
            <Text style={styles.rotulo}>Descrição</Text>
            <Text style={styles.descricao}>{a.obs}</Text>
          </View>
        ) : null}
      </View>

      {/* Profissional responsável */}
      {acessoTotal && equipe.length > 0 && !cancelado ? (
        <View style={styles.grupo}>
          <Text style={styles.rotuloDoCampo}>Profissional responsável</Text>
          <Seletor
            titulo="Profissional responsável"
            valor={a.id_funcionario ?? ''}
            desativado={enviando}
            opcoes={[{ valor: '', rotulo: 'Sem profissional' }, ...equipe.map(f => ({ valor: f.id_funcionario, rotulo: f.nome }))]}
            onChange={v => escolherProfissional(v || null)}
          />
        </View>
      ) : (
        <View style={[styles.corpo, { marginTop: 12 }]}>
          <Linha rotulo="Profissional responsável" valor={a.funcionario?.nome ?? 'Sem profissional'} />
        </View>
      )}

      {/* Ações */}
      {podeGerenciar && emAberto && (
        <View style={styles.acoes}>
          {proxima && !aindaNaoEODia ? (
            <BotaoPequeno rotulo={proxima.acao} icone={IconCheck} variante="sucesso" style={styles.cresce} desativado={enviando} onPress={pedirAvanco} />
          ) : (
            <Text style={[styles.apoio, styles.cresce, { alignSelf: 'center' }]}>Iniciar e finalizar a partir do dia do agendamento.</Text>
          )}
          {a.status !== 'Em andamento' && (
            <BotaoPequeno rotulo="Remarcar" icone={IconCalendar} style={styles.cresce} onPress={() => router.push({ pathname: '/agendamentos/remarcar', params: { id: a.id_agendamento } })} />
          )}
          {a.status !== 'Em andamento' && (
            <BotaoPequeno rotulo="Editar" icone={IconPencil} style={styles.cresce} onPress={() => router.push({ pathname: '/agendamentos/editar', params: { id: a.id_agendamento } })} />
          )}
          {confirmandoCancelar ? (
            <View style={styles.confirmar}>
              <Text style={styles.apoio}>Cancelar este agendamento? Não dá para desfazer.</Text>
              <View style={styles.campos}>
                <BotaoPequeno rotulo="Sim, cancelar" variante="perigo" style={styles.campo} desativado={enviando} onPress={confirmarCancelamento} />
                <BotaoPequeno rotulo="Voltar" style={styles.campo} onPress={() => setConfirmandoCancelar(false)} />
              </View>
            </View>
          ) : (
            <BotaoPequeno rotulo="Cancelar" variante="perigo" style={styles.cresce} desativado={enviando} onPress={() => setConfirmandoCancelar(true)} />
          )}
        </View>
      )}

      {/* Transporte: trocar sem TaxiDog ↔ só busca ↔ só entrega ↔ busca e entrega */}
      <Folha visivel={editandoTransporte} titulo="Transporte" onFechar={() => setEditandoTransporte(false)} ocupado={salvandoTransporte}>
        {erroTransporte && <Aviso tipo="erro" texto={erroTransporte} />}
        {petNaLoja && <Text style={styles.apoio}>O pet já está na loja — só a entrega pode ser pedida ou retirada.</Text>}
        <EtapaTransporte
          compacto
          idLojista={ctx.idLojista}
          valor={estadoTransporte}
          onChange={setEstadoTransporte}
          loja={{
            idCliente: a.id_cliente,
            modalidades,
            rotuloLevar: petNaLoja ? 'Sem entrega' : 'Sem TaxiDog',
          }}
        />
        {transporteAberto?.naRota && <Text style={styles.apoio}>Este pet já está numa rota — o TaxiDog recebe o aviso da mudança.</Text>}
        <View style={styles.rodapeDaFolha}>
          <BotaoPequeno rotulo="Cancelar" desativado={salvandoTransporte} onPress={() => setEditandoTransporte(false)} />
          <BotaoPequeno
            rotulo="Salvar transporte"
            variante="primario"
            carregando={salvandoTransporte}
            desativado={!transportePronto(estadoTransporte)}
            onPress={salvarTransporte}
          />
        </View>
      </Folha>
    </ScreenContainer>
  )
}

// Linha "rótulo à esquerda, valor à direita" (`.dash-detail-row`).
function Linha({ rotulo, valor, children }: { rotulo: string; valor?: string; children?: ReactNode }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      {children ?? <Text style={styles.valor}>{valor}</Text>}
    </View>
  )
}

function TituloDoBloco({ icone: Icone, texto }: { icone: ComponentType<IconeProps>; texto: string }) {
  return (
    <View style={styles.blocoTituloLinha}>
      <Icone size={14} color="#1f2937" />
      <Text style={styles.blocoTitulo}>{texto}</Text>
    </View>
  )
}

// Medidas e cores da janela do site em 375 de largura.
const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aviso: { marginBottom: spacing.md },
  corpo: { gap: 12 },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  linhaEmColuna: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  rotulo: { fontSize: 14, lineHeight: 22.4, color: '#858d99' },
  valor: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text, textAlign: 'right' },
  descricao: { fontSize: 14, lineHeight: 22.4, color: colors.textDim },
  origem: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  // `.transporte-bloco`
  bloco: { gap: 4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  blocoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  blocoTituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blocoTitulo: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#1f2937' },
  entre: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  texto: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  forte: { fontWeight: '700' },
  sucesso: { fontWeight: '600', color: colors.successFg },
  apoio: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  apoioCor: { color: '#858d99' },
  aEsquerda: { alignSelf: 'flex-start' },
  campos: { flexDirection: 'row', gap: 8 },
  // `.pag-detalhe-campos`: as formas em botões e, embaixo, o status.
  pagamento: { gap: 8, marginTop: 4 },
  campo: { flex: 1 },
  // `.historico-alteracoes`
  alteracoes: { gap: 4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  alteracao: { fontSize: 13, color: colors.textDim },
  grupo: { marginTop: 16, gap: 4 },
  rotuloDoCampo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  // `.dash-detail-actions`: os botões dividem a linha e descem quando não cabem.
  acoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  cresce: { flexGrow: 1 },
  confirmar: { width: '100%', gap: 8 },
  rodapeDaFolha: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
})
