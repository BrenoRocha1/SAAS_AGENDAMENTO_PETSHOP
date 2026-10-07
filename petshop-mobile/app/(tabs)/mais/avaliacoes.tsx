import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { format } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { CartaoVazio } from '@/components/CartaoVazio'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Estrelas, formatarMedia } from '@/components/Estrelas'
import { IconChevronLeft, IconChevronRight, IconInbox, IconStar } from '@/components/IconesDoSite'
import { Seletor } from '@/components/Seletor'
import { Text } from '@/components/Texto'
import { CalendarioPeriodo, FiltroPeriodo, LARGURA_DO_CALENDARIO } from '@/components/relatorio/FiltroPeriodo'
import { GradeIndicadores, Indicador } from '@/components/relatorio/Indicador'
import { Ranking } from '@/components/relatorio/Ranking'
import { NotaDaSecao, Pilha, Secao, SecaoVazia } from '@/components/relatorio/Secao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataBR, hojeBrasilISO } from '@/lib/agenda'
import { PRESETS, calcularPeriodo, type PeriodoPreset } from '@/lib/relatorios'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

// Espelha o retorno de fn_avaliacoes_lojista (migration 034).
interface LinhaAvaliacao {
  id_avaliacao: string
  nota: number
  comentario: string | null
  created_at: string
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  nome_cliente: string
  id_cliente: string
  nome_pet: string
  nome_servico: string
  nome_funcionario: string | null
}

type Nota = 1 | 2 | 3 | 4 | 5

// "geral" nunca leva filtro; "periodo" leva todos os filtros da tela. Ficam
// separados de propósito para não misturar as duas médias.
interface Resumo {
  geral: { media: number | null; total: number }
  periodo: { media: number | null; total: number; porNota: Record<Nota, number> }
}

interface Dados {
  // Filtros e página destes números — se não batem com os da tela, estão
  // desatualizados.
  chave: string
  resumo: Resumo
  linhas: LinhaAvaliacao[]
  total: number
}

const PAGE_SIZE = 20
const NOTAS: Nota[] = [5, 4, 3, 2, 1]
const estrelas = (n: number) => `${n} ${n === 1 ? 'estrela' : 'estrelas'}`

// Aqui o filtro de período começa vazio ("Todo o período"), antes das opções
// dos relatórios de vendas.
const TODO_O_PERIODO = 'todo'
type OpcaoDePeriodo = PeriodoPreset | typeof TODO_O_PERIODO
const OPCOES_PERIODO: { valor: OpcaoDePeriodo; rotulo: string }[] = [
  { valor: TODO_O_PERIODO, rotulo: 'Todo o período' },
  ...PRESETS,
]
const OPCOES_NOTA = [{ valor: '', rotulo: 'Todas as notas' }, ...NOTAS.map(n => ({ valor: String(n), rotulo: estrelas(n) }))]

