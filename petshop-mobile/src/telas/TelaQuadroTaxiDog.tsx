import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { format, subDays } from 'date-fns'
import { Aviso } from '@/components/Aviso'
import { BarraDoDia } from '@/components/BarraDoDia'
import { BarraTopo } from '@/components/BarraTopo'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { EsperaRetirada } from '@/components/EsperaRetirada'
import { CartaoVazio } from '@/components/CartaoVazio'
import { DetailHeader } from '@/components/DetailHeader'
import { Folha } from '@/components/Folha'
import { IconCar, IconChartBar, IconMapPin, IconRoute, IconUser, IconUserBadge, IconWhatsapp } from '@/components/IconesDoSite'
import {
  AcaoDoCartao,
  CartaoDoQuadro,
  CartoesDaEtapa,
  EtapaVazia,
  EtapasDoQuadro,
  VisoesDoQuadro,
  EtiquetaDoQuadro,
  EtiquetasDoCartao,
  LinhaDoCartao,
  NotaDoCartao,
  PeDoCartao,
  PetDoCartao,
  TopoDoCartao,
} from '@/components/Quadro'
import { ScreenContainer } from '@/components/ScreenContainer'
import { Seletor } from '@/components/Seletor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { useTaxiDogTempoReal } from '@/contexts/TaxiDogContext'
import { rotasDasCorridas, type RotaDaCorrida } from '@/hooks/useMinhasCorridas'
import { agoraBrasil, dataBR, hojeBrasilISO } from '@/lib/agenda'
import { dialogo } from '@/lib/dialogo'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { formatarTelefone, linkWhatsApp } from '@/lib/format'
import { assinarComSessao } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import {
  ROTULO_MODALIDADE,
  encerrada,
  enderecoCliente,
  formatarCep,
  formatarKm,
  formatarReais,
  grupoCorrida,
  normalizarCorrida,
  podeReatribuir,
  proximaAcaoCorrida,
  rotuloDaCorridaNoQuadro,
  type Corrida,
  type GrupoCorrida,
} from '@/lib/taxidog'
import { colors, typography } from '@/theme/theme'

// As quatro colunas do quadro do site, com as cores das etapas do
// atendimento (amarelo, azul, roxo, verde).
// `aba`: o nome da etapa na aba (cabe em um quarto da tela).
const COLUNAS: { grupo: GrupoCorrida; aba: string; status: string; vazio: string; vazioMotorista: string }[] = [
  { grupo: 'pendentes', aba: 'Pendentes', status: 'Pendente', vazio: 'Nenhuma corrida esperando TaxiDog.', vazioMotorista: 'Nenhuma corrida disponível agora.' },
  { grupo: 'atribuidas', aba: 'Atribuídas', status: 'Confirmado', vazio: 'Nenhuma corrida atribuída aguardando saída.', vazioMotorista: 'Nenhuma corrida sua aguardando saída.' },
  { grupo: 'andamento', aba: 'Andamento', status: 'Em andamento', vazio: 'Nenhum TaxiDog na rua agora.', vazioMotorista: 'Você não está em nenhuma corrida agora.' },
  { grupo: 'concluidas', aba: 'Concluídas', status: 'Concluído', vazio: 'Nenhuma corrida concluída ainda.', vazioMotorista: 'Nenhuma corrida concluída neste dia.' },
]

// Etapas finais pedem confirmação — evita um toque errado com o celular
// na mão.
const CONFIRMAR: Record<string, string> = {
  entregue_loja: 'Confirma que o pet foi entregue na loja?',
  concluida: 'Confirma que o pet foi entregue ao tutor? A corrida será concluída.',
}

// O TaxiDog vê só o dia de hoje; o que ficou aberto de um dia anterior
// (ex.: pronto para entrega à noite) continua no quadro até ele encerrar.
const DIAS_PARA_TRAS = 7

const COR_APAGADA = '#858d99'

function rotulo(c: Corrida) {
  return rotuloDaCorridaNoQuadro({ status: c.status, modalidade: c.modalidade, temTaxiDog: !!c.id_funcionario, statusAgendamento: c.status_agendamento })
}

// De que etapa são as cores do selo da situação.
function tom(c: Corrida) {
  if (c.status === 'cancelada') return 'Cancelado'
  const grupo = grupoCorrida(c.status, !!c.id_funcionario)
  return COLUNAS.find(col => col.grupo === grupo)?.status ?? 'neutro'
}

