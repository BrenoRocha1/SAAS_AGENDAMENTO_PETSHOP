import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BarraDoDia } from '@/components/BarraDoDia'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { CartaoVazio } from '@/components/CartaoVazio'
import { DetailHeader } from '@/components/DetailHeader'
import { Folha } from '@/components/Folha'
import { IconCheck, IconKanban, IconRoute, IconStore } from '@/components/IconesDoSite'
import { EtiquetaDoQuadro } from '@/components/Quadro'
import { ScreenContainer } from '@/components/ScreenContainer'
import { Seletor } from '@/components/Seletor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { useEnderecoLoja } from '@/hooks/useMinhasRotas'
import { chamarAcao } from '@/lib/acoes'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import { faltaMigration } from '@/lib/erros'
import { formatarTelefone } from '@/lib/format'
import { assinarComSessao } from '@/lib/realtime'
import { pedirCalculoDaRota } from '@/lib/rotas-distancia'
import { coresStatus } from '@/lib/statusAgendamento'
import { supabase } from '@/lib/supabase'
import { ROTULO_MODALIDADE } from '@/lib/taxidog'
import {
  ROTULO_STATUS_ROTA,
  contarPets,
  enderecoParada,
  horarioParada,
  linhasLoja,
  montarPlanoInicial,
  normalizarRota,
  normalizarTrecho,
  proximaParada,
  tituloParada,
  trajetoDaRota,
  type Parada,
  type ParadaPlano,
  type Rota,
  type StatusRota,
  type TrechoPendente,
} from '@/lib/taxidog-rotas'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

const COR_APAGADA = '#858d99'

// De que etapa do atendimento são as cores do selo de cada situação da rota
// (`CLASSE_STATUS_ROTA` do site).
const TOM_DA_ROTA: Record<StatusRota, string> = {
  planejamento: 'neutro',
  aguardando_aprovacao: 'Pendente',
  aguardando_saida: 'Confirmado',
  em_andamento: 'Em andamento',
  concluida: 'Concluído',
  cancelada: 'Cancelado',
}

interface TaxiDogOpcao { id_funcionario: string; nome: string }

const chaveTrecho = (t: Pick<TrechoPendente, 'id_corrida' | 'trecho'>) => `${t.id_corrida}:${t.trecho}`

function textoTrecho(t: TrechoPendente): string {
  if (t.trecho === 'busca') return `Buscar às ${t.hr_agendamento.slice(0, 5)}`
  return t.hr_fim_visita ? `Entregar após ${t.hr_fim_visita.slice(0, 5)}` : 'Entregar após o serviço'
}

// Plano (ainda sem gravar) com nomes, pra pré-visualizar a rota nova.
function descreverPlano(plano: ParadaPlano[], trechos: TrechoPendente[]) {
  const nome = (id: string) => trechos.find(t => t.id_corrida === id)?.pet_nome ?? 'Pet'
  return plano.map(p => {
    if (p.local === 'loja') {
      const deixar = p.itens.filter(i => i.acao === 'deixar_loja').map(i => nome(i.id_corrida))
      const pegar = p.itens.filter(i => i.acao === 'pegar_loja').map(i => nome(i.id_corrida))
      return { titulo: 'Pet Shop', detalhe: [deixar.length ? `Deixar ${deixar.join(' + ')}` : null, pegar.length ? `Pegar ${pegar.join(' + ')}` : null].filter(Boolean).join(' · ') }
    }
    const buscar = p.itens.filter(i => i.acao === 'embarcar').map(i => nome(i.id_corrida))
    const entregar = p.itens.filter(i => i.acao === 'entregar').map(i => nome(i.id_corrida))
    return { titulo: [buscar.length ? `Buscar ${buscar.join(' + ')}` : null, entregar.length ? `Entregar ${entregar.join(' + ')}` : null].filter(Boolean).join(' · '), detalhe: '' }
  })
}

// Selo da situação da rota (`.badge`, em maiúsculas).
function SeloDaRota({ status }: { status: StatusRota }) {
  const tom = TOM_DA_ROTA[status]
  const cor = tom === 'neutro' ? { bg: colors.border, fg: colors.textMuted, ring: colors.borderStrong } : coresStatus(tom)
  return (
    <View style={[styles.selo, { backgroundColor: cor.bg, borderColor: cor.ring }]}>
      <Text style={[styles.seloTexto, { color: cor.fg }]}>{ROTULO_STATUS_ROTA[status]}</Text>
    </View>
  )
}