// Avaliações dos clientes — a mesma página do site (Configurações →
// Avaliações): a média geral da loja, os filtros, a média e a distribuição
// do recorte filtrado e a lista, de 20 em 20. Só para dono ou administrador;
// as funções do banco conferem de novo.
export default function AvaliacoesScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const { width: larguraDaTela } = useWindowDimensions()

  // Sem período escolhido vale "Todo o período". "Personalizado" sem datas
  // começa nos últimos 30 dias, como no site.
  const [preset, setPreset] = useState<PeriodoPreset | null>(null)
  const [personalizado, setPersonalizado] = useState<{ ini?: string; fim?: string }>({})
  const [calendarioAberto, setCalendarioAberto] = useState(false)
  const periodo = preset ? calcularPeriodo(preset, personalizado.ini, personalizado.fim) : null

  const [filtroNota, setFiltroNota] = useState('')
  const [filtroServico, setFiltroServico] = useState('')
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [pagina, setPagina] = useState(1)
  const chave = [periodo?.ini ?? '', periodo?.fim ?? '', filtroNota, filtroServico, filtroFuncionario, pagina].join('|')

  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [servicos, setServicos] = useState<{ id_servico: string; nome: string }[]>([])
  const [funcionarios, setFuncionarios] = useState<{ id_funcionario: string; nome: string }[]>([])
  // Onde o cartão dos filtros está na tela, para o calendário abrir embaixo dele.
  const [topoDosFiltros, setTopoDosFiltros] = useState(0)
  // Só o pedido mais recente vale: trocar de filtro antes de o anterior
  // responder não pode trazer os números velhos de volta.
  const pedido = useRef(0)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const meu = ++pedido.current
    setCarregando(true)
    setErro(false)
    const [ini, fim, nota, servico, funcionario, pag] = chave.split('|')
    const filtros = {
      p_id_lojista: idLojista,
      p_data_ini: ini || null,
      p_data_fim: fim || null,
      p_nota: nota ? Number(nota) : null,
      p_id_servico: servico || null,
      p_id_funcionario: funcionario || null,
    }
    const [resumoRes, listaRes] = await Promise.all([
      supabase.rpc('fn_avaliacoes_resumo_lojista', filtros),
      supabase.rpc('fn_avaliacoes_lojista', { ...filtros, p_limit: PAGE_SIZE, p_offset: (Number(pag) - 1) * PAGE_SIZE }),
    ])
    if (meu !== pedido.current) return
    setCarregando(false)
    if (resumoRes.error || listaRes.error || !resumoRes.data) {
      setErro(true)
      return
    }

    // NUMERIC e BIGINT do Postgres podem chegar como texto — normaliza.
    const bruto = resumoRes.data as {
      geral: { media: number | string | null; total: number | string }
      periodo: { media: number | string | null; total: number | string } & Record<`nota_${Nota}`, number | string>
    }
    const linhas = (listaRes.data ?? []) as (LinhaAvaliacao & { total_count: number | string })[]
    setDados({
      chave,
      resumo: {
        geral: { media: bruto.geral.media != null ? Number(bruto.geral.media) : null, total: Number(bruto.geral.total) },
        periodo: {
          media: bruto.periodo.media != null ? Number(bruto.periodo.media) : null,
          total: Number(bruto.periodo.total),
          porNota: {
            5: Number(bruto.periodo.nota_5),
            4: Number(bruto.periodo.nota_4),
            3: Number(bruto.periodo.nota_3),
            2: Number(bruto.periodo.nota_2),
            1: Number(bruto.periodo.nota_1),
          },
        },
      },
      linhas,
      total: linhas.length > 0 ? Number(linhas[0].total_count) : 0,
    })
  }, [idLojista, pode, chave])

  useEffect(() => { carregar() }, [carregar])

  // As opções dos filtros de serviço e de profissional.
  useEffect(() => {
    if (!idLojista || !pode) return
    Promise.all([
      supabase.from('servico').select('id_servico, nome').eq('id_lojista', idLojista).order('nome'),
      supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', idLojista).order('nome'),
    ]).then(([servs, funcs]) => {
      setServicos((servs.data ?? []) as { id_servico: string; nome: string }[])
      setFuncionarios((funcs.data ?? []) as { id_funcionario: string; nome: string }[])
    })
  }, [idLojista, pode])

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Avaliações" />
        <SemPermissao area="ver as avaliações" />
      </ScreenContainer>
    )
  }

  function mudarPeriodo(novo: OpcaoDePeriodo) {
    setPreset(novo === TODO_O_PERIODO ? null : novo)
    setPersonalizado({})
    setPagina(1)
  }

  function aplicarPersonalizado(ini: string, fim: string) {
    setCalendarioAberto(false)
    setPreset('personalizado')
    setPersonalizado({ ini, fim })
    setPagina(1)
  }

  // Trocar filtro volta para a primeira página.
  const comPrimeiraPagina = (guardar: (v: string) => void) => (v: string) => { guardar(v); setPagina(1) }

  // Enquanto o recorte novo carrega, o anterior fica à vista, apagado.
  const d = dados
  const desatualizado = carregando || d?.chave !== chave
  const totalPaginas = Math.max(1, Math.ceil((d?.total ?? 0) / PAGE_SIZE))
  const temFiltro = !!(preset || filtroNota || filtroServico || filtroFuncionario)
  const maiorContagem = d ? Math.max(1, ...NOTAS.map(n => d.resumo.periodo.porNota[n])) : 1
  // O calendário abre logo abaixo do botão do período, recuando o que for
  // preciso para caber na tela (12 de folga na direita).
  const larguraDoCalendario = Math.min(LARGURA_DO_CALENDARIO, larguraDaTela - 24)
  const esquerdaDoCalendario = Math.min(17, larguraDaTela - 12 - 16 - larguraDoCalendario)

  return (
    <ScreenContainer refreshing={carregando && !!d} onRefresh={carregar}>
      <DetailHeader title="Avaliações" />

      {erro ? (
        <View style={styles.erro}>
          <Aviso tipo="erro" texto="Não foi possível carregar as avaliações agora." />
          <BotaoPequeno rotulo="Tentar novamente" onPress={carregar} style={styles.tentar} />
        </View>
      ) : !d ? null : d.resumo.geral.total === 0 ? (
        <CartaoVazio
          icone={IconStar}
          titulo="Ainda não há avaliações para esta loja."
          texto="Assim que um cliente avaliar um atendimento finalizado, ela aparece aqui."
        />
      ) : (
        <View>
          <View style={desatualizado && styles.apagado} pointerEvents={desatualizado ? 'none' : 'auto'}>
            <Pilha>
              {/* ── Visão geral da loja (sem filtro nenhum) ── */}
              <GradeIndicadores>
                <Indicador
                  rotulo="Média geral da loja"
                  valor={formatarMedia(d.resumo.geral.media ?? 0)}
                  aoLado={<Estrelas nota={d.resumo.geral.media ?? 0} tamanho={18} />}
                  icone={IconStar}
                  detalhe="todas as avaliações, sem filtro"
                />
                <Indicador
                  rotulo="Total de avaliações"
                  valor={String(d.resumo.geral.total)}
                  icone={IconInbox}
                  detalhe="desde a primeira avaliação recebida"
                />
              </GradeIndicadores>

              {/* ── Filtros ── */}
              <View style={styles.filtros} onLayout={e => setTopoDosFiltros(e.nativeEvent.layout.y)}>
                <FiltroPeriodo
                  opcoes={OPCOES_PERIODO}
                  valor={preset ?? TODO_O_PERIODO}
                  onMudar={mudarPeriodo}
                  ini={periodo?.ini ?? hojeBrasilISO()}
                  fim={periodo?.fim ?? hojeBrasilISO()}
                  calendarioAberto={calendarioAberto}
                  onCalendario={setCalendarioAberto}
                />
                <View style={styles.filtrosDaLista}>
                  <Seletor justo titulo="Nota" valor={filtroNota} opcoes={OPCOES_NOTA} onChange={comPrimeiraPagina(setFiltroNota)} />
                  <Seletor
                    justo
                    titulo="Serviço"
                    valor={filtroServico}
                    opcoes={[{ valor: '', rotulo: 'Todos os serviços' }, ...servicos.map(s => ({ valor: s.id_servico, rotulo: s.nome }))]}
                    onChange={comPrimeiraPagina(setFiltroServico)}
                  />
                  {funcionarios.length > 0 && (
                    <Seletor
                      justo
                      titulo="Profissional"
                      valor={filtroFuncionario}
                      opcoes={[{ valor: '', rotulo: 'Todos os profissionais' }, ...funcionarios.map(f => ({ valor: f.id_funcionario, rotulo: f.nome }))]}
                      onChange={comPrimeiraPagina(setFiltroFuncionario)}
                    />
                  )}
                </View>
              </View>

              {/* ── Recorte filtrado: média e distribuição ── */}
              <Secao titulo={temFiltro ? 'Média no período / filtro selecionado' : 'Média de todas as avaliações'} icone={IconStar}>
                {d.resumo.periodo.total === 0 || d.resumo.periodo.media == null ? (
                  <SecaoVazia>Nenhuma avaliação com esses filtros.</SecaoVazia>
                ) : (
                  <>
                    <View style={styles.media}>
                      <Text style={styles.mediaValor}>{formatarMedia(d.resumo.periodo.media)}</Text>
                      <Estrelas nota={d.resumo.periodo.media} tamanho={20} />
                    </View>
                    <NotaDaSecao>
                      {d.resumo.periodo.total} {d.resumo.periodo.total === 1 ? 'avaliação' : 'avaliações'}
                      {periodo ? ` entre ${dataBR(periodo.ini)} e ${dataBR(periodo.fim)}` : ''}
                    </NotaDaSecao>
                  </>
                )}
              </Secao>

              <Secao titulo="Distribuição das notas" descricao="Quantas avaliações de cada nota, com esses filtros">
                <Ranking
                  itens={NOTAS.map(n => ({
                    chave: String(n),
                    titulo: estrelas(n),
                    valor: String(d.resumo.periodo.porNota[n]),
                    parte: d.resumo.periodo.porNota[n] / maiorContagem,
                  }))}
                />
              </Secao>

              {/* ── Lista ── */}
              <Secao titulo="Avaliações recebidas">
                {d.linhas.length === 0 ? (
                  <View style={styles.semRegistro}>
                    <IconInbox size={32} color={colors.textFaint} />
                    <Text style={styles.semRegistroTexto}>Nenhuma avaliação com esses filtros.</Text>
                  </View>
                ) : (
                  <>
                    {d.linhas.map(a => (
                      <View key={a.id_avaliacao} style={styles.item}>
                        <View style={styles.itemTopo}>
                          <Estrelas nota={a.nota} />
                          <Text style={styles.itemData}>{format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm")}</Text>
                        </View>
                        <Text style={[styles.comentario, !a.comentario && styles.comentarioVazio]}>
                          {a.comentario ? `“${a.comentario}”` : 'Sem comentário'}
                        </Text>
                        <View style={styles.meta}>
                          <Text style={styles.metaTexto}>
                            Cliente:{' '}
                            <Text style={styles.metaForte} onPress={() => router.push(`/clientes/${a.id_cliente}` as never)}>{a.nome_cliente}</Text>
                          </Text>
                          <Text style={styles.metaTexto}>Pet: <Text style={styles.metaForte}>{a.nome_pet}</Text></Text>
                          <Text style={styles.metaTexto}>Serviço: <Text style={styles.metaForte}>{a.nome_servico}</Text></Text>
                          {a.nome_funcionario ? (
                            <Text style={styles.metaTexto}>Profissional: <Text style={styles.metaForte}>{a.nome_funcionario}</Text></Text>
                          ) : null}
                          <Text style={styles.metaTexto}>Atendimento: <Text style={styles.metaForte}>{dataBR(a.dt_agendamento)}</Text></Text>
                        </View>
                      </View>
                    ))}

                    <View style={styles.paginacao}>
                      <Text style={styles.paginacaoTexto}>
                        {d.total} {d.total === 1 ? 'avaliação' : 'avaliações'} · página {pagina} de {totalPaginas}
                      </Text>
                      <View style={styles.paginacaoBotoes}>
                        <BotaoPequeno variante="fantasma" rotulo="Anterior" icone={IconChevronLeft} desativado={pagina <= 1} onPress={() => setPagina(p => p - 1)} />
                        <BotaoPequeno variante="fantasma" rotulo="Próxima" iconeDepois={IconChevronRight} desativado={pagina >= totalPaginas} onPress={() => setPagina(p => p + 1)} />
                      </View>
                    </View>
                  </>
                )}
              </Secao>
            </Pilha>
          </View>

          {/* O calendário do período fica por cima do que vem embaixo. Vai aqui
              (e não dentro do cartão dos filtros) para os toques valerem também
              no Android, que ignora o que sai dos limites do pai. */}
          {preset === 'personalizado' && calendarioAberto && periodo && (
            <View style={[styles.calendario, { top: topoDosFiltros + DO_CARTAO_AO_CALENDARIO, left: esquerdaDoCalendario }]}>
              <CalendarioPeriodo
                key={`${periodo.ini}|${periodo.fim}`}
                ini={periodo.ini}
                fim={periodo.fim}
                dataMax={hojeBrasilISO()}
                largura={larguraDoCalendario}
                onCancelar={() => setCalendarioAberto(false)}
                onAplicar={aplicarPersonalizado}
              />
            </View>
          )}
        </View>
      )}
    </ScreenContainer>
  )
}

