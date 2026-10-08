import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BarraDoDia } from '@/components/BarraDoDia'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { CartaoVazio } from '@/components/CartaoVazio'
import { DetailHeader } from '@/components/DetailHeader'
import { IconCar, IconCheck, IconKanban, IconScissors, IconUser, IconUserBadge } from '@/components/IconesDoSite'
import {
  AcaoDoCartao,
  CartaoDoQuadro,
  CartoesDaEtapa,
  EtapaVazia,
  EtapasDoQuadro,
  EtiquetaDoQuadro,
  FiltroDoQuadro,
  LinhaDoCartao,
  NotaDoCartao,
  NovoDoQuadro,
  PeDoCartao,
  PetDoCartao,
  TopoDoCartao,
  VisoesDoQuadro,
} from '@/components/Quadro'
import { ScreenContainer } from '@/components/ScreenContainer'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { useAgendamentosDoDia } from '@/hooks/useAgendamentosHoje'
import { hojeBrasilISO } from '@/lib/agenda'
import { atualizarStatus, carregarTransportesDoDia, type TransporteDoCard } from '@/lib/agendamentos'
import { dialogo } from '@/lib/dialogo'
import { perguntarBuscaTaxiDog } from '@/lib/perguntarTaxiDog'
import { ORDEM_ETAPA, PROXIMA_ETAPA, podeAvancarEtapa } from '@/lib/statusAgendamento'
import { supabase } from '@/lib/supabase'
import { formatarReais, situacaoDoTaxiDog, type TomTaxiDog } from '@/lib/taxidog'
import { colors } from '@/theme/theme'
import type { Agendamento } from '@/types/database'

type Etapa = 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído'

// As quatro etapas do atendimento, na ordem do quadro do site. 'Cancelado'
// fica fora, como na agenda.
// `aba`: o nome da etapa na aba (cabe em um quarto da tela).
const COLUNAS: { status: Etapa; aba: string }[] = [
  { status: 'Pendente', aba: 'Pendentes' },
  { status: 'Confirmado', aba: 'Aceitos' },
  { status: 'Em andamento', aba: 'Andamento' },
  { status: 'Concluído', aba: 'Finalizados' },
]

// A cor da etiqueta do TaxiDog no card: as mesmas das etapas do atendimento.
const ETAPA_DO_TOM: Record<TomTaxiDog, Etapa> = {
  aguardando: 'Pendente',
  aceito: 'Confirmado',
  andamento: 'Em andamento',
  concluido: 'Concluído',
}

function descricaoPet(item: Agendamento) {
  const partes = [item.pet?.especie, item.pet?.porte, item.pet?.raca].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : null
}

interface Base {
  kanbanAtivo: boolean
  // TaxiDog ativado na loja: aparece o "Visualizar TaxiDog".
  taxidogAtivo: boolean
  funcionarios: { id_funcionario: string; nome: string }[]
  servicos: { id_servico: string; nome: string }[]
}