// Rotas do TaxiDog para a loja — a página do site (components/lojista/
// TaxiDogRotas.tsx, perfil "gestor") em largura de celular: as corridas que
// ainda não estão em rota, para marcar e montar uma, e as rotas do dia, para
// organizar, trocar o TaxiDog, aprovar ou cancelar. As gravações passam
// pelas mesmas actions do painel. Mudou lá, muda aqui.
export function TelaRotasDaLoja() {
  const { contexto } = useAuth()
  const router = useRouter()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.podeGerenciarAgenda
  const enderecoLoja = useEnderecoLoja()

  const hoje = hojeBrasilISO()
  // `data`: o dia em que a pessoa estava no quadro do TaxiDog.
  // `rota`: a rota a abrir de cara ("Ver Rota #N" do quadro).
  const { data: dataInicial, rota: rotaInicial } = useLocalSearchParams<{ data?: string; rota?: string }>()
  const [data, setData] = useState(dataInicial && /^\d{4}-\d{2}-\d{2}$/.test(dataInicial) ? dataInicial : hoje)

  const [rotas, setRotas] = useState<Rota[]>([])
  const [pendentes, setPendentes] = useState<TrechoPendente[]>([])
  const [taxidogs, setTaxidogs] = useState<TaxiDogOpcao[]>([])
  const [carregadoEm, setCarregadoEm] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [criando, setCriando] = useState(false)
  const [abertaId, setAbertaId] = useState<string | null>(rotaInicial ?? null)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const [lista, livres, publicos] = await Promise.all([
      supabase.rpc('fn_listar_rotas', { p_data_ini: data, p_data_fim: data }),
      supabase.rpc('fn_trechos_pendentes', { p_data: data }),
      supabase.rpc('fn_taxidogs_publicos', { p_id_lojista: idLojista }),
    ])
    const falha = lista.error ?? livres.error
    if (falha) {
      setErroCarga(faltaMigration(falha) ? 'As rotas do TaxiDog ainda não foram ativadas no sistema da loja.' : 'Não foi possível carregar as rotas.')
    } else {
      const novos = ((livres.data ?? []) as Record<string, unknown>[]).map(normalizarTrecho)
      setErroCarga(null)
      setRotas(((lista.data ?? []) as Record<string, unknown>[]).map(normalizarRota))
      setPendentes(novos)
      // Corridas que saíram da lista (entraram numa rota, foram canceladas)
      // não podem continuar marcadas.
      const chaves = new Set(novos.map(chaveTrecho))
      setSelecionados(prev => new Set([...prev].filter(k => chaves.has(k))))
    }
    setTaxidogs((publicos.data ?? []) as TaxiDogOpcao[])
    setCarregadoEm(data)
    setLoading(false)
  }, [idLojista, pode, data])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  // Ao vivo: o TaxiDog montou uma rota, saiu, concluiu uma parada...
  useEffect(() => {
    if (!idLojista || !pode) return
    const canal = supabase
      .channel(`rotas-da-loja-${idLojista}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_rota', filter: `id_lojista=eq.${idLojista}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${idLojista}` }, () => carregar())
    return assinarComSessao(canal)
  }, [idLojista, pode, carregar])

  const visiveis = useMemo(() => rotas.filter(r => r.status !== 'cancelada'), [rotas])

  // Distância e tempo: pede o cálculo ao painel quando a rota mudou desde o
  // último, depois de ela "sossegar" (uma reorganização vira uma chamada só).
  const paraCalcular = visiveis
    .filter(r => r.status !== 'concluida' && r.paradas.length > 0 && r.calculo_versao !== r.versao)
    .map(r => `${r.id_rota}:${r.versao}`)
    .join(',')
  useEffect(() => {
    if (!paraCalcular) return
    const timer = setTimeout(() => {
      Promise.all(paraCalcular.split(',').map(item => {
        const [id, versao] = item.split(':')
        return pedirCalculoDaRota(id, Number(versao))
      })).then(() => carregar())
    }, 4000)
    return () => clearTimeout(timer)
  }, [paraCalcular, carregar])

  if (!contexto || !pode) {
    return (
      <ScreenContainer>
        <DetailHeader title="Rotas do TaxiDog" />
        <CartaoVazio
          ilustracao="sem-permissao"
          titulo="Sem permissão para ver as rotas"
          texto="Fale com o responsável pelo petshop para liberar o acesso."
        />
      </ScreenContainer>
    )
  }

  const paraAprovar = visiveis.filter(r => r.status === 'aguardando_aprovacao')
  const aberta = rotas.find(r => r.id_rota === abertaId) ?? null
  const paraBuscar = pendentes.filter(t => t.trecho === 'busca')
  const paraEntregar = pendentes.filter(t => t.trecho === 'entrega')
  const escolhidos = pendentes.filter(t => selecionados.has(chaveTrecho(t)))
  // Trocando de dia, o que estava na tela fica à vista, apagado.
  const desatualizado = carregadoEm !== data

  function alternar(chave: string) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  }

  const renderPendente = (t: TrechoPendente) => {
    const chave = chaveTrecho(t)
    const marcado = selecionados.has(chave)
    const aguardandoAceite = t.status_agendamento === 'Pendente'
    const naoPronto = t.trecho === 'entrega' && t.status_corrida !== 'pronto_entrega'
    return (
      <Pressable
        key={chave}
        onPress={() => alternar(chave)}
        disabled={aguardandoAceite}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcado, disabled: aguardandoAceite }}
        style={[styles.pendente, marcado && styles.pendenteMarcado, aguardandoAceite && styles.pendenteBloqueado]}
      >
        <View style={[styles.caixinha, marcado && styles.caixinhaMarcada]}>
          {marcado && <IconCheck size={12} color={colors.white} />}
        </View>
        <View style={styles.pendenteTexto}>
          <View style={styles.pendenteTopo}>
            <Text style={styles.pendentePet}>{t.pet_nome}</Text>
            <Text style={styles.miudo}>{textoTrecho(t)}</Text>
          </View>
          <Text style={styles.miudo} numberOfLines={1}>{t.logradouro}, {t.numero} · {t.bairro}</Text>
          <Text style={styles.miudo}>{[t.cliente_nome, t.cliente_telefone ? formatarTelefone(t.cliente_telefone) : null, ROTULO_MODALIDADE[t.modalidade]].filter(Boolean).join(' · ')}</Text>
          {(aguardandoAceite || t.trecho === 'entrega' || t.id_funcionario) && (
            <View style={styles.pendenteSelos}>
              {aguardandoAceite && <EtiquetaDoQuadro tom="Pendente">Aguardando aceite da loja</EtiquetaDoQuadro>}
              {!aguardandoAceite && naoPronto && <EtiquetaDoQuadro>Serviço ainda não terminou</EtiquetaDoQuadro>}
              {!aguardandoAceite && t.trecho === 'entrega' && !naoPronto && <EtiquetaDoQuadro tom="Concluído">Pronto para entrega</EtiquetaDoQuadro>}
              {t.id_funcionario && <EtiquetaDoQuadro tom="Confirmado">Com {t.funcionario_nome ?? 'TaxiDog'}</EtiquetaDoQuadro>}
            </View>
          )}
        </View>
      </Pressable>
    )
  }

  return (
    <ScreenContainer refreshing={loading && carregadoEm !== null} onRefresh={carregar}>
      <DetailHeader title="Rotas do TaxiDog" junto />
      {/* Volta para o quadro no dia que está aqui (mesmo quem chegou direto nesta tela). */}
      <BotaoPequeno
        variante="fantasma"
        icone={IconKanban}
        rotulo="Corridas do TaxiDog"
        style={styles.voltar}
        onPress={() => router.dismissTo({ pathname: '/agendamentos/gestor-taxidog', params: { data } })}
      />

      <View style={styles.barra}>
        <BarraDoDia data={data} hoje={hoje} onMudar={d => { setSelecionados(new Set()); setData(d) }} />
        <View style={styles.totais}>
          <Text style={styles.total}><Text style={styles.totalForte}>{paraBuscar.length}</Text> para buscar</Text>
          <Text style={styles.total}><Text style={styles.totalForte}>{paraEntregar.length}</Text> para entregar</Text>
          <Text style={styles.total}><Text style={styles.totalForte}>{visiveis.length}</Text> {visiveis.length === 1 ? 'rota' : 'rotas'}</Text>
        </View>
      </View>

      {erroCarga && <View style={styles.aviso}><Aviso tipo="erro" texto={erroCarga} /></View>}
      {paraAprovar.length > 0 && (
        <View style={styles.aviso}>
          <Aviso
            tipo="alerta"
            texto={paraAprovar.length === 1
              ? `A Rota #${paraAprovar[0].numero} (${paraAprovar[0].funcionario_nome ?? 'TaxiDog'}) está aguardando sua aprovação.`
              : `${paraAprovar.length} rotas estão aguardando sua aprovação.`}
          />
        </View>
      )}

      {carregadoEm === null ? null : (
        <View style={[styles.grade, desatualizado && styles.carregando]} pointerEvents={desatualizado ? 'none' : 'auto'}>
          {/* Corridas que ainda não estão em rota */}
          <View style={styles.cartao}>
            <Text style={styles.cartaoTitulo}>Corridas para rota</Text>
            {pendentes.length === 0 ? (
              <Text style={styles.vazio}>Nada para organizar neste dia. Quando um cliente pedir TaxiDog, a corrida aparece aqui.</Text>
            ) : (
              <>
                {paraBuscar.length > 0 && (
                  <>
                    <Text style={styles.grupo}>Para buscar ({paraBuscar.length})</Text>
                    {paraBuscar.map(renderPendente)}
                  </>
                )}
                {paraEntregar.length > 0 && (
                  <>
                    <Text style={styles.grupo}>Para entregar ({paraEntregar.length})</Text>
                    {paraEntregar.map(renderPendente)}
                  </>
                )}
                <BotaoPequeno
                  normal
                  variante="primario"
                  icone={IconRoute}
                  rotulo={escolhidos.length === 0 ? 'Selecione para montar uma rota' : `Montar rota com ${escolhidos.length}`}
                  desativado={escolhidos.length === 0}
                  style={styles.montar}
                  onPress={() => setCriando(true)}
                />
              </>
            )}
          </View>

          {/* Rotas do dia */}
          {visiveis.length === 0 ? (
            <CartaoVazio ilustracao="taxidog" titulo="Nenhuma rota neste dia" texto="Marque as corridas e monte uma rota." />
          ) : (
            <View style={styles.rotas}>
              {visiveis.map(r => <CartaoDaRota key={r.id_rota} rota={r} onAbrir={() => setAbertaId(r.id_rota)} />)}
            </View>
          )}
        </View>
      )}

      {criando && (
        <FolhaNovaRota
          data={data}
          escolhidos={escolhidos}
          taxidogs={taxidogs}
          onFechar={() => setCriando(false)}
          onCriada={async idRota => {
            setCriando(false)
            setSelecionados(new Set())
            await carregar()
            setAbertaId(idRota)
          }}
        />
      )}

      {aberta && (
        <FolhaRota
          rota={aberta}
          pendentes={pendentes}
          taxidogs={taxidogs}
          enderecoLoja={enderecoLoja}
          recarregar={carregar}
          onFechar={() => setAbertaId(null)}
        />
      )}
    </ScreenContainer>
  )
}