function abrirNoMapa(c: Corrida) {
  const destino = `${enderecoCliente(c)}, ${formatarCep(c.cep)}, Brasil`
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`)
}

// Quadro de corridas do TaxiDog — o do site (components/lojista/
// TaxiDogPainel.tsx) em largura de celular. Dois usos, como lá:
//   • `loja`: dono e equipe com agenda, dentro do Gestor de Agendamentos
//     ("Visualizar TaxiDog") — todas as corridas do dia, com a escolha do
//     TaxiDog em cada card;
//   • `motorista`: "Minhas corridas" de quem é TaxiDog — as dele e as que
//     ainda estão sem TaxiDog.
// Nos dois, a etapa seguinte é um botão no próprio card. Mudou lá, muda aqui.
export function TelaQuadroTaxiDog({ modo }: { modo: 'loja' | 'motorista' }) {
  const { contexto, user } = useAuth()
  const router = useRouter()
  const { versao, marcarFeitoPorMim } = useTaxiDogTempoReal()
  const motorista = modo === 'motorista'
  const idLojista = contexto?.idLojista
  // Em "Minhas corridas" ninguém distribui corridas — nem quem também
  // gerencia a agenda: ali ele é TaxiDog.
  const gestor = !!contexto?.podeGerenciarAgenda
  const podeAtribuir = gestor && !motorista
  // "Atribuir para mim": quem é TaxiDog e não distribui as corridas.
  const podeAssumir = !!contexto?.podeTaxidog && !podeAtribuir
  const pode = motorista ? !!contexto?.podeTaxidog : gestor

  const hoje = hojeBrasilISO()
  // `data`: o dia em que a pessoa estava no Gestor de Agendamentos.
  const { data: dataInicial } = useLocalSearchParams<{ data?: string }>()
  const [data, setData] = useState(!motorista && dataInicial && /^\d{4}-\d{2}-\d{2}$/.test(dataInicial) ? dataInicial : hoje)

  const [corridas, setCorridas] = useState<Corrida[]>([])
  const [rotaPorCorrida, setRotaPorCorrida] = useState<Record<string, RotaDaCorrida>>({})
  const [taxidogs, setTaxidogs] = useState<{ id_funcionario: string; nome: string }[]>([])
  const [taxidogAtivo, setTaxidogAtivo] = useState(true)
  const [carregadoEm, setCarregadoEm] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [etapaEscolhida, setEtapaEscolhida] = useState<GrupoCorrida | null>(null)
  // Corridas com uma ação ainda sendo gravada. Cada uma grava por conta
  // própria: mexer numa não trava as outras.
  const [emAcao, setEmAcao] = useState<Set<string>>(new Set())
  const emAcaoAgora = useRef(new Set<string>())
  // O que cada ação em curso já mudou na tela (a corrida troca de etapa na
  // hora); uma recarga no meio do caminho não desfaz.
  const pendentes = useRef(new Map<string, Partial<Corrida>>())
  // Sobe a cada gravação concluída: uma recarga que começou antes dela traz
  // a lista antiga e é descartada.
  const geracao = useRef(0)
  const [abertaId, setAbertaId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const geracaoNoInicio = geracao.current
    const inicio = motorista ? format(subDays(agoraBrasil(), DIAS_PARA_TRAS), 'yyyy-MM-dd') : data
    const [lista, config, publicos] = await Promise.all([
      supabase.rpc('fn_listar_corridas', { p_data_ini: inicio, p_data_fim: data }),
      supabase.from('taxidog_config').select('ativo').eq('id_lojista', idLojista).maybeSingle(),
      podeAtribuir ? supabase.rpc('fn_taxidogs_publicos', { p_id_lojista: idLojista }) : Promise.resolve({ data: [] }),
    ])
    // Uma gravação terminou enquanto esta lista vinha: ela já está velha.
    if (geracaoNoInicio !== geracao.current) return void carregar()
    if (lista.error) {
      setErroCarga(faltaMigration(lista.error) ? 'O TaxiDog ainda não foi ativado no sistema da loja.' : 'Não foi possível carregar as corridas.')
    } else {
      const todas = ((lista.data ?? []) as Record<string, unknown>[]).map(normalizarCorrida)
      // De dias anteriores, só o que ainda está aberto.
      // Quem gerencia a agenda recebe todas as corridas da loja; em "Minhas
      // corridas" ficam só as dele e as ainda sem TaxiDog.
      const minhas = motorista && gestor ? todas.filter(c => !c.id_funcionario || c.id_funcionario === user?.id) : todas
      const doQuadro = minhas.filter(c => c.dt_agendamento === data || (motorista && c.dt_agendamento < data && !encerrada(c.status)))
      setErroCarga(null)
      setCorridas(doQuadro.map(c => {
        const mudanca = pendentes.current.get(c.id_corrida)
        return mudanca ? { ...c, ...mudanca } : c
      }))
      setRotaPorCorrida(await rotasDasCorridas(doQuadro.map(c => c.id_corrida)))
    }
    setTaxidogAtivo(!!(config.data as { ativo: boolean | null } | null)?.ativo)
    setTaxidogs((publicos.data ?? []) as { id_funcionario: string; nome: string }[])
    setCarregadoEm(data)
    setLoading(false)
  }, [idLojista, pode, motorista, podeAtribuir, gestor, user?.id, data])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))
  useEffect(() => { if (versao > 0) carregar() }, [versao, carregar])

  // Ao vivo para a loja (o aviso do TaxiDogContext só existe para quem é
  // TaxiDog): corrida nova, TaxiDog apertou "Cheguei"...
  useEffect(() => {
    if (motorista || !idLojista || !pode) return
    const canal = supabase
      .channel(`quadro-taxidog-${idLojista}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${idLojista}` }, () => carregar())
    return assinarComSessao(canal)
  }, [motorista, idLojista, pode, carregar])

  const grupos = useMemo(() => {
    const g: Record<GrupoCorrida, Corrida[]> = { pendentes: [], atribuidas: [], andamento: [], concluidas: [] }
    for (const c of corridas) {
      const k = grupoCorrida(c.status, !!c.id_funcionario)
      if (k) g[k].push(c)
    }
    return g
  }, [corridas])

  const aberta = corridas.find(c => c.id_corrida === abertaId) ?? null
  // Os números são do dia mostrado — o que sobrou de dias anteriores aparece
  // no quadro, mas não entra na conta.
  const doDia = corridas.filter(c => c.dt_agendamento === data)
  const contadas = motorista ? doDia.filter(c => c.id_funcionario) : doDia
  const canceladas = contadas.filter(c => c.status === 'cancelada').length
  const totalCorridas = contadas.length - canceladas
  const totalDia = contadas.filter(c => c.status !== 'cancelada').reduce((soma, c) => soma + c.valor, 0)

  // `otimista`: como a corrida fica se der certo — aparece na tela na hora,
  // sem esperar o banco; se ele recusar, a lista volta ao que era.
  async function executar(
    idCorrida: string,
    acao: () => PromiseLike<{ error: { message?: string; code?: string } | null }>,
    padrao: string,
    otimista?: Partial<Corrida>,
  ): Promise<boolean> {
    if (emAcaoAgora.current.has(idCorrida)) return false
    setErro(null)
    const marcar = (ligado: boolean) => {
      if (ligado) emAcaoAgora.current.add(idCorrida); else emAcaoAgora.current.delete(idCorrida)
      setEmAcao(new Set(emAcaoAgora.current))
    }
    marcar(true)
    if (otimista) {
      pendentes.current.set(idCorrida, otimista)
      setCorridas(atuais => atuais.map(c => (c.id_corrida === idCorrida ? { ...c, ...otimista } : c)))
    }
    const { error } = await acao()
    pendentes.current.delete(idCorrida)
    geracao.current += 1
    marcar(false)
    if (error) {
      setErro(mensagemDoBanco(error, padrao))
      await carregar()
      return false
    }
    // Confirma com o banco sem segurar a tela.
    void carregar()
    return true
  }

  const atribuir = (c: Corrida, idFuncionario: string | null) =>
    executar(
      c.id_corrida,
      () => supabase.rpc('fn_atribuir_corrida', { p_id_corrida: c.id_corrida, p_id_funcionario: idFuncionario }),
      'Não foi possível atribuir a corrida.',
      { id_funcionario: idFuncionario, funcionario_nome: taxidogs.find(t => t.id_funcionario === idFuncionario)?.nome ?? null },
    )

  function assumir(c: Corrida) {
    marcarFeitoPorMim(c.id_corrida)
    executar(
      c.id_corrida,
      () => supabase.rpc('fn_assumir_corrida', { p_id_corrida: c.id_corrida }),
      'Não foi possível assumir a corrida.',
      user ? { id_funcionario: user.id, funcionario_nome: c.funcionario_nome ?? 'Você' } : undefined,
    )
  }

  function avancar(c: Corrida, novoStatus: string) {
    const seguir = () => {
      marcarFeitoPorMim(c.id_corrida)
      executar(
        c.id_corrida,
        () => supabase.rpc('fn_avancar_corrida', { p_id_corrida: c.id_corrida, p_novo_status: novoStatus }),
        'Não foi possível atualizar a corrida.',
        { status: novoStatus as Corrida['status'] },
      )
    }
    const pergunta = CONFIRMAR[novoStatus]
    if (!pergunta) return seguir()
    dialogo('Confirmar', pergunta, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar', onPress: seguir },
    ])
  }

  const cancelar = (c: Corrida) =>
    executar(c.id_corrida, () => supabase.rpc('fn_cancelar_corrida', { p_id_corrida: c.id_corrida }), 'Não foi possível cancelar o TaxiDog.')

  // O TaxiDog responsável: uma caixa de escolha para quem distribui as
  // corridas (enquanto dá para trocar); para os outros, só o nome.
  const seletorDe = (c: Corrida) => {
    if (!podeAtribuir || rotaPorCorrida[c.id_corrida] || !podeReatribuir(c.status)) {
      return <Text style={styles.responsavel}>{c.funcionario_nome ?? 'Sem TaxiDog'}</Text>
    }
    const opcoes = [
      { valor: '', rotulo: 'Sem TaxiDog (pendente)' },
      ...taxidogs.map(t => ({ valor: t.id_funcionario, rotulo: t.nome })),
      ...(c.id_funcionario && !taxidogs.some(t => t.id_funcionario === c.id_funcionario)
        ? [{ valor: c.id_funcionario, rotulo: c.funcionario_nome ?? 'TaxiDog atual' }]
        : []),
    ]
    return (
      <Seletor
        compacto
        titulo="TaxiDog responsável"
        valor={c.id_funcionario ?? ''}
        opcoes={opcoes}
        desativado={emAcao.has(c.id_corrida)}
        style={styles.seletor}
        onChange={id => { atribuir(c, id || null) }}
      />
    )
  }

  const cabecalho = motorista ? (
    <>
      <Text style={styles.titulo}>Corridas</Text>
      <Text style={styles.subtitulo}>Só as de hoje</Text>
    </>
  ) : (
    <>
      {/* Com o Gestor desligado, esta tela é a "TaxiDog" do menu. */}
      <DetailHeader title={contexto?.kanbanAtivo ? 'Gestor de Agendamentos' : 'TaxiDog'} junto />
      {/* O que o quadro mostra: volta para os agendamentos, no mesmo dia. */}
      {contexto?.kanbanAtivo && (
        <VisoesDoQuadro
          ativa="taxidog"
          style={styles.trocaDeVisao}
          onTrocar={() => router.replace({ pathname: '/agendamentos/gestor', params: { data } })}
        />
      )}
      {/* Os atalhos do TaxiDog, lado a lado embaixo da troca de visão. */}
      <View style={styles.atalhos}>
        <BotaoPequeno icone={IconChartBar} rotulo="Relatório" style={styles.atalho} onPress={() => router.push('/agendamentos/relatorio-corridas')} />
        <BotaoPequeno icone={IconRoute} rotulo="Rotas" style={styles.atalho} onPress={() => router.push({ pathname: '/agendamentos/rotas-taxidog', params: { data } })} />
      </View>
    </>
  )

  if (!contexto || !pode) {
    return (
      <ScreenContainer topo={motorista ? <BarraTopo /> : undefined}>
        {cabecalho}
        <CartaoVazio
          ilustracao="sem-permissao"
          titulo="Sem permissão para acompanhar as corridas"
          texto="Fale com o responsável pelo petshop para liberar o acesso à agenda."
        />
      </ScreenContainer>
    )
  }

  // Trocando de dia, o quadro do dia anterior fica à vista, apagado.
  const desatualizado = carregadoEm !== data
  // A etapa aberta nas abas. Sem escolha, a primeira que tem corrida (o que
  // está pendente pede ação antes).
  const etapaAberta = etapaEscolhida ?? COLUNAS.find(col => grupos[col.grupo].length > 0)?.grupo ?? 'pendentes'
  const colunaAberta = COLUNAS.find(col => col.grupo === etapaAberta) ?? COLUNAS[0]

  return (
    <ScreenContainer topo={motorista ? <BarraTopo /> : undefined} refreshing={loading && corridas.length > 0} onRefresh={carregar}>
      {cabecalho}

      {!motorista && !loading && !taxidogAtivo && (
        <View style={styles.aviso}>
          <Aviso tipo="info" texto="O TaxiDog está desativado — novos clientes não conseguem pedir." />
          {contexto.acessoTotal && (
            <Text style={styles.link} onPress={() => router.push('/mais/taxidog-config')}>Configurar TaxiDog</Text>
          )}
        </View>
      )}

      <View style={styles.barra}>
        <BarraDoDia data={data} hoje={hoje} semSetas={motorista} onMudar={d => { setErro(null); setData(d) }} />
        <View style={styles.totais}>
          <Text style={styles.total}><Text style={styles.totalForte}>{totalCorridas}</Text> {totalCorridas === 1 ? 'corrida' : 'corridas'}</Text>
          <Text style={styles.total}>Total do dia <Text style={styles.totalValor}>{formatarReais(totalDia)}</Text></Text>
          {canceladas > 0 && <Text style={styles.total}>{canceladas} cancelada{canceladas > 1 ? 's' : ''}</Text>}
        </View>
      </View>

      {podeAtribuir && !loading && taxidogs.length === 0 && corridas.length > 0 && (
        <View style={styles.aviso}>
          <Aviso tipo="alerta" texto="Nenhum funcionário está habilitado como TaxiDog. Habilite em Equipe para poder atribuir as corridas." />
        </View>
      )}
      {(erroCarga || (erro && !aberta)) && (
        <View style={styles.aviso}><Aviso tipo="erro" texto={erroCarga ?? erro ?? ''} /></View>
      )}

      {loading && corridas.length === 0 ? null : corridas.length === 0 ? (
        <View style={desatualizado && styles.carregando}>
          <CartaoVazio
            ilustracao="taxidog"
            titulo="Nenhuma corrida neste dia"
            texto={motorista
              ? 'Quando um cliente pedir TaxiDog, a corrida aparece aqui para você pegar — ou a loja atribui a você.'
              : 'As corridas aparecem aqui quando um cliente pede TaxiDog no agendamento.'}
          />
        </View>
      ) : (
        <>
          {/* As etapas em abas; só os cards da escolhida aparecem. */}
          <EtapasDoQuadro
            etapas={COLUNAS.map(col => ({ id: col.grupo, rotulo: col.aba, status: col.status, total: grupos[col.grupo].length }))}
            valor={etapaAberta}
            onChange={setEtapaEscolhida}
          />
          <CartoesDaEtapa style={desatualizado && styles.carregando}>
              {grupos[etapaAberta].length === 0 ? (
                <EtapaVazia>{motorista ? colunaAberta.vazioMotorista : colunaAberta.vazio}</EtapaVazia>
              ) : grupos[etapaAberta].map(c => {
                const rota = rotaPorCorrida[c.id_corrida]
                return (
                  <CartaoDoQuadro
                    key={c.id_corrida}
                    onPress={() => {
                      if (motorista) return router.push(`/taxidog/corrida/${c.id_corrida}` as never)
                      setErro(null)
                      setAbertaId(c.id_corrida)
                    }}
                  >
                    <TopoDoCartao
                      hora={c.hr_agendamento.slice(0, 5)}
                      dia={c.dt_agendamento === data ? null : dataBR(c.dt_agendamento).slice(0, 5)}
                      valor={formatarReais(c.valor)}
                    />
                    <PetDoCartao foto={c.pet_foto_url} nome={c.pet_nome} />
                    <LinhaDoCartao icone={IconUser}>{c.cliente_nome} · {formatarTelefone(c.cliente_telefone)}</LinhaDoCartao>
                    <LinhaDoCartao icone={IconMapPin} final>{c.bairro} · {c.logradouro}, {c.numero}</LinhaDoCartao>
                    <EtiquetasDoCartao>
                      <EtiquetaDoQuadro>{ROTULO_MODALIDADE[c.modalidade]}</EtiquetaDoQuadro>
                      {rota && <EtiquetaDoQuadro tom="Em andamento">Rota #{rota.numero}</EtiquetaDoQuadro>}
                      {/* Sem TaxiDog, na visão do TaxiDog, o botão do card já diz o estado. */}
                      {!(motorista && !c.id_funcionario) && <EtiquetaDoQuadro tom={tom(c)}>{rotulo(c)}</EtiquetaDoQuadro>}
                    </EtiquetasDoCartao>
                    {/* O TaxiDog não precisa ver o próprio nome em todo card. */}
                    {!motorista && <PeDoCartao icone={IconUserBadge} tamanho={12}>{seletorDe(c)}</PeDoCartao>}
                    {rota ? (
                      // Corrida de rota anda pela rota: o TaxiDog abre a tela dela; a loja, as rotas do dia.
                      <AcaoDoCartao>
                        <BotaoPequeno
                          rotulo={`Ver Rota #${rota.numero}`}
                          onPress={() => (motorista
                            ? router.push(`/taxidog/rota/${rota.id_rota}` as never)
                            : router.push({ pathname: '/agendamentos/rotas-taxidog', params: { data: c.dt_agendamento, rota: rota.id_rota } }))}
                        />
                      </AcaoDoCartao>
                    ) : (
                      <AcaoDaCorrida
                        c={c}
                        podeAssumir={podeAssumir}
                        daLoja={!motorista}
                        ocupado={emAcao.has(c.id_corrida)}
                        carregando={false}
                        onAssumir={() => assumir(c)}
                        onAvancar={status => avancar(c, status)}
                        onCancelada={() => void carregar()}
                      />
                    )}
                  </CartaoDoQuadro>
                )
              })}
          </CartoesDaEtapa>
        </>
      )}

      {aberta && (
        <FolhaCorrida
          corrida={aberta}
          rota={rotaPorCorrida[aberta.id_corrida] ?? null}
          erro={erro}
          ocupado={emAcao.has(aberta.id_corrida)}
          podeAtribuir={podeAtribuir}
          seletor={seletorDe(aberta)}
          onFechar={() => { setAbertaId(null); setErro(null) }}
          onAvancar={status => avancar(aberta, status)}
          onCancelar={() => cancelar(aberta)}
          onCanceladaPorEspera={() => { setAbertaId(null); void carregar() }}
        />
      )}
    </ScreenContainer>
  )
}

