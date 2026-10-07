import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { Aviso } from '@/components/Aviso'
import { BarraTopo } from '@/components/BarraTopo'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { CartaoVazio } from '@/components/CartaoVazio'
import { DetailHeader } from '@/components/DetailHeader'
import { IconCar, IconChartBar, IconCheck, IconChevronLeft, IconClose, IconMoney, IconUserBadge } from '@/components/IconesDoSite'
import { EtiquetaDoQuadro } from '@/components/Quadro'
import { ScreenContainer } from '@/components/ScreenContainer'
import { Seletor } from '@/components/Seletor'
import { Text } from '@/components/Texto'
import { CalendarioPeriodo, FiltroPeriodo, LARGURA_DO_CALENDARIO, PERIODO_PERSONALIZADO } from '@/components/relatorio/FiltroPeriodo'
import { GradeIndicadores, Indicador } from '@/components/relatorio/Indicador'
import { Ranking } from '@/components/relatorio/Ranking'
import { Pilha, Secao } from '@/components/relatorio/Secao'
import { useAuth } from '@/contexts/AuthContext'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import { faltaMigration } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { ROTULO_MODALIDADE, emMovimento, formatarReais, normalizarCorrida, rotuloDaCorridaNoQuadro, type Corrida } from '@/lib/taxidog'
import { colors, typography } from '@/theme/theme'

// Um período muito longo vira uma consulta pesada à toa — o relatório é
// pra acompanhar semana/mês.
const MAX_DIAS = 186

// De que etapa do atendimento são as cores do selo da situação.
function tom(c: Corrida) {
  if (c.status === 'cancelada') return 'Cancelado'
  if (c.status === 'concluida') return 'Concluído'
  if (emMovimento(c.status)) return 'Em andamento'
  return c.id_funcionario ? 'Confirmado' : 'Pendente'
}