function CartaoDaRota({ rota: r, onAbrir }: { rota: Rota; onAbrir: () => void }) {
  const proxima = r.status === 'em_andamento' ? proximaParada(r) : null
  const pets = contarPets(r)
  const trajeto = trajetoDaRota(r)
  const paraAprovar = r.status === 'aguardando_aprovacao'
  return (
    <Pressable onPress={onAbrir} accessibilityRole="button" style={({ pressed }) => [styles.cartaoRota, paraAprovar && styles.cartaoRotaAprovacao, pressed && styles.pressionado]}>
      <View style={styles.rotaTopo}>
        <Text style={styles.rotaNumero}>Rota #{r.numero}</Text>
        <SeloDaRota status={r.status} />
      </View>
      <Text style={styles.rotaLinha}>TaxiDog: <Text style={styles.forte}>{r.funcionario_nome ?? 'sem TaxiDog'}</Text></Text>
      <Text style={styles.rotaApoio}>
        {r.paradas.length} {r.paradas.length === 1 ? 'parada' : 'paradas'} · {pets} {pets === 1 ? 'pet' : 'pets'}{trajeto ? ` · ${trajeto}` : ''}
      </Text>
      {proxima && <Text style={styles.rotaProxima}>Próxima: {tituloParada(proxima)}</Text>}
      {r.ultima_alteracao && r.status !== 'concluida' && <Text style={styles.miudo}>Última alteração: {r.ultima_alteracao}</Text>}
      {paraAprovar && <Text style={styles.rotaRevisar}>Revisar e aprovar →</Text>}
    </Pressable>
  )
}