// O que fica no pé do card. Sem TaxiDog: "Aguardando aceite da loja"
// (amarelo, enquanto o agendamento está Pendente) ou "Atribuir para mim".
// Com TaxiDog: a próxima etapa ("Cheguei", "Pet entregue"...), sem precisar
// abrir o detalhe.
function AcaoDaCorrida({ c, podeAssumir, daLoja, ocupado, carregando, onAssumir, onAvancar, onCancelada }: {
  c: Corrida
  podeAssumir: boolean
  // Quem vê é a loja: o aviso de "aceite antes" fala com ela.
  daLoja: boolean
  ocupado: boolean
  carregando: boolean
  onAssumir: () => void
  onAvancar: (status: string) => void
  onCancelada?: () => void
}) {
  const pendenteNaLoja = c.status_agendamento === 'Pendente'
  const aguardandoAceite = (
    <AcaoDoCartao>
      <View style={styles.aguardando}>
        <Text style={styles.aguardandoTexto}>Aguardando aceite da loja</Text>
      </View>
    </AcaoDoCartao>
  )

  if (!c.id_funcionario) {
    if (!podeAssumir || !podeReatribuir(c.status)) return null
    if (pendenteNaLoja) return aguardandoAceite
    return (
      <AcaoDoCartao>
        <Text style={styles.disponivel}>Disponível para atribuição</Text>
        <BotaoPequeno variante="primario" rotulo="Atribuir para mim" carregando={carregando} desativado={ocupado} onPress={onAssumir} />
      </AcaoDoCartao>
    )
  }

  const acao = proximaAcaoCorrida(c.status, c.modalidade)
  if (acao?.status === 'a_caminho_cliente' && pendenteNaLoja) {
    return daLoja ? <NotaDoCartao>Aceite o agendamento antes</NotaDoCartao> : aguardandoAceite
  }
  if (acao) {
    return (
      <AcaoDoCartao>
        <BotaoPequeno variante="primario" rotulo={acao.rotulo} carregando={carregando} desativado={ocupado} onPress={() => onAvancar(acao.status)} />
        {c.status === 'no_endereco' && <EsperaRetirada idCorrida={c.id_corrida} pet={c.pet_nome} onCancelada={onCancelada} />}
      </AcaoDoCartao>
    )
  }
  if (c.status === 'entregue_loja' || (c.status === 'agendada' && c.modalidade === 'entregar')) {
    return <NotaDoCartao>Aguardando o serviço terminar para a entrega</NotaDoCartao>
  }
  return null
}