// Do alto do cartão dos filtros até o calendário: 16 do cartão + 36 das
// opções + 12 + 42 do botão + 6 de vão (mais a borda).
const DO_CARTAO_AO_CALENDARIO = 113

const styles = StyleSheet.create({
  erro: { gap: 12 },
  tentar: { alignSelf: 'flex-start' },
  apagado: { opacity: 0.6 },
  // Cartão dos filtros (`.relatorio-filtros.card`): o período em cima e,
  // 32 abaixo, os três seletores, um por linha.
  filtros: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 32 },
  filtrosDaLista: { gap: 12 },
  calendario: { position: 'absolute' },
  media: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mediaValor: { fontFamily: FONTE_TITULO, fontSize: 32, lineHeight: 32, fontWeight: '800', color: colors.text },
  semRegistro: { alignItems: 'center', gap: 19, paddingVertical: 24 },
  semRegistroTexto: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  // `.avaliacao-item`: estrelas e data, o comentário e, embaixo, de quem e do quê.
  item: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemTopo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  itemData: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  comentario: { fontSize: 15, lineHeight: 22.5, color: '#1f2937', marginBottom: 8 },
  comentarioVazio: { color: '#858d99', fontStyle: 'italic' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  metaTexto: { fontSize: 13, lineHeight: 20.8, color: '#6b7280' },
  metaForte: { fontWeight: '600', color: '#4b5563' },
  paginacao: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 },
  paginacaoTexto: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  paginacaoBotoes: { flexDirection: 'row', gap: 8 },
})