// Relatório de corridas do TaxiDog — a página do site
// (app/lojista/taxidog/relatorio) em largura de celular: o período, os
// quatro números, "Por TaxiDog" e as corridas uma a uma. Dois usos, como
// lá: a loja (todas as corridas, com filtro por TaxiDog) e o próprio
// TaxiDog (só as dele). Mudou lá, muda aqui.
export function TelaRelatorioCorridas({ modo }: { modo: 'loja' | 'motorista' }) {
  const { contexto, user } = useAuth()
  const router = useRouter()
  const { width: larguraDaTela } = useWindowDimensions()
  const motorista = modo === 'motorista'
  // Quem gerencia a agenda vê todas as corridas da loja; o TaxiDog, só as dele.
  const gestor = !motorista && !!contexto?.podeGerenciarAgenda
  const pode = motorista ? !!contexto?.podeTaxidog : gestor

  const hoje = hojeBrasilISO()
  const presets = useMemo(() => {
    const hojeObj = parseISO(hoje)
    const mesPassado = subMonths(hojeObj, 1)
    return [
      { rotulo: 'Hoje', de: hoje, ate: hoje },
      { rotulo: 'Últimos 7 dias', de: format(addDays(hojeObj, -6), 'yyyy-MM-dd'), ate: hoje },
      { rotulo: 'Este mês', de: format(startOfMonth(hojeObj), 'yyyy-MM-dd'), ate: hoje },
      { rotulo: 'Mês passado', de: format(startOfMonth(mesPassado), 'yyyy-MM-dd'), ate: format(endOfMonth(mesPassado), 'yyyy-MM-dd') },
    ]
  }, [hoje])

  // Abre em "Este mês", como no site.
  const [periodo, setPeriodo] = useState({ de: presets[2].de, ate: presets[2].ate })
  // A pessoa escolheu "Personalizado" e ainda não aplicou um período.
  const [personalizando, setPersonalizando] = useState(false)
  const [calendarioAberto, setCalendarioAberto] = useState(false)
  // O TaxiDog escolhido na caixa e o que está valendo (depois de "Filtrar").
  const [taxidogNaCaixa, setTaxidogNaCaixa] = useState('')
  const [filtroTaxidog, setFiltroTaxidog] = useState('')

  const [todas, setTodas] = useState<Corrida[] | null>(null)
  const [carregadoEm, setCarregadoEm] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const chave = `${periodo.de}|${periodo.ate}`

  const carregar = useCallback(async () => {
    if (!pode) return
    setCarregando(true)
    const { data, error } = await supabase.rpc('fn_listar_corridas', { p_data_ini: periodo.de, p_data_fim: periodo.ate })
    if (error) {
      setErro(faltaMigration(error) ? 'O TaxiDog ainda não foi ativado no sistema da loja.' : 'Não foi possível carregar as corridas.')
    } else {
      setErro(null)
      setTodas(((data ?? []) as Record<string, unknown>[]).map(normalizarCorrida))
      setCarregadoEm(`${periodo.de}|${periodo.ate}`)
    }
    setCarregando(false)
  }, [pode, periodo.de, periodo.ate])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  function irPara(de: string, ate: string) {
    let [ini, fim] = de > ate ? [ate, de] : [de, ate]
    // O TaxiDog não vê corrida de dia que ainda não chegou.
    if (motorista && fim > hoje) fim = hoje
    if (motorista && ini > hoje) ini = hoje
    if (differenceInCalendarDays(parseISO(fim), parseISO(ini)) > MAX_DIAS) ini = format(addDays(parseISO(fim), -MAX_DIAS), 'yyyy-MM-dd')
    setPeriodo({ de: ini, ate: fim })
  }

  const pronto = presets.find(p => p.de === periodo.de && p.ate === periodo.ate)
  const valorDoFiltro = personalizando || !pronto ? PERIODO_PERSONALIZADO : pronto.rotulo

  const cabecalho = motorista ? (
    <>
      <Text style={styles.titulo}>Relatório de corridas</Text>
      <Text style={styles.subtitulo}>As corridas que você fez no período</Text>
    </>
  ) : (
    <>
      <DetailHeader title="Relatório de corridas" junto />
      <BotaoPequeno variante="fantasma" icone={IconChevronLeft} rotulo="Corridas do TaxiDog" style={styles.voltar} onPress={() => router.back()} />
    </>
  )

  if (!contexto || !pode) {
    return (
      <ScreenContainer topo={motorista ? <BarraTopo /> : undefined}>
        {cabecalho}
        <CartaoVazio
          ilustracao="sem-permissao"
          titulo="Sem permissão para ver as corridas"
          texto="Fale com o responsável pelo petshop para liberar o acesso."
        />
      </ScreenContainer>
    )
  }

  // Opções do filtro por TaxiDog saem das próprias corridas do período.
  const taxidogsDoPeriodo = [...new Map(
    (todas ?? []).filter(c => c.id_funcionario).map(c => [c.id_funcionario as string, c.funcionario_nome ?? 'TaxiDog']),
  ).entries()].sort((x, y) => x[1].localeCompare(y[1]))

  const corridas = (todas ?? [])
    // fn_listar_corridas ainda devolve ao TaxiDog as sem TaxiDog (para ele
    // poder pegar) — aqui elas não contam, não são dele.
    .filter(c => (motorista ? c.id_funcionario === user?.id : true))
    .filter(c => !filtroTaxidog || (filtroTaxidog === 'sem' ? !c.id_funcionario : c.id_funcionario === filtroTaxidog))
    .sort((x, y) => (y.dt_agendamento + y.hr_agendamento).localeCompare(x.dt_agendamento + x.hr_agendamento))

  const concluidas = corridas.filter(c => c.status === 'concluida')
  const canceladas = corridas.filter(c => c.status === 'cancelada')
  const emAberto = corridas.length - concluidas.length - canceladas.length
  const valorConcluidas = concluidas.reduce((soma, c) => soma + c.valor, 0)

  // Por TaxiDog (só para quem vê a loja inteira): concluídas e valor.
  const porTaxidog = gestor
    ? [...concluidas.reduce((mapa, c) => {
        const id = c.id_funcionario ?? 'sem'
        const atual = mapa.get(id) ?? { nome: c.funcionario_nome ?? 'Sem TaxiDog', qtd: 0, valor: 0 }
        mapa.set(id, { ...atual, qtd: atual.qtd + 1, valor: atual.valor + c.valor })
        return mapa
      }, new Map<string, { nome: string; qtd: number; valor: number }>()).values()].sort((x, y) => y.valor - x.valor)
    : []

  // Enquanto o período novo carrega, o anterior fica à vista, apagado.
  const desatualizado = carregando || carregadoEm !== chave
  const comFiltroDeTaxidog = gestor && taxidogsDoPeriodo.length > 0
  // O calendário abre logo abaixo do botão do período, recuando o que for
  // preciso para caber na tela (12 de folga na direita).
  const larguraDoCalendario = Math.min(LARGURA_DO_CALENDARIO, larguraDaTela - 24)
  const esquerdaDoCalendario = Math.min(17, larguraDaTela - 12 - 16 - larguraDoCalendario)

  return (
    <ScreenContainer topo={motorista ? <BarraTopo /> : undefined} refreshing={carregando && !!todas} onRefresh={carregar}>
      {cabecalho}

      <View>
        {/* Período: opções prontas e, em "Personalizado", o calendário. */}
        <View style={styles.filtros}>
          <FiltroPeriodo
            opcoes={[...presets.map(p => ({ valor: p.rotulo, rotulo: p.rotulo })), { valor: PERIODO_PERSONALIZADO, rotulo: 'Personalizado' }]}
            valor={valorDoFiltro}
            onMudar={novo => {
              const escolhido = presets.find(p => p.rotulo === novo)
              setPersonalizando(!escolhido)
              if (escolhido) irPara(escolhido.de, escolhido.ate)
            }}
            ini={periodo.de}
            fim={periodo.ate}
            calendarioAberto={calendarioAberto}
            onCalendario={setCalendarioAberto}
          />
          {/* Filtro por TaxiDog, mantendo o período. */}
          {comFiltroDeTaxidog && (
            <View style={styles.filtroTaxidog}>
              <View style={styles.campo}>
                <Text style={styles.rotulo}>TaxiDog</Text>
                <Seletor
                  justo
                  titulo="TaxiDog"
                  valor={taxidogNaCaixa}
                  opcoes={[{ valor: '', rotulo: 'Todos' }, ...taxidogsDoPeriodo.map(([id, nome]) => ({ valor: id, rotulo: nome })), { valor: 'sem', rotulo: 'Sem TaxiDog' }]}
                  onChange={setTaxidogNaCaixa}
                />
              </View>
              <BotaoPequeno rotulo="Filtrar" style={styles.filtrar} onPress={() => setFiltroTaxidog(taxidogNaCaixa)} />
            </View>
          )}
        </View>

        {erro ? (
          <Aviso tipo="erro" texto={erro} />
        ) : !todas ? null : corridas.length === 0 ? (
          // Período sem corrida nenhuma: o desenho no lugar dos números zerados.
          <View style={desatualizado && styles.apagado}>
            <CartaoVazio
              ilustracao="relatorios"
              titulo="Nenhuma corrida neste período"
              texto={filtroTaxidog
                ? 'Tente escolher outro período ou outro TaxiDog.'
                : motorista
                  ? 'Suas corridas aparecem aqui conforme você atende. Tente escolher outro período.'
                  : 'Tente escolher outro período ou confira se há corridas de TaxiDog agendadas.'}
            />
          </View>
        ) : (
          <View style={desatualizado && styles.apagado} pointerEvents={desatualizado ? 'none' : 'auto'}>
            <Pilha>
              <GradeIndicadores>
                <Indicador rotulo={concluidas.length === 1 ? 'Corrida concluída' : 'Corridas concluídas'} valor={String(concluidas.length)} icone={IconCheck} />
                <Indicador rotulo="Valor das concluídas" valor={formatarReais(valorConcluidas)} icone={IconMoney} />
                <Indicador rotulo="Em aberto" valor={String(emAberto)} icone={IconCar} />
                <Indicador rotulo={canceladas.length === 1 ? 'Cancelada' : 'Canceladas'} valor={String(canceladas.length)} icone={IconClose} />
              </GradeIndicadores>

              {gestor && porTaxidog.length > 0 && (
                <Secao titulo="Por TaxiDog" icone={IconUserBadge} descricao="Corridas concluídas de cada um no período">
                  <Ranking
                    comIniciais
                    itens={porTaxidog.map(t => ({
                      chave: t.nome,
                      titulo: t.nome,
                      // Corridas sem TaxiDog atribuído não são uma pessoa: sem iniciais.
                      sigla: t.nome === 'Sem TaxiDog' ? '—' : undefined,
                      valor: formatarReais(t.valor),
                      detalhe: `${t.qtd} ${t.qtd === 1 ? 'corrida' : 'corridas'}`,
                      parte: valorConcluidas > 0 ? t.valor / valorConcluidas : undefined,
                    }))}
                  />
                </Secao>
              )}

              <Secao titulo="Corridas do período" icone={IconChartBar}>
                {/* No celular a tabela do site vira um cartão por corrida, com os dados em sequência. */}
                <View style={styles.tabela}>
                  {corridas.map(c => (
                    <View key={c.id_corrida} style={styles.linha}>
                      <Text style={[styles.celula, styles.celulaInteira]}>{dataBR(c.dt_agendamento)}</Text>
                      <Text style={styles.celula}>{c.hr_agendamento.slice(0, 5)}</Text>
                      <Text style={styles.celula}>{c.pet_nome}</Text>
                      <Text style={styles.celula}>{c.cliente_nome}</Text>
                      <Text style={styles.celula}>{ROTULO_MODALIDADE[c.modalidade]}</Text>
                      {gestor && <Text style={styles.celula}>{c.funcionario_nome ?? '—'}</Text>}
                      <EtiquetaDoQuadro tom={tom(c)}>
                        {rotuloDaCorridaNoQuadro({ status: c.status, modalidade: c.modalidade, temTaxiDog: !!c.id_funcionario, statusAgendamento: c.status_agendamento })}
                      </EtiquetaDoQuadro>
                      <Text style={styles.celula}>{formatarReais(c.valor)}</Text>
                    </View>
                  ))}
                </View>
              </Secao>
            </Pilha>
          </View>
        )}

        {/* O calendário do período fica por cima do que vem embaixo. Vai aqui
            (e não dentro do cartão do filtro) para os toques valerem também
            no Android, que ignora o que sai dos limites do pai. */}
        {valorDoFiltro === PERIODO_PERSONALIZADO && calendarioAberto && (
          <View style={[styles.calendario, { left: esquerdaDoCalendario }]}>
            <CalendarioPeriodo
              key={chave}
              ini={periodo.de}
              fim={periodo.ate}
              dataMax={motorista ? hoje : undefined}
              largura={larguraDoCalendario}
              onCancelar={() => setCalendarioAberto(false)}
              onAplicar={(ini, fim) => {
                setCalendarioAberto(false)
                setPersonalizando(false)
                irPara(ini, fim)
              }}
            />
          </View>
        )}
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  titulo: { ...typography.heading.xl, color: colors.text },
  subtitulo: { ...typography.body.lg, color: colors.textMuted, marginTop: 2, marginBottom: 16 },
  // "Corridas do TaxiDog": o atalho de volta, à direita, 12 acima do filtro.
  voltar: { alignSelf: 'flex-end', marginBottom: 12 },
  // Cartão do filtro de período (`.relatorio-filtros.card`).
  filtros: { padding: 16, gap: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 24 },
  filtroTaxidog: { gap: 12, alignItems: 'flex-start' },
  campo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '500', color: '#374151' },
  filtrar: { alignSelf: 'flex-start' },
  // 16 do cartão + 36 das opções + 12 + 42 do botão + 6 de vão (mais a borda).
  calendario: { position: 'absolute', top: 113 },
  apagado: { opacity: 0.6 },
  // Tabela no celular: um cartão por linha, com as células em sequência.
  tabela: { gap: 12 },
  linha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 6,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  celula: { fontSize: 15, lineHeight: 24, color: '#1f2937' },
  celulaInteira: { width: '100%' },
})