function horaDe(ts: string) {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Detalhe da corrida para a loja — a janela do site (DetalheCorrida): os
// dados do tutor e do endereço, quem é o TaxiDog, o histórico, o atalho
// para o mapa, cancelar só o TaxiDog e a etapa seguinte.
function FolhaCorrida({ corrida: c, rota, erro, ocupado, podeAtribuir, seletor, onFechar, onAvancar, onCancelar, onCanceladaPorEspera }: {
  corrida: Corrida
  rota: RotaDaCorrida | null
  erro: string | null
  ocupado: boolean
  podeAtribuir: boolean
  seletor: ReactNode
  onFechar: () => void
  onAvancar: (status: string) => void
  onCancelar: () => void
  onCanceladaPorEspera: () => void
}) {
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)
  // Corrida de rota anda pela rota, não por aqui.
  const acao = rota ? null : proximaAcaoCorrida(c.status, c.modalidade)
  const precisaTaxiDog = !!acao && (acao.status === 'a_caminho_cliente' || acao.status === 'a_caminho_entrega') && !c.id_funcionario
  // A busca só sai depois de a loja aceitar o agendamento.
  const aguardandoAceite = acao?.status === 'a_caminho_cliente' && c.status_agendamento === 'Pendente'
  const comportamento = (c.pet_comportamento ?? []).filter(Boolean)
  const observacoes = [c.obs_agendamento, c.pet_obs, c.pet_obs_comportamento].filter(Boolean) as string[]
  const whatsapp = linkWhatsApp(c.cliente_telefone)

  return (
    <Folha visivel titulo={c.pet_nome} icone={IconCar} ocupado={ocupado} onFechar={onFechar}>
      <View style={styles.situacao}>
        <EtiquetaDoQuadro tom={tom(c)}>{rotulo(c)}</EtiquetaDoQuadro>
      </View>

      {erro && <View style={styles.aviso}><Aviso tipo="erro" texto={erro} /></View>}

      <Linha rotulo="Tutor" valor={c.cliente_nome} />
      <Linha rotulo="Telefone">
        <View style={styles.telefone}>
          <Text style={styles.valor}>{formatarTelefone(c.cliente_telefone)}</Text>
          {whatsapp && (
            <Pressable onPress={() => Linking.openURL(whatsapp)} accessibilityRole="link" accessibilityLabel="WhatsApp" hitSlop={8}>
              <IconWhatsapp size={14} color={colors.primary600} />
            </Pressable>
          )}
        </View>
      </Linha>
      <Linha rotulo="Endereço">
        <View style={styles.doisAndares}>
          <Text style={styles.valor}>{enderecoCliente(c)}</Text>
          <Text style={styles.apoio}>CEP {formatarCep(c.cep)}</Text>
        </View>
      </Linha>
      <Linha rotulo="Horário" valor={`${dataBR(c.dt_agendamento)} às ${c.hr_agendamento.slice(0, 5)}`} />
      <Linha rotulo="Tipo de transporte" valor={ROTULO_MODALIDADE[c.modalidade]} />
      <Linha rotulo="Valor da corrida">
        <View style={styles.doisAndares}>
          <Text style={[styles.valor, styles.valorVerde]}>{formatarReais(c.valor)}</Text>
          {(c.criterio || c.distancia_km != null) && (
            <Text style={styles.apoio}>{[c.criterio, c.distancia_km != null ? `~${formatarKm(c.distancia_km)}` : null].filter(Boolean).join(' · ')}</Text>
          )}
        </View>
      </Linha>
      {c.servicos ? <Linha rotulo="Serviço" valor={c.servicos} /> : null}
      <Linha rotulo="TaxiDog responsável">
        <View style={styles.seletorDaFolha}>{seletor}</View>
      </Linha>
      {rota && <Linha rotulo="Rota" valor={`Rota #${rota.numero}`} />}

      {(observacoes.length > 0 || comportamento.length > 0) && (
        <View style={styles.observacoes}>
          <Text style={styles.apoio}>Observações importantes</Text>
          {comportamento.length > 0 && (
            <View style={styles.comportamento}>
              {comportamento.map(t => <EtiquetaDoQuadro key={t} tom="Pendente">{t}</EtiquetaDoQuadro>)}
            </View>
          )}
          {observacoes.map((o, i) => <Text key={i} style={styles.observacao}>{o}</Text>)}
        </View>
      )}

      {c.eventos.length > 0 && (
        <View style={styles.historico}>
          <Text style={styles.apoio}>Histórico da corrida</Text>
          {c.eventos.map((e, i) => (
            <View key={i} style={styles.evento}>
              <Text style={styles.eventoHora}>{horaDe(e.created_at)}</Text>
              <Text style={styles.eventoTexto}>{e.descricao}</Text>
            </View>
          ))}
        </View>
      )}

      {confirmandoCancelamento && (
        <View style={styles.confirmacao}>
          <Aviso tipo="alerta" texto={`Cancelar só o TaxiDog? O agendamento continua, e a taxa de ${formatarReais(c.valor)} sai do valor dele.`} />
        </View>
      )}

      {c.status === 'no_endereco' && (
        <EsperaRetirada idCorrida={c.id_corrida} pet={c.pet_nome} onCancelada={onCanceladaPorEspera} />
      )}

      <View style={styles.rodape}>
        {acao && !confirmandoCancelamento && (
          <>
            {aguardandoAceite ? <Text style={styles.apoio}>Aceite o agendamento antes</Text>
              : precisaTaxiDog ? <Text style={styles.apoio}>Atribua um TaxiDog antes</Text> : null}
            <BotaoPequeno
              variante="primario"
              rotulo={acao.rotulo}
              carregando={ocupado}
              desativado={precisaTaxiDog || aguardandoAceite}
              onPress={() => onAvancar(acao.status)}
            />
          </>
        )}
        {!acao && !rota && c.status === 'entregue_loja' && <Text style={styles.apoio}>Aguardando o serviço terminar para a entrega</Text>}
        {!acao && !rota && c.status === 'agendada' && c.modalidade === 'entregar' && <Text style={styles.apoio}>A entrega libera quando o serviço for finalizado</Text>}

        <BotaoPequeno icone={IconRoute} rotulo="Abrir no Google Maps" onPress={() => abrirNoMapa(c)} />
        {podeAtribuir && !encerrada(c.status) && (
          confirmandoCancelamento ? (
            <>
              <BotaoPequeno variante="perigo" rotulo="Confirmar cancelamento" carregando={ocupado} onPress={onCancelar} />
              <BotaoPequeno variante="fantasma" rotulo="Voltar" desativado={ocupado} onPress={() => setConfirmandoCancelamento(false)} />
            </>
          ) : (
            <BotaoPequeno variante="fantasma" rotulo="Cancelar TaxiDog" onPress={() => setConfirmandoCancelamento(true)} />
          )
        )}
      </View>
    </Folha>
  )
}