function FolhaNovaRota({ data, escolhidos, taxidogs, onFechar, onCriada }: {
  data: string
  escolhidos: TrechoPendente[]
  taxidogs: TaxiDogOpcao[]
  onFechar: () => void
  onCriada: (idRota: string) => void
}) {
  // Sugestão: o TaxiDog que já tem as corridas escolhidas pelo quadro.
  const [idTaxidog, setIdTaxidog] = useState(() => {
    const donos = [...new Set(escolhidos.map(t => t.id_funcionario).filter((x): x is string => !!x))]
    if (donos.length === 1) return donos[0]
    return taxidogs.length === 1 ? taxidogs[0].id_funcionario : ''
  })
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const previa = useMemo(() => descreverPlano(montarPlanoInicial(escolhidos), escolhidos), [escolhidos])

  async function criar() {
    setErro(null)
    setEnviando(true)
    const r = await chamarAcao<{ id_rota: string }>('criarRotaAction', data, idTaxidog || null, escolhidos.map(t => ({ id_corrida: t.id_corrida, trecho: t.trecho })))
    setEnviando(false)
    if (r.error || !r.id_rota) {
      setErro(r.error ?? 'Não foi possível montar a rota.')
      return
    }
    onCriada(r.id_rota)
  }

  return (
    <Folha visivel titulo={`Nova rota · ${dataBR(data).slice(0, 5)}`} ocupado={enviando} onFechar={onFechar}>
      {erro && <Aviso tipo="erro" texto={erro} />}
      <View style={styles.campo}>
        <Text style={styles.rotulo}>TaxiDog</Text>
        <Seletor
          titulo="TaxiDog"
          valor={idTaxidog}
          opcoes={[{ valor: '', rotulo: 'Definir depois' }, ...taxidogs.map(t => ({ valor: t.id_funcionario, rotulo: t.nome }))]}
          onChange={setIdTaxidog}
        />
        {taxidogs.length === 0 && <Text style={styles.dica}>Nenhum funcionário habilitado como TaxiDog — habilite em Equipe.</Text>}
      </View>
      <View style={styles.campo}>
        <Text style={styles.rotulo}>Paradas (dá para reordenar depois)</Text>
        <View style={styles.previa}>
          {previa.map((p, i) => (
            <Text key={i} style={styles.previaLinha}>
              {i + 1}. <Text style={styles.forte}>{p.titulo}</Text>
              {p.detalhe ? <Text style={styles.previaDetalhe}> — {p.detalhe}</Text> : null}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.rodape}>
        <BotaoPequeno normal variante="primario" rotulo="Montar rota" carregando={enviando} onPress={criar} />
        <BotaoPequeno normal rotulo="Cancelar" desativado={enviando} onPress={onFechar} />
      </View>
    </Folha>
  )
}

// Detalhe/organização de uma rota: ordem das paradas, tirar e pôr pets,
// TaxiDog, aprovar, cancelar.
function FolhaRota({ rota: r, pendentes, taxidogs, enderecoLoja, recarregar, onFechar }: {
  rota: Rota
  pendentes: TrechoPendente[]
  taxidogs: TaxiDogOpcao[]
  enderecoLoja: string
  recarregar: () => Promise<void>
  onFechar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)
  const [adicionar, setAdicionar] = useState('')

  const antesDeSair = r.status === 'planejamento' || r.status === 'aguardando_aprovacao' || r.status === 'aguardando_saida'
  const editavel = antesDeSair || r.status === 'em_andamento'
  const pendentesDaRota = r.paradas.filter(p => p.status === 'pendente')
  const idsPendentes = pendentesDaRota.map(p => p.id_parada)
  const chaveOrdem = idsPendentes.join(',')
  // A ordem muda na tela na hora e volta se o painel recusar.
  const [ordemLocal, setOrdemLocal] = useState(idsPendentes)
  const [chaveAnterior, setChaveAnterior] = useState(chaveOrdem)
  if (chaveOrdem !== chaveAnterior) {
    setChaveAnterior(chaveOrdem)
    setOrdemLocal(idsPendentes)
  }

  const fixas = r.paradas.filter(p => p.status !== 'pendente')
  const pendentesOrdenadas = ordemLocal.map(id => pendentesDaRota.find(p => p.id_parada === id)).filter((p): p is Parada => !!p)
  const exibidas = [...fixas, ...pendentesOrdenadas]
  const paraAdicionar = pendentes.filter(t => t.status_agendamento !== 'Pendente')
  const petsDaRota = [...new Map(r.paradas.flatMap(p => p.itens).map(i => [i.id_corrida, i])).values()]
  const trajeto = trajetoDaRota(r)
  const rotuloCancelar = r.status === 'aguardando_aprovacao' && r.id_funcionario ? 'Recusar rota' : 'Cancelar rota'

  async function executar(acao: string, args: unknown[], depois?: () => void) {
    setErro(null)
    setOcupado(true)
    const res = await chamarAcao(acao, ...args)
    if (res.error) {
      setOcupado(false)
      setErro(res.error)
      setOrdemLocal(idsPendentes)
      return
    }
    await recarregar()
    setOcupado(false)
    depois?.()
  }

  function mover(id: string, delta: number) {
    const idx = ordemLocal.indexOf(id)
    const alvo = idx + delta
    if (idx < 0 || alvo < 0 || alvo >= ordemLocal.length) return
    const nova = [...ordemLocal]
    ;[nova[idx], nova[alvo]] = [nova[alvo], nova[idx]]
    setOrdemLocal(nova)
    executar('reordenarParadasAction', [r.id_rota, nova])
  }

  return (
    <Folha visivel titulo={`Rota #${r.numero}`} ocupado={ocupado} onFechar={onFechar}>
      <View style={styles.situacao}><SeloDaRota status={r.status} /></View>

      {erro && <Aviso tipo="erro" texto={erro} />}
      {r.status === 'aguardando_aprovacao' && (
        <Aviso tipo="alerta" texto={`${r.funcionario_nome ?? 'O TaxiDog'} montou esta rota. Confira as paradas e aprove para ele poder sair.`} />
      )}

      <View style={styles.resumo}>
        <View style={styles.resumoCelula}>
          <Text style={styles.miudo}>TaxiDog</Text>
          {antesDeSair ? (
            <Seletor
              titulo="TaxiDog"
              valor={r.id_funcionario ?? ''}
              desativado={ocupado}
              style={styles.resumoSeletor}
              opcoes={[
                { valor: '', rotulo: 'Sem TaxiDog' },
                ...taxidogs.map(t => ({ valor: t.id_funcionario, rotulo: t.nome })),
                ...(r.id_funcionario && !taxidogs.some(t => t.id_funcionario === r.id_funcionario)
                  ? [{ valor: r.id_funcionario, rotulo: r.funcionario_nome ?? 'TaxiDog atual' }]
                  : []),
              ]}
              onChange={id => { executar('atribuirRotaAction', [r.id_rota, id || null]) }}
            />
          ) : (
            <Text style={styles.resumoValor}>{r.funcionario_nome ?? '—'}</Text>
          )}
        </View>
        <View style={styles.resumoCelula}>
          <Text style={styles.miudo}>Trajeto</Text>
          <Text style={styles.resumoValor}>{trajeto ?? '—'}</Text>
        </View>
        <View style={styles.resumoCelula}>
          <Text style={styles.miudo}>Pets</Text>
          <Text style={styles.resumoValor}>{contarPets(r)}</Text>
        </View>
      </View>

      {r.status === 'em_andamento' && (
        <Text style={styles.miudo}>A rota já saiu: as paradas feitas ficam travadas; dá para mexer nas próximas.</Text>
      )}

      <View style={styles.paradas}>
        {exibidas.map((p, idx) => {
          const pendente = p.status === 'pendente'
          const posicao = ordemLocal.indexOf(p.id_parada)
          const horario = horarioParada(p)
          return (
            <View key={p.id_parada} style={[styles.parada, p.status === 'concluida' && styles.paradaConcluida, p.status === 'chegou' && styles.paradaChegou]}>
              <View style={[styles.paradaNumero, p.status === 'concluida' && styles.paradaNumeroFeita]}>
                <Text style={[styles.paradaNumeroTexto, p.status === 'concluida' && styles.paradaNumeroTextoFeito]}>{p.status === 'concluida' ? '✓' : idx + 1}</Text>
              </View>
              <View style={styles.paradaTexto}>
                <View style={styles.paradaTitulo}>
                  {p.local === 'loja' && <IconStore size={13} color={colors.text} />}
                  <Text style={styles.paradaNome}>{tituloParada(p)}</Text>
                  {p.status === 'chegou' && <EtiquetaDoQuadro tom="Em andamento">TaxiDog aqui</EtiquetaDoQuadro>}
                </View>
                {p.local === 'loja'
                  ? linhasLoja(p).map(l => <Text key={l} style={styles.paradaLinha}>{l}</Text>)
                  : <Text style={styles.miudo} numberOfLines={1}>{enderecoParada(p, enderecoLoja)}{horario ? ` · ${horario}` : ''}</Text>}
                {editavel && pendente && p.local === 'cliente' && p.itens.map(i => (
                  <Text
                    key={i.id_item}
                    style={[styles.remover, ocupado && styles.apagado]}
                    disabled={ocupado}
                    onPress={() => executar('removerDaRotaAction', [r.id_rota, i.id_corrida])}
                  >
                    Tirar {i.pet_nome} da rota
                  </Text>
                ))}
              </View>
              {editavel && pendente && (
                <View style={styles.mover}>
                  <Seta rotulo="Subir" sinal="↑" desativada={ocupado || posicao === 0} onPress={() => mover(p.id_parada, -1)} />
                  <Seta rotulo="Descer" sinal="↓" desativada={ocupado || posicao === ordemLocal.length - 1} onPress={() => mover(p.id_parada, 1)} />
                </View>
              )}
            </View>
          )
        })}
      </View>
      {editavel && pendentesDaRota.length > 1 && (
        <Text style={styles.miudo}>Use ↑ ↓ para mudar a ordem das paradas. As idas ao Pet Shop se ajustam sozinhas.</Text>
      )}

      {editavel && paraAdicionar.length > 0 && (
        <View style={styles.adicionar}>
          <Seletor
            titulo="Adicionar corrida à rota"
            valor={adicionar}
            desativado={ocupado}
            opcoes={[
              { valor: '', rotulo: 'Adicionar corrida à rota...' },
              ...paraAdicionar.map(t => ({ valor: chaveTrecho(t), rotulo: `${t.trecho === 'busca' ? 'Buscar' : 'Entregar'} ${t.pet_nome} · ${textoTrecho(t)}` })),
            ]}
            onChange={setAdicionar}
          />
          <BotaoPequeno
            rotulo="Adicionar"
            desativado={!adicionar || ocupado}
            onPress={() => {
              const [idCorrida, trecho] = adicionar.split(':')
              executar('adicionarNaRotaAction', [r.id_rota, idCorrida, trecho], () => setAdicionar(''))
            }}
          />
        </View>
      )}

      {petsDaRota.length > 0 && (
        <Text style={styles.miudo}>
          Contatos: {petsDaRota.map(i => `${i.pet_nome} (${i.cliente_nome} · ${formatarTelefone(i.cliente_telefone)})`).join(' · ')}
        </Text>
      )}

      <View style={styles.rodape}>
        {r.status === 'aguardando_aprovacao' && (
          <BotaoPequeno variante="primario" rotulo="Aprovar rota" carregando={ocupado} onPress={() => executar('aprovarRotaAction', [r.id_rota])} />
        )}
        <BotaoPequeno rotulo="Fechar" desativado={ocupado} onPress={onFechar} />
        {antesDeSair && (confirmandoCancelar ? (
          <View style={styles.rodapeLinha}>
            <BotaoPequeno variante="perigo" rotulo="Confirmar" carregando={ocupado} style={styles.cresce} onPress={() => executar('cancelarRotaAction', [r.id_rota], onFechar)} />
            <BotaoPequeno variante="fantasma" rotulo="Voltar" desativado={ocupado} style={styles.cresce} onPress={() => setConfirmandoCancelar(false)} />
          </View>
        ) : (
          <BotaoPequeno variante="fantasma" rotulo={rotuloCancelar} desativado={ocupado} onPress={() => setConfirmandoCancelar(true)} />
        ))}
      </View>
    </Folha>
  )
}

function Seta({ rotulo, sinal, desativada, onPress }: { rotulo: string; sinal: string; desativada: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={desativada} hitSlop={4} accessibilityRole="button" accessibilityLabel={rotulo} style={[styles.seta, desativada && styles.setaApagada]}>
      <Text style={styles.setaTexto}>{sinal}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // "Corridas do TaxiDog": o atalho de volta, à direita, 12 acima da faixa do dia.
  voltar: { alignSelf: 'flex-end', marginBottom: 12 },
  barra: { gap: 12, marginBottom: 16 },
  totais: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 },
  total: { fontSize: 14, lineHeight: 20, color: COR_APAGADA },
  totalForte: { fontWeight: '700', color: colors.text },
  aviso: { marginBottom: 16 },
  carregando: { opacity: 0.6 },
  grade: { gap: 20 },

  // "Corridas para rota" (`.card.tdr-coluna`).
  cartao: { padding: 16, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cartaoTitulo: { fontSize: 15.2, lineHeight: 19, fontWeight: '700', fontFamily: FONTE_TITULO, color: colors.text, marginBottom: 16 },
  vazio: { fontSize: 14, lineHeight: 20, color: COR_APAGADA },
  grupo: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', letterSpacing: 0.48, textTransform: 'uppercase', color: COR_APAGADA, marginTop: 12, marginBottom: 4 },
  pendente: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  pendenteMarcado: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.12)' },
  pendenteBloqueado: { opacity: 0.75 },
  caixinha: { width: 16, height: 16, marginTop: 3, borderRadius: 3, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  caixinhaMarcada: { borderColor: colors.primary600, backgroundColor: colors.primary600 },
  pendenteTexto: { flex: 1, minWidth: 0 },
  pendenteTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pendentePet: { flexShrink: 1, fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  pendenteSelos: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  miudo: { fontSize: 12, lineHeight: 16, color: COR_APAGADA },
  montar: { marginTop: 12 },

  rotas: { gap: 12 },
  cartaoRota: { padding: 16, gap: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cartaoRotaAprovacao: { borderColor: '#f59e0b', backgroundColor: 'rgba(253,230,138,0.6)' },
  pressionado: { borderColor: colors.primary600 },
  rotaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rotaNumero: { fontSize: 16, lineHeight: 25.6, fontWeight: '700', fontFamily: FONTE_TITULO, color: colors.text },
  rotaLinha: { fontSize: 14, lineHeight: 20, color: colors.textDim },
  rotaApoio: { fontSize: 14, lineHeight: 20, color: COR_APAGADA },
  rotaProxima: { fontSize: 14, lineHeight: 20, color: '#5b21b6' },
  rotaRevisar: { fontSize: 14, lineHeight: 20, color: colors.primary600 },
  forte: { fontWeight: '700' },
  selo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  seloTexto: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', letterSpacing: 0.48, textTransform: 'uppercase' },

  // Folhas
  situacao: { flexDirection: 'row' },
  campo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '500', color: '#374151' },
  dica: { fontSize: 12, lineHeight: 16, color: COR_APAGADA },
  previa: { gap: 4 },
  previaLinha: { fontSize: 14, lineHeight: 22.4, color: colors.text },
  previaDetalhe: { fontSize: 12, fontWeight: '400', color: COR_APAGADA },
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
  rodapeLinha: { flexDirection: 'row', gap: 8 },
  cresce: { flex: 1 },
  apagado: { opacity: 0.5 },

  // Resumo da rota (`.tdr-resumo-rota`): duas colunas.
  resumo: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, borderRadius: 6, backgroundColor: colors.surfaceMuted },
  resumoCelula: { flexGrow: 1, flexBasis: '40%', minWidth: 0 },
  resumoSeletor: { marginTop: 2 },
  resumoValor: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },

  paradas: { gap: 8 },
  parada: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  paradaConcluida: { opacity: 0.6 },
  paradaChegou: { borderColor: '#8b5cf6' },
  paradaNumero: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  paradaNumeroFeita: { backgroundColor: 'rgba(167,243,208,0.6)' },
  paradaNumeroTexto: { fontSize: 13, lineHeight: 20.8, fontWeight: '700', color: colors.textDim },
  paradaNumeroTextoFeito: { color: '#065f46' },
  paradaTexto: { flex: 1, minWidth: 0 },
  paradaTitulo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  paradaNome: { flexShrink: 1, fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  paradaLinha: { fontSize: 14, lineHeight: 20, color: colors.textDim },
  remover: { alignSelf: 'flex-start', marginTop: 4, fontSize: 12, lineHeight: 14, color: '#991b1b' },
  mover: { gap: 2 },
  seta: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  setaApagada: { opacity: 0.35 },
  setaTexto: { fontSize: 13, lineHeight: 15, color: colors.textDim },
  adicionar: { gap: 8 },
})