// Gestor de Agendamentos — o quadro do site (petshop-app,
// components/lojista/KanbanBoard.tsx) em largura de celular: as quatro
// etapas uma embaixo da outra, os mesmos cards, filtros e textos. Tocar no
// card abre os detalhes do agendamento; o botão do card leva para a etapa
// seguinte (no celular não há mouse para arrastar). Mudou lá, muda aqui.
export default function GestorScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.podeGerenciarAgenda
  const hoje = hojeBrasilISO()
  // `data`: o dia em que a pessoa estava no quadro do TaxiDog.
  const { data: dataInicial } = useLocalSearchParams<{ data?: string }>()
  const [data, setData] = useState(dataInicial && /^\d{4}-\d{2}-\d{2}$/.test(dataInicial) ? dataInicial : hoje)
  const { agendamentos: doDia, loading, erro: erroCarga, recarregar } = useAgendamentosDoDia(pode ? idLojista : undefined, data)

  const [base, setBase] = useState<Base | null>(null)
  const [itens, setItens] = useState<Agendamento[]>([])
  const [alterados, setAlterados] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [filtroServico, setFiltroServico] = useState('')
  const [etapaEscolhida, setEtapaEscolhida] = useState<Etapa | null>(null)
  // O TaxiDog de cada agendamento do dia (a etiqueta do card).
  const [transportes, setTransportes] = useState<Record<string, TransporteDoCard>>({})

  const carregarBase = useCallback(async () => {
    if (!idLojista || !pode) return
    const [loja, taxidog, funcs, servs] = await Promise.all([
      supabase.from('lojista').select('kanban_ativo').eq('id_lojista', idLojista).maybeSingle(),
      // Tolerante: sem a migration 042 a tabela nem existe — aí o botão some.
      supabase.from('taxidog_config').select('ativo').eq('id_lojista', idLojista).maybeSingle(),
      supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', idLojista).eq('ativo', true).order('created_at'),
      supabase.from('servico').select('id_servico, nome').eq('id_lojista', idLojista).eq('status', 'Ativo').order('nome'),
    ])
    setBase({
      // Sem a coluna (ou sem resposta), vale "ligado" — como no site.
      kanbanAtivo: loja.error ? true : ((loja.data as { kanban_ativo: boolean | null } | null)?.kanban_ativo ?? true),
      taxidogAtivo: !taxidog.error && !!(taxidog.data as { ativo: boolean | null } | null)?.ativo,
      funcionarios: (funcs.data ?? []) as Base['funcionarios'],
      servicos: (servs.data ?? []) as Base['servicos'],
    })
  }, [idLojista, pode])

  // Voltando de um agendamento (aceito, remarcado, cancelado…), o quadro
  // já aparece atualizado mesmo se o aviso ao vivo não chegar.
  useFocusEffect(useCallback(() => { carregarBase(); recarregar() }, [carregarBase, recarregar]))

  useEffect(() => { setItens(doDia.filter(a => a.status !== 'Cancelado')) }, [doDia])

  // A etiqueta do TaxiDog: carrega com os agendamentos do dia e de novo a
  // cada mudança numa corrida da loja (o TaxiDog apertou "Cheguei", "Pet
  // embarcado"…).
  useEffect(() => {
    if (!idLojista) return
    let vivo = true
    const carregar = () => {
      carregarTransportesDoDia(doDia).then(t => { if (vivo) setTransportes(t) })
    }
    carregar()
    const canal = supabase
      .channel(`gestor-taxidog-${idLojista}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'taxidog_corrida', filter: `id_lojista=eq.${idLojista}` }, carregar)
      .subscribe()
    return () => {
      vivo = false
      supabase.removeChannel(canal)
    }
  }, [idLojista, doDia])

  // "Alterado pelo cliente" (trocou serviço/pet ou remarcou) — só importa
  // antes de a loja aceitar. Consultas tolerantes, como no site.
  useEffect(() => {
    const pendentes = doDia.filter(a => a.status === 'Pendente')
    if (pendentes.length === 0) { setAlterados(new Set()); return }
    let vivo = true
    const ids = pendentes.map(a => a.id_agendamento)
    const clienteDe = new Map(pendentes.map(a => [a.id_agendamento, a.id_cliente]))
    Promise.all([
      supabase.from('agendamento_alteracao').select('id_agendamento').eq('feito_por', 'cliente').in('id_agendamento', ids),
      supabase.from('agendamento_remarcacao').select('id_agendamento, id_usuario').in('id_agendamento', ids),
    ]).then(([alteracoes, remarcacoes]) => {
      if (!vivo) return
      const achados = new Set<string>()
      for (const a of (alteracoes.data ?? []) as { id_agendamento: string }[]) achados.add(a.id_agendamento)
      for (const r of (remarcacoes.data ?? []) as { id_agendamento: string; id_usuario: string | null }[]) {
        const cliente = clienteDe.get(r.id_agendamento)
        if (cliente && r.id_usuario === cliente) achados.add(r.id_agendamento)
      }
      setAlterados(achados)
    })
    return () => { vivo = false }
  }, [doDia])

  const itensFiltrados = useMemo(() => itens.filter(it => {
    if (filtroFuncionario && it.id_funcionario !== filtroFuncionario) return false
    if (filtroServico && it.id_servico !== filtroServico) return false
    return true
  }), [itens, filtroFuncionario, filtroServico])

  // O status só anda pra frente; o card troca de coluna na hora e volta se
  // o banco recusar.
  async function moverParaStatus(item: Agendamento, novo: Etapa, taxidog?: 'ignorar' | 'cliente_trouxe') {
    if (!contexto || item.status === novo) return
    if (ORDEM_ETAPA[novo] <= (ORDEM_ETAPA[item.status as Etapa] ?? 0)) {
      setErro('Não é possível voltar para uma etapa anterior. Um agendamento finalizado não pode ser reaberto.')
      return
    }
    setErro(null)
    setAviso(null)
    const anterior = item.status
    const trocar = (status: Agendamento['status']) =>
      setItens(prev => prev.map(it => (it.id_agendamento === item.id_agendamento ? { ...it, status } : it)))
    trocar(novo)
    setOcupado(item.id_agendamento)
    const r = await atualizarStatus(contexto, item.id_agendamento, novo, taxidog ? { taxidog } : undefined)
    setOcupado(null)
    if (r.taxidogPendente) {
      // Nada mudou no banco: volta o card e pergunta.
      trocar(anterior)
      perguntarBuscaTaxiDog(r.taxidogPendente, escolha => moverParaStatus({ ...item, status: anterior }, novo, escolha))
      return
    }
    if (r.erro) {
      setErro(r.erro)
      trocar(anterior)
      return
    }
    if (r.aviso) setAviso(r.aviso)
    recarregar()
  }

  // O botão do card: a etapa seguinte. Finalizar não tem volta — um toque
  // sem querer pede confirmação, como nos detalhes do agendamento.
  function avancar(item: Agendamento) {
    const proxima = PROXIMA_ETAPA[item.status]
    if (!proxima) return
    if (proxima.status === 'Concluído') {
      dialogo('Finalizar atendimento', `Confirma que o atendimento de ${item.pet?.nome ?? 'este pet'} terminou?`, [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Finalizar', onPress: () => moverParaStatus(item, 'Concluído') },
      ])
      return
    }
    moverParaStatus(item, proxima.status as Etapa)
  }

  if (!contexto || !pode) {
    return (
      <ScreenContainer>
        <DetailHeader title="Gestor de Agendamentos" />
        <CartaoVazio
          ilustracao="sem-permissao"
          titulo="Sem permissão para gerenciar a agenda"
          texto="Fale com o responsável pelo petshop para liberar esse acesso."
        />
      </ScreenContainer>
    )
  }

  if (base && !base.kanbanAtivo) {
    return (
      <ScreenContainer>
        <DetailHeader title="Gestor de Agendamentos" />
        <CartaoVazio
          icone={IconKanban}
          titulo="O Gestor de Agendamentos está desativado"
          texto="Ative o Gestor de Agendamentos nas Configurações de Agendamentos pra usar essa tela."
        >
          {contexto.acessoTotal && (
            <BotaoPequeno normal variante="primario" rotulo="Ir para Configurações de Agendamentos" onPress={() => router.push('/mais/config-agendamentos')} />
          )}
        </CartaoVazio>
      </ScreenContainer>
    )
  }

  const comFiltro = !!filtroFuncionario || !!filtroServico
  // A etapa aberta nas abas. Sem escolha, a primeira que tem agendamento (o
  // que está pendente pede ação antes), ou "Aceitos".
  const etapaAberta = etapaEscolhida ?? COLUNAS.find(c => itensFiltrados.some(it => it.status === c.status))?.status ?? 'Confirmado'
  const daEtapa = itensFiltrados.filter(it => it.status === etapaAberta)

  return (
    <ScreenContainer refreshing={loading && itens.length > 0} onRefresh={() => { carregarBase(); recarregar() }}>
      <DetailHeader title="Gestor de Agendamentos" junto={!!base?.taxidogAtivo} />

      {/* O que o quadro mostra: os agendamentos ou as corridas do TaxiDog, no mesmo dia. */}
      {base?.taxidogAtivo && (
        <VisoesDoQuadro
          ativa="agendamentos"
          style={styles.visoes}
          onTrocar={() => router.replace({ pathname: '/agendamentos/gestor-taxidog', params: { data } })}
        />
      )}

      {/* O dia com o "Novo" ao lado e, embaixo, os filtros lado a lado. */}
      <View style={styles.barra}>
        <View style={styles.diaLinha}>
          <BarraDoDia curta style={styles.dia} data={data} hoje={hoje} onMudar={d => { setErro(null); setAviso(null); setData(d) }} />
          <NovoDoQuadro onPress={() => router.push({ pathname: '/agendamentos/novo', params: { data } })} />
        </View>
        {base && (base.funcionarios.length > 0 || base.servicos.length > 0) && (
          <View style={styles.filtros}>
            {base.funcionarios.length > 0 && (
              <FiltroDoQuadro
                icone={IconUserBadge}
                rotulo="Profissional"
                todos="Todos os profissionais"
                valor={filtroFuncionario}
                opcoes={base.funcionarios.map(f => ({ valor: f.id_funcionario, rotulo: f.nome }))}
                onChange={setFiltroFuncionario}
              />
            )}
            {base.servicos.length > 0 && (
              <FiltroDoQuadro
                icone={IconScissors}
                rotulo="Serviço"
                todos="Todos os serviços"
                valor={filtroServico}
                opcoes={base.servicos.map(s => ({ valor: s.id_servico, rotulo: s.nome }))}
                onChange={setFiltroServico}
              />
            )}
          </View>
        )}
      </View>

      {aviso && <View style={styles.aviso}><Aviso tipo="sucesso" texto={aviso} /></View>}
      {(erro || erroCarga) && <View style={styles.aviso}><Aviso tipo="erro" texto={erro ?? erroCarga ?? ''} /></View>}

      {loading && itens.length === 0 ? null : itens.length === 0 ? (
        <CartaoVazio
          ilustracao="agendar"
          titulo="Sem agendamentos neste dia"
          texto="Escolha outro dia ou crie um agendamento na agenda."
        />
      ) : (
        <>
          {/* As etapas em abas; só os cards da escolhida aparecem. */}
          <EtapasDoQuadro
            etapas={COLUNAS.map(c => ({ id: c.status, rotulo: c.aba, status: c.status, total: itensFiltrados.filter(it => it.status === c.status).length }))}
            valor={etapaAberta}
            onChange={setEtapaEscolhida}
          />
          <CartoesDaEtapa style={loading && styles.carregando}>
                {daEtapa.length === 0 ? (
                  <EtapaVazia>{comFiltro ? 'Nada com esse filtro.' : 'Nenhum agendamento aqui.'}</EtapaVazia>
                ) : (
                  daEtapa.map(item => (
                    <CartaoDoQuadro key={item.id_agendamento} onPress={() => router.push(`/agendamentos/${item.id_agendamento}`)}>
                      <TopoDoCartao hora={item.hr_agendamento.slice(0, 5)} valor={formatarReais(Number(item.valor))} />
                      <PetDoCartao foto={item.pet?.foto_url} nome={item.pet?.nome ?? 'Pet'} descricao={descricaoPet(item)} />
                      <LinhaDoCartao icone={IconUser}>{item.cliente?.nome ?? '—'}</LinhaDoCartao>
                      <LinhaDoCartao icone={IconScissors} final>{item.servico?.nome ?? 'Serviço'}</LinhaDoCartao>
                      {/* Tem TaxiDog? A etiqueta diz em que pé está (aguardando, a caminho, chegou…). */}
                      {transportes[item.id_agendamento] && (
                        <View style={styles.taxidog}>
                          <EtiquetaDoQuadro icone={IconCar} tom={ETAPA_DO_TOM[situacaoDoTaxiDog(transportes[item.id_agendamento]).tom]}>
                            {situacaoDoTaxiDog(transportes[item.id_agendamento]).texto}
                          </EtiquetaDoQuadro>
                        </View>
                      )}
                      {alterados.has(item.id_agendamento) && item.status === 'Pendente' && (
                        <View style={styles.alterado}>
                          <Text style={styles.alteradoTexto}>Alterado pelo cliente</Text>
                        </View>
                      )}
                      <PeDoCartao icone={IconUserBadge}>{item.funcionario?.nome ?? 'Sem profissional'}</PeDoCartao>

                      {/* Sem mouse pra arrastar, a etapa seguinte é um botão. */}
                      {item.status !== 'Concluído' && (
                        podeAvancarEtapa(item.status, data, hoje) ? (
                          <AcaoDoCartao>
                            <BotaoPequeno
                              variante="sucesso"
                              icone={IconCheck}
                              rotulo={PROXIMA_ETAPA[item.status]!.acao}
                              carregando={ocupado === item.id_agendamento}
                              desativado={ocupado !== null}
                              onPress={() => avancar(item)}
                            />
                          </AcaoDoCartao>
                        ) : (
                          <NotaDoCartao>Iniciar e finalizar a partir do dia do agendamento.</NotaDoCartao>
                        )
                      )}
                    </CartaoDoQuadro>
                  ))
                )}
          </CartoesDaEtapa>
        </>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  // O seletor de visão, 12 acima da faixa do dia.
  visoes: { marginBottom: 12 },
  barra: { gap: 12, marginBottom: 16 },
  // `.gestor-dia-linha`: o dia e, ao lado, o "Novo" da mesma altura.
  diaLinha: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  dia: { flex: 1 },
  filtros: { flexDirection: 'row', gap: 8 },
  aviso: { marginBottom: 16 },
  carregando: { opacity: 0.6 },
  // `.kanban-card-taxidog`: a etiqueta na própria linha, 6 abaixo do serviço.
  taxidog: { flexDirection: 'row', marginTop: 6 },
  alterado: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    backgroundColor: 'rgba(245,158,11,0.1)',
  },
  alteradoTexto: { fontSize: 11, lineHeight: 17.6, fontWeight: '700', color: colors.warningFg },
})