function Linha({ rotulo, valor, children }: { rotulo: string; valor?: string; children?: ReactNode }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.rotulo}>{rotulo}</Text>
      {children ?? <Text style={styles.valor}>{valor}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  titulo: { ...typography.heading.xl, color: colors.text },
  subtitulo: { ...typography.body.lg, color: colors.textMuted, marginTop: 2, marginBottom: 16 },
  // "Visualizar agendamentos": na largura toda; os atalhos, 8 abaixo dela e
  // 12 acima da faixa do dia.
  trocaDeVisao: { marginBottom: 8 },
  atalhos: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  atalho: { flex: 1 },
  barra: { gap: 12, marginBottom: 16 },
  totais: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 },
  total: { fontSize: 14, lineHeight: 20, color: COR_APAGADA },
  totalForte: { fontWeight: '700', color: colors.text },
  totalValor: { fontWeight: '700', color: colors.successFg },
  aviso: { marginBottom: 16, gap: 8 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primary600 },
  carregando: { opacity: 0.6 },

  responsavel: { flexShrink: 1, fontSize: 12, lineHeight: 19.2, color: COR_APAGADA },
  seletor: { flex: 1 },
  // `.btn-aguardando`: amarelo e parado — é um aviso, não um botão.
  aguardando: {
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(253,230,138,0.6)',
  },
  aguardandoTexto: { fontSize: 13, lineHeight: 13, fontWeight: '600', color: '#92400e' },
  disponivel: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#1e40af', marginBottom: 4 },

  situacao: { flexDirection: 'row', marginBottom: 8 },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  rotulo: { flexShrink: 0, fontSize: 14, lineHeight: 22.4, color: COR_APAGADA },
  valor: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: '#1f2937', textAlign: 'right' },
  valorVerde: { color: colors.successFg },
  apoio: { fontSize: 12, lineHeight: 16, color: COR_APAGADA, textAlign: 'right' },
  doisAndares: { flexShrink: 1, alignItems: 'flex-end' },
  telefone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seletorDaFolha: { flexDirection: 'row', flexShrink: 1, minWidth: 180, justifyContent: 'flex-end' },
  observacoes: { marginTop: 16, padding: 12, gap: 4, borderRadius: 6, backgroundColor: colors.surfaceMuted, alignItems: 'flex-start' },
  comportamento: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  observacao: { fontSize: 14, lineHeight: 20, color: '#374151' },
  historico: { marginTop: 20, gap: 8, alignItems: 'flex-start' },
  evento: { flexDirection: 'row', gap: 12 },
  eventoHora: { width: 44, fontSize: 14, lineHeight: 20, color: COR_APAGADA },
  eventoTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: '#374151' },
  confirmacao: { marginTop: 16 },
  rodape: { gap: 8, marginTop: 16 },
})
