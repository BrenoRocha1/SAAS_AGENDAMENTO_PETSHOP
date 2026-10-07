import { useCallback, useEffect, useState } from 'react'
import { Platform, Share, StyleSheet, View, useWindowDimensions } from 'react-native'
import { format, parseISO } from 'date-fns'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { CartaoVazio } from '@/components/CartaoVazio'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import {
  IconAlert,
  IconCalendar,
  IconChartBar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconInbox,
  IconMoney,
  IconPackage,
  IconRepeat,
  IconScissors,
  IconUserBadge,
  IconUsers,
} from '@/components/IconesDoSite'
import { Seletor } from '@/components/Seletor'
import { StatusBadge } from '@/components/StatusBadge'
import { Text } from '@/components/Texto'
import { CalendarioPeriodo, FiltroPeriodo, LARGURA_DO_CALENDARIO } from '@/components/relatorio/FiltroPeriodo'
import { GraficoEvolucao } from '@/components/relatorio/GraficoEvolucao'
import { GradeIndicadores, Indicador, compararComAnterior } from '@/components/relatorio/Indicador'
import { MiniIndicadores } from '@/components/relatorio/MiniIndicadores'
import { BarraEmPartes, Etiqueta, Ranking } from '@/components/relatorio/Ranking'
import { GrupoDaSecao, NotaDaSecao, Pilha, Secao, SecaoVazia } from '@/components/relatorio/Secao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO } from '@/lib/agenda'
import { faltaMigration } from '@/lib/erros'
import { formatarMoeda as moeda } from '@/lib/format'
import { ROTULO_STATUS_PAGAMENTO, ehFormaPlano, ehStatusPagamento, rotuloForma, type StatusPagamento } from '@/lib/pagamento'
import { rotuloEstoque } from '@/lib/produto'
import { PRESETS, calcularPeriodo, calcularPeriodoAnterior, type PeriodoPreset } from '@/lib/relatorios'
import { rotuloStatus, type StatusAgendamento } from '@/lib/statusAgendamento'
import { colors } from '@/theme/theme'

// ============================================================
// Tipos — espelham o retorno das funções do relatório (migrations 016,
// 057, 060 e 062). NUMERIC e BIGINT chegam como texto do PostgREST.
// ============================================================
interface ResumoPeriodo {
  faturamento: number
  vendas: number
  pendente: number
  atendimentos_total: number
  valor_atendimentos_total: number
  cancelados: number
}
interface VendaPorDia { dia: string; vendas: number; faturamento: number }
interface VendaPorServico { id_servico: string; nome_servico: string; qtd_vendas: number; faturamento: number }
interface VendaPorProfissional { id_funcionario: string | null; nome_funcionario: string; qtd_atendimentos: number; faturamento: number; ticket_medio: number }
interface VendaPorCliente { id_cliente: string; nome_cliente: string; qtd_atendimentos: number; valor_total: number }
interface ClientesResumo { clientes_atendidos: number; clientes_novos: number; clientes_recorrentes: number }
// Pedidos do período (sem cancelados) por forma — registrado, recebido e a receber.
interface VendaPorPagamento { forma: string; pedidos: number; total: number; recebido: number; pendente: number }
// Itens de atendimentos concluídos — bruto, CMV (custo da venda) e líquido.
interface VendasProdutos {
  bruto: number
  cmv: number
  liquido: number
  bruto_com_custo: number
  bruto_sem_custo: number
  itens_sem_custo: number
  pedidos: number
  produtos: {
    id_produto: string
    produto: string
    unidade_venda: string
    quantidade: number
    bruto: number
    cmv: number
    liquido: number
    bruto_com_custo: number
    sem_custo: number
  }[]
}
interface RelatorioPlanos {
  tem_planos: boolean
  ativas: number
  receita_mensal: number
  receita_periodo: number
  pagas_qtd: number
  pagas_valor: number
  pendentes_qtd: number
  pendentes_valor: number
  vencidas_qtd: number
  vencidas_valor: number
  planos: { plano: string; ativas: number; novas: number; receita: number }[]
  servicos: { servico: string; usos: number }[]
}
interface LinhaDetalhamento {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  valor: number
  status: string
  nome_pet: string
  nome_servico: string
  nome_cliente: string
  nome_funcionario: string | null
  // Migration 057 — null em agendamento antigo (ou sem a migration).
  forma_pagamento: string | null
  status_pagamento: string | null
}

interface Dados {
  chave: string
  resumo: ResumoPeriodo
  anterior: ResumoPeriodo | null
  porDia: VendaPorDia[]
  porServico: VendaPorServico[]
  porProfissional: VendaPorProfissional[]
  porCliente: VendaPorCliente[]
  clientesResumo: ClientesResumo | null
  // null = a migration ainda não rodou.
  porPagamento: VendaPorPagamento[] | null
  planos: RelatorioPlanos | null
  produtos: VendasProdutos | null
}

function numeros<T extends object>(linha: T, campos: (keyof T)[]): T {
  const copia = { ...linha }
  for (const c of campos) (copia as Record<keyof T, unknown>)[c] = Number(linha[c] ?? 0)
  return copia
}

const CAMPOS_RESUMO: (keyof ResumoPeriodo)[] = ['faturamento', 'vendas', 'pendente', 'atendimentos_total', 'valor_atendimentos_total', 'cancelados']
const PAGE_SIZE = 20
const LIMITE_LINHAS_CSV = 5000
const STATUS_OPCOES: StatusAgendamento[] = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado']

type Ordenacao = 'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc'
const ORDENACOES: Record<Ordenacao, { coluna: 'dt_agendamento' | 'valor'; ascendente: boolean }> = {
  data_desc: { coluna: 'dt_agendamento', ascendente: false },
  data_asc: { coluna: 'dt_agendamento', ascendente: true },
  valor_desc: { coluna: 'valor', ascendente: false },
  valor_asc: { coluna: 'valor', ascendente: true },
}
const OPCOES_ORDENAR: { valor: Ordenacao; rotulo: string }[] = [
  { valor: 'data_desc', rotulo: 'Mais recentes primeiro' },
  { valor: 'data_asc', rotulo: 'Mais antigos primeiro' },
  { valor: 'valor_desc', rotulo: 'Maior valor primeiro' },
  { valor: 'valor_asc', rotulo: 'Menor valor primeiro' },
]

// Cores do selo de pagamento: as do status do agendamento equivalente.
const STATUS_DO_SELO: Record<StatusPagamento, StatusAgendamento> = {
  pendente: 'Pendente',
  pago: 'Concluído',
  cancelado: 'Cancelado',
}

const SELECAO_DO_DETALHAMENTO = `
  id_agendamento, dt_agendamento, hr_agendamento, valor, status,
  pet:id_pet ( nome ),
  servico:id_servico ( nome ),
  cliente:id_cliente ( nome ),
  funcionario:id_funcionario ( nome )
`

interface LinhaBruta {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  valor: number
  status: string
  pet: { nome: string } | null
  servico: { nome: string } | null
  cliente: { nome: string } | null
  funcionario: { nome: string } | null
}

// Peso de `valor` em `total`, para a barra e para o texto ao lado ("42,5%").
// Sem total, a linha fica sem barra.
function parteDe(valor: number, total: number): { parte?: number; rotuloDaParte?: string } {
  if (!(total > 0)) return {}
  const parte = valor / total
  return { parte, rotuloDaParte: `${(parte * 100).toFixed(1).replace('.', ',')}%` }
}

const plural = (n: number, palavra: string) => `${n} ${palavra}${n !== 1 ? 's' : ''}`

// Relatórios de Vendas — a mesma página do painel web: indicadores do
// período, evolução, formas de pagamento, produtos, planos, serviços,
// profissionais, clientes e o detalhamento linha a linha. Só leitura, e só
// para dono ou administrador.
export default function RelatoriosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const { width: larguraDaTela } = useWindowDimensions()

  const [preset, setPreset] = useState<PeriodoPreset>('30dias')
  const [personalizado, setPersonalizado] = useState<{ ini?: string; fim?: string }>({})
  const [calendarioAberto, setCalendarioAberto] = useState(false)
  const periodo = calcularPeriodo(preset, personalizado.ini, personalizado.fim)
  const chave = `${periodo.ini}|${periodo.fim}`

  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [funcionarios, setFuncionarios] = useState<{ id_funcionario: string; nome: string }[]>([])
  const [servicos, setServicos] = useState<{ id_servico: string; nome: string }[]>([])

  // Detalhamento
  const [filtroFuncionario, setFiltroFuncionario] = useState('')
  const [filtroServico, setFiltroServico] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [ordenar, setOrdenar] = useState<Ordenacao>('data_desc')
  const [pagina, setPagina] = useState(1)
  const [detalhe, setDetalhe] = useState<{ linhas: LinhaDetalhamento[]; total: number } | null>(null)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [exportErro, setExportErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    setCarregando(true)
    setErro(null)
    const [ini, fim] = chave.split('|')
    const anterior = calcularPeriodoAnterior({ ini, fim })
    const args = { p_id_lojista: idLojista, p_data_ini: ini, p_data_fim: fim }
    // Todas as consultas são independentes — disparadas juntas.
    const [resumo, resumoAnterior, porDia, porServico, porProfissional, porCliente, clientesResumo, porPagamento, planos, produtos, funcs, servs] = await Promise.all([
      supabase.rpc('fn_relatorio_vendas_resumo', args),
      supabase.rpc('fn_relatorio_vendas_resumo', { p_id_lojista: idLojista, p_data_ini: anterior.ini, p_data_fim: anterior.fim }),
      supabase.rpc('fn_relatorio_vendas_por_dia', args),
      supabase.rpc('fn_relatorio_vendas_por_servico', args),
      supabase.rpc('fn_relatorio_vendas_por_profissional', args),
      supabase.rpc('fn_relatorio_vendas_por_cliente', { ...args, p_limite: 10 }),
      supabase.rpc('fn_relatorio_clientes_resumo', args),
      supabase.rpc('fn_relatorio_vendas_por_pagamento', args),
      supabase.rpc('fn_relatorio_planos', args),
      supabase.rpc('fn_relatorio_vendas_produtos', args),
      supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', idLojista).eq('ativo', true).order('nome'),
      supabase.from('servico').select('id_servico, nome').eq('id_lojista', idLojista).order('nome'),
    ])
    setCarregando(false)
    // O resumo é a base de tudo: sem ele a tela perde o sentido.
    if (resumo.error || !resumo.data) {
      setErro(faltaMigration(resumo.error)
        ? 'Não foi possível carregar os relatórios agora. Execute a migration 016_relatorio_vendas.sql se ainda não rodou, e tente novamente.'
        : 'Não foi possível carregar os relatórios agora.')
      return
    }
    setFuncionarios((funcs.data ?? []) as { id_funcionario: string; nome: string }[])
    setServicos((servs.data ?? []) as { id_servico: string; nome: string }[])
    const cr = clientesResumo.error ? null : (clientesResumo.data as ClientesResumo | null)
    setDados({
      chave,
      resumo: numeros(resumo.data as ResumoPeriodo, CAMPOS_RESUMO),
      anterior: resumoAnterior.error || !resumoAnterior.data ? null : numeros(resumoAnterior.data as ResumoPeriodo, CAMPOS_RESUMO),
      porDia: ((porDia.data ?? []) as VendaPorDia[]).map(l => numeros(l, ['vendas', 'faturamento'])),
      porServico: ((porServico.data ?? []) as VendaPorServico[]).map(l => numeros(l, ['qtd_vendas', 'faturamento'])),
      porProfissional: ((porProfissional.data ?? []) as VendaPorProfissional[]).map(l => numeros(l, ['qtd_atendimentos', 'faturamento', 'ticket_medio'])),
      porCliente: ((porCliente.data ?? []) as VendaPorCliente[]).map(l => numeros(l, ['qtd_atendimentos', 'valor_total'])),
      clientesResumo: cr ? numeros(cr, ['clientes_atendidos', 'clientes_novos', 'clientes_recorrentes']) : null,
      porPagamento: porPagamento.error ? null : ((porPagamento.data ?? []) as VendaPorPagamento[]).map(l => numeros(l, ['pedidos', 'total', 'recebido', 'pendente'])),
      planos: planos.error ? null : (planos.data as RelatorioPlanos | null),
      produtos: produtos.error ? null : (produtos.data as VendasProdutos | null),
    })
  }, [idLojista, pode, chave])

  useEffect(() => { carregar() }, [carregar])

  // Detalhamento: os agendamentos do período, com os filtros, a ordem e a página.
  const carregarDetalhe = useCallback(async () => {
    if (!idLojista || !pode) return
    setCarregandoDetalhe(true)
    const [ini, fim] = chave.split('|')
    const { coluna, ascendente } = ORDENACOES[ordenar]
    let q = supabase
      .from('agendamento')
      .select(SELECAO_DO_DETALHAMENTO, { count: 'exact' })
      .eq('id_lojista', idLojista)
      .gte('dt_agendamento', ini)
      .lte('dt_agendamento', fim)
    if (filtroFuncionario) q = q.eq('id_funcionario', filtroFuncionario)
    if (filtroServico) q = q.eq('id_servico', filtroServico)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data, count } = await q.order(coluna, { ascending: ascendente }).range((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE - 1)
    const linhas: LinhaDetalhamento[] = ((data ?? []) as unknown as LinhaBruta[]).map(l => ({
      id_agendamento: l.id_agendamento,
      dt_agendamento: l.dt_agendamento,
      hr_agendamento: l.hr_agendamento,
      valor: Number(l.valor),
      status: l.status,
      nome_pet: l.pet?.nome ?? '—',
      nome_servico: l.servico?.nome ?? '—',
      nome_cliente: l.cliente?.nome ?? '—',
      nome_funcionario: l.funcionario?.nome ?? null,
      forma_pagamento: null,
      status_pagamento: null,
    }))
    // Forma e situação do pagamento das linhas da página (tolerante: sem a
    // migration 057 as colunas não existem e a célula fica "Não informada").
    if (linhas.length > 0) {
      const pg = await supabase.from('agendamento').select('id_agendamento, forma_pagamento, status_pagamento').in('id_agendamento', linhas.map(l => l.id_agendamento))
      const porId = new Map(((pg.error ? [] : pg.data ?? []) as { id_agendamento: string; forma_pagamento: string | null; status_pagamento: string | null }[]).map(p => [p.id_agendamento, p]))
      for (const l of linhas) {
        l.forma_pagamento = porId.get(l.id_agendamento)?.forma_pagamento ?? null
        l.status_pagamento = porId.get(l.id_agendamento)?.status_pagamento ?? null
      }
    }
    setDetalhe({ linhas, total: count ?? 0 })
    setCarregandoDetalhe(false)
  }, [idLojista, pode, chave, filtroFuncionario, filtroServico, filtroStatus, ordenar, pagina])

  useEffect(() => { carregarDetalhe() }, [carregarDetalhe])

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Relatórios de Vendas" />
        <SemPermissao area="ver os relatórios" />
      </ScreenContainer>
    )
  }

  function mudarPreset(novo: PeriodoPreset) {
    setPreset(novo)
    setPersonalizado({})
    setPagina(1)
  }

  function aplicarPersonalizado(ini: string, fim: string) {
    setCalendarioAberto(false)
    setPreset('personalizado')
    setPersonalizado({ ini, fim })
    setPagina(1)
  }

  // Trocar filtro ou ordem volta para a primeira página.
  const comPrimeiraPagina = <T,>(guardar: (v: T) => void) => (v: T) => { guardar(v); setPagina(1) }

  async function exportar() {
    if (!idLojista) return
    setExportErro(null)
    setExportando(true)
    let q = supabase
      .from('agendamento')
      .select(SELECAO_DO_DETALHAMENTO)
      .eq('id_lojista', idLojista)
      .gte('dt_agendamento', periodo.ini)
      .lte('dt_agendamento', periodo.fim)
      .order('dt_agendamento', { ascending: true })
      .order('hr_agendamento', { ascending: true })
      .limit(LIMITE_LINHAS_CSV + 1)
    if (filtroFuncionario) q = q.eq('id_funcionario', filtroFuncionario)
    if (filtroServico) q = q.eq('id_servico', filtroServico)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data, error } = await q
    setExportando(false)
    if (error) return setExportErro('Não foi possível gerar o CSV. Tente novamente.')
    const linhas = (data ?? []) as unknown as LinhaBruta[]
    if (linhas.length > LIMITE_LINHAS_CSV) {
      return setExportErro(`O período selecionado tem mais de ${LIMITE_LINHAS_CSV} registros. Estreite o período ou aplique um filtro antes de exportar.`)
    }
    const escapar = (valor: string) => (/[",\n;]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor)
    const cabecalho = ['Data', 'Horário', 'Cliente', 'Pet', 'Serviço', 'Profissional', 'Valor', 'Status']
    const corpo = linhas.map(l => [
      l.dt_agendamento.split('-').reverse().join('/'),
      l.hr_agendamento.slice(0, 5),
      l.cliente?.nome ?? '',
      l.pet?.nome ?? '',
      l.servico?.nome ?? '',
      l.funcionario?.nome ?? '',
      Number(l.valor).toFixed(2).replace('.', ','),
      l.status,
    ].map(v => escapar(String(v))).join(';'))
    const csv = '﻿' + [cabecalho.join(';'), ...corpo].join('\r\n')
    const nome = `vendas_${periodo.ini}_a_${periodo.fim}.csv`
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } else {
      // No celular o conteúdo sai pela folha de compartilhar do aparelho.
      try { await Share.share({ title: nome, message: csv }) } catch { /* a pessoa desistiu */ }
    }
  }

  // Enquanto o período novo carrega, o anterior fica à vista, apagado.
  const d = dados
  const desatualizado = carregando || d?.chave !== chave
  const totalPaginas = Math.max(1, Math.ceil((detalhe?.total ?? 0) / PAGE_SIZE))
  // O calendário abre logo abaixo do botão do período, recuando o que for
  // preciso para caber na tela (12 de folga na direita).
  const larguraDoCalendario = Math.min(LARGURA_DO_CALENDARIO, larguraDaTela - 24)
  const esquerdaDoCalendario = Math.min(17, larguraDaTela - 12 - 16 - larguraDoCalendario)

  return (
    <ScreenContainer refreshing={carregando && !!d} onRefresh={() => { carregar(); carregarDetalhe() }}>
      <DetailHeader title="Relatórios de Vendas" />

      <View>
        <View style={styles.filtros}>
          <FiltroPeriodo
            opcoes={PRESETS}
            valor={preset}
            onMudar={mudarPreset}
            ini={periodo.ini}
            fim={periodo.fim}
            calendarioAberto={calendarioAberto}
            onCalendario={setCalendarioAberto}
          />
        </View>

        {erro ? (
          <Aviso tipo="erro" texto={erro} />
        ) : !d ? null : d.resumo.atendimentos_total === 0 ? (
          <View style={desatualizado && styles.apagado}>
            <CartaoVazio
              ilustracao="relatorios"
              titulo="Nenhuma venda encontrada para o período selecionado."
              texto="Tente escolher outro período ou verifique se há agendamentos cadastrados."
            />
          </View>
        ) : (
          <View style={desatualizado && styles.apagado} pointerEvents={desatualizado ? 'none' : 'auto'}>
            <Pilha>
              {/* ── Indicadores ── */}
              <GradeIndicadores>
                <Indicador
                  rotulo="Faturamento"
                  valor={moeda(d.resumo.faturamento)}
                  icone={IconMoney}
                  variacao={d.anterior && compararComAnterior(d.resumo.faturamento, d.anterior.faturamento)}
                  detalhe="atendimentos concluídos"
                />
                <Indicador
                  rotulo="Vendas"
                  valor={String(d.resumo.vendas)}
                  icone={IconCheck}
                  variacao={d.anterior && compararComAnterior(d.resumo.vendas, d.anterior.vendas)}
                  detalhe="atendimentos concluídos"
                />
                <Indicador
                  rotulo="Ticket médio"
                  valor={moeda(d.resumo.vendas > 0 ? d.resumo.faturamento / d.resumo.vendas : 0)}
                  icone={IconChartBar}
                  detalhe="por venda"
                />
                <Indicador
                  rotulo="Atendimentos no período"
                  valor={String(d.resumo.atendimentos_total)}
                  icone={IconCalendar}
                  variacao={d.anterior && compararComAnterior(d.resumo.atendimentos_total, d.anterior.atendimentos_total)}
                />
                <Indicador
                  rotulo="Valor médio por atendimento"
                  valor={moeda(d.resumo.atendimentos_total > 0 ? d.resumo.valor_atendimentos_total / d.resumo.atendimentos_total : 0)}
                  icone={IconClock}
                />
                <Indicador rotulo="Total pendente" valor={moeda(d.resumo.pendente)} icone={IconAlert} detalhe="agendado ou confirmado" />
              </GradeIndicadores>

              {/* ── Evolução do faturamento ── */}
              <Secao titulo="Evolução das vendas" descricao="Faturamento por dia dos atendimentos concluídos">
                <EvolucaoDasVendas dados={d.porDia} />
              </Secao>

              {/* ── Vendas por forma de pagamento (migration 057) ── */}
              <Secao titulo="Vendas por forma de pagamento" icone={IconMoney} descricao="Pedidos com data no período, sem os cancelados">
                <VendasPorPagamento linhas={d.porPagamento} />
              </Secao>

              {/* ── Vendas de produtos: bruto, CMV e líquido (migration 062) ── */}
              {d.produtos && (
                <Secao titulo="Vendas de produtos" icone={IconPackage} descricao="Produtos vendidos junto de atendimentos concluídos">
                  <VendasDeProdutos v={d.produtos} />
                </Secao>
              )}

              {/* ── Planos recorrentes (migration 060) ── */}
              {d.planos?.tem_planos && (
                <Secao titulo="Planos e assinaturas" icone={IconRepeat} descricao="Receita e cobranças dos planos no período">
                  <PlanosNoRelatorio r={d.planos} />
                </Secao>
              )}

              {/* ── Vendas por serviço ── */}
              <Secao titulo="Vendas por serviço" icone={IconScissors} descricao="Parte de cada serviço no faturamento">
                {d.porServico.length === 0 ? (
                  <SecaoVazia>Nenhuma venda concluída neste período.</SecaoVazia>
                ) : (
                  <Ranking
                    itens={d.porServico.map(s => ({
                      chave: s.id_servico,
                      titulo: s.nome_servico,
                      valor: moeda(s.faturamento),
                      detalhe: plural(s.qtd_vendas, 'atendimento'),
                      ...parteDe(s.faturamento, d.resumo.faturamento),
                    }))}
                  />
                )}
              </Secao>

              {/* ── Vendas por profissional ── */}
              <Secao titulo="Vendas por profissional" icone={IconUserBadge} descricao="Parte de cada profissional no faturamento">
                {d.porProfissional.length === 0 ? (
                  <SecaoVazia>Nenhuma venda concluída neste período.</SecaoVazia>
                ) : (
                  <Ranking
                    comIniciais
                    itens={d.porProfissional.map(p => ({
                      chave: p.id_funcionario ?? 'sem-profissional',
                      titulo: p.nome_funcionario,
                      // Atendimentos sem profissional não são uma pessoa: sem iniciais.
                      sigla: p.id_funcionario ? undefined : '—',
                      valor: moeda(p.faturamento),
                      detalhe: `${plural(p.qtd_atendimentos, 'atendimento')} · ticket médio ${moeda(p.ticket_medio)}`,
                      ...parteDe(p.faturamento, d.resumo.faturamento),
                    }))}
                  />
                )}
              </Secao>

              {/* ── Clientes ── */}
              <Secao titulo="Clientes" icone={IconUsers} descricao="Quem mais comprou no período">
                {d.clientesResumo && (
                  <MiniIndicadores
                    itens={[
                      { valor: d.clientesResumo.clientes_atendidos, rotulo: 'atendidos' },
                      { valor: d.clientesResumo.clientes_novos, rotulo: 'novos' },
                      { valor: d.clientesResumo.clientes_recorrentes, rotulo: 'recorrentes' },
                    ]}
                  />
                )}
                {d.porCliente.length === 0 ? (
                  <SecaoVazia>Nenhuma venda concluída neste período.</SecaoVazia>
                ) : (
                  <Ranking
                    comIniciais
                    itens={d.porCliente.map(c => ({
                      chave: c.id_cliente,
                      titulo: c.nome_cliente,
                      valor: moeda(c.valor_total),
                      detalhe: plural(c.qtd_atendimentos, 'atendimento'),
                      ...parteDe(c.valor_total, d.resumo.faturamento),
                    }))}
                  />
                )}
              </Secao>

              {/* ── Detalhamento ── */}
              <Secao
                titulo="Detalhamento das vendas"
                descricao="Todos os agendamentos do período, um por linha"
                acao={<BotaoPequeno rotulo={exportando ? 'Exportando...' : 'Exportar CSV'} icone={IconDownload} desativado={exportando} onPress={exportar} />}
              >
                {exportErro && <Aviso tipo="erro" texto={exportErro} />}

                <View style={styles.filtrosDaTabela}>
                  <Seletor
                    justo
                    titulo="Profissional"
                    valor={filtroFuncionario}
                    opcoes={[{ valor: '', rotulo: 'Todos os profissionais' }, ...funcionarios.map(f => ({ valor: f.id_funcionario, rotulo: f.nome }))]}
                    desativado={carregandoDetalhe}
                    onChange={comPrimeiraPagina(setFiltroFuncionario)}
                  />
                  <Seletor
                    justo
                    titulo="Serviço"
                    valor={filtroServico}
                    opcoes={[{ valor: '', rotulo: 'Todos os serviços' }, ...servicos.map(s => ({ valor: s.id_servico, rotulo: s.nome }))]}
                    desativado={carregandoDetalhe}
                    onChange={comPrimeiraPagina(setFiltroServico)}
                  />
                  <Seletor
                    justo
                    titulo="Status"
                    valor={filtroStatus}
                    opcoes={[{ valor: '', rotulo: 'Todos os status' }, ...STATUS_OPCOES.map(s => ({ valor: s as string, rotulo: rotuloStatus(s) }))]}
                    desativado={carregandoDetalhe}
                    onChange={comPrimeiraPagina(setFiltroStatus)}
                  />
                  <Seletor justo titulo="Ordenar" valor={ordenar} opcoes={OPCOES_ORDENAR} desativado={carregandoDetalhe} onChange={comPrimeiraPagina(setOrdenar)} />
                </View>

                {!detalhe ? null : detalhe.linhas.length === 0 ? (
                  <View style={styles.semRegistro}>
                    <IconInbox size={32} color={colors.textFaint} />
                    <Text style={styles.semRegistroTexto}>Nenhum registro com esses filtros.</Text>
                  </View>
                ) : (
                  <View style={carregandoDetalhe && styles.apagado}>
                    <View style={styles.tabela}>
                      {detalhe.linhas.map(l => (
                        <View key={l.id_agendamento} style={styles.linha}>
                          <Text style={[styles.celula, styles.celulaInteira]}>{format(parseISO(l.dt_agendamento), 'dd/MM/yyyy')}</Text>
                          <Text style={styles.celula}>{l.hr_agendamento.slice(0, 5)}</Text>
                          <Text style={styles.celula}>{l.nome_cliente}</Text>
                          <Text style={styles.celula}>{l.nome_pet}</Text>
                          <Text style={styles.celula}>{l.nome_servico}</Text>
                          <Text style={styles.celula}>{l.nome_funcionario ?? '—'}</Text>
                          <Text style={styles.celula}>{moeda(l.valor)}</Text>
                          <View style={styles.pagamento}>
                            <Text style={styles.pagamentoTexto}>{rotuloForma(l.forma_pagamento)}</Text>
                            {!ehFormaPlano(l.forma_pagamento) && ehStatusPagamento(l.status_pagamento) && (
                              <StatusBadge status={STATUS_DO_SELO[l.status_pagamento]} rotulo={ROTULO_STATUS_PAGAMENTO[l.status_pagamento]} />
                            )}
                          </View>
                          <StatusBadge status={l.status} />
                        </View>
                      ))}
                    </View>

                    <View style={styles.paginacao}>
                      <Text style={styles.paginacaoTexto}>
                        {plural(detalhe.total, 'registro')} · página {pagina} de {totalPaginas}
                      </Text>
                      <View style={styles.paginacaoBotoes}>
                        <BotaoPequeno variante="fantasma" rotulo="Anterior" icone={IconChevronLeft} desativado={pagina <= 1 || carregandoDetalhe} onPress={() => setPagina(p => p - 1)} />
                        <BotaoPequeno variante="fantasma" rotulo="Próxima" iconeDepois={IconChevronRight} desativado={pagina >= totalPaginas || carregandoDetalhe} onPress={() => setPagina(p => p + 1)} />
                      </View>
                    </View>
                  </View>
                )}
              </Secao>
            </Pilha>
          </View>
        )}

        {/* O calendário do período fica por cima do que vem embaixo. Vai aqui
            (e não dentro do cartão do filtro) para os toques valerem também
            no Android, que ignora o que sai dos limites do pai. */}
        {preset === 'personalizado' && calendarioAberto && (
          <View style={[styles.calendario, { left: esquerdaDoCalendario }]}>
            <CalendarioPeriodo
              key={chave}
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
    </ScreenContainer>
  )
}

// ============================================================
// Evolução: faturamento por dia em gráfico de área e, embaixo, o melhor e
// o pior dia (com venda) do período.
// ============================================================
function EvolucaoDasVendas({ dados }: { dados: VendaPorDia[] }) {
  if (dados.length === 0) return <SecaoVazia>Sem dados para exibir.</SecaoVazia>

  const melhorDia = dados.reduce((melhor, d) => (d.faturamento > melhor.faturamento ? d : melhor), dados[0])
  const diasComVenda = dados.filter(d => d.faturamento > 0)
  const piorDia = diasComVenda.length > 0
    ? diasComVenda.reduce((pior, d) => (d.faturamento < pior.faturamento ? d : pior), diasComVenda[0])
    : null
  const dia = (iso: string) => format(parseISO(iso), 'dd/MM')

  return (
    <>
      <GraficoEvolucao pontos={dados.map(d => ({ rotulo: dia(d.dia), faturamento: d.faturamento, vendas: d.vendas }))} />
      <MiniIndicadores
        itens={[
          { valor: moeda(melhorDia.faturamento), rotulo: `maior faturamento · ${dia(melhorDia.dia)}`, tom: 'sucesso' },
          ...(piorDia ? [{ valor: moeda(piorDia.faturamento), rotulo: `menor faturamento (com venda) · ${dia(piorDia.dia)}` }] : []),
          { valor: `${diasComVenda.length} de ${dados.length}`, rotulo: 'dias com venda' },
        ]}
      />
    </>
  )
}

// ============================================================
// Vendas por forma de pagamento: registrado, recebido e a receber no
// período, e cada forma com quantos pedidos e quanto.
// ============================================================
function VendasPorPagamento({ linhas }: { linhas: VendaPorPagamento[] | null }) {
  if (linhas === null) return <SecaoVazia>Execute a migration 057_formas_pagamento.sql para ver as vendas por forma de pagamento.</SecaoVazia>
  if (linhas.length === 0) return <SecaoVazia>Nenhum pedido neste período.</SecaoVazia>

  const total = linhas.reduce((s, l) => s + l.total, 0)
  const recebido = linhas.reduce((s, l) => s + l.recebido, 0)
  const pendente = linhas.reduce((s, l) => s + l.pendente, 0)
  const pedidos = linhas.reduce((s, l) => s + l.pedidos, 0)

  return (
    <>
      <MiniIndicadores
        itens={[
          { valor: moeda(total), rotulo: `registrado em ${plural(pedidos, 'pedido')}` },
          { valor: moeda(recebido), rotulo: 'recebido', tom: 'sucesso' },
          { valor: moeda(pendente), rotulo: 'a receber', tom: 'alerta' },
        ]}
      />
      <Ranking
        itens={linhas.map(l => {
          const forma = rotuloForma(l.forma === 'nao_informada' ? null : l.forma)
          return {
            chave: l.forma,
            titulo: forma,
            etiqueta: <Etiqueta>{plural(l.pedidos, 'pedido')}</Etiqueta>,
            valor: moeda(l.total),
            detalhe: l.forma === 'nao_informada'
              ? 'sem forma de pagamento registrada'
              : ehFormaPlano(l.forma)
                ? 'pelo plano, sem cobrança no agendamento'
                : `recebido ${moeda(l.recebido)} · a receber ${moeda(l.pendente)}`,
            // A barra é a fatia da forma no total: verde o recebido, âmbar o que falta.
            barra: (
              <BarraEmPartes
                total={total}
                partes={[
                  { valor: l.recebido, tom: 'sucesso' },
                  { valor: l.pendente, tom: 'alerta' },
                  { valor: Math.max(0, l.total - l.recebido - l.pendente), tom: 'neutro' },
                ]}
                rotulo={`${forma}: recebido e a receber`}
              />
            ),
            rotuloDaParte: parteDe(l.total, total).rotuloDaParte,
          }
        })}
      />
      <NotaDaSecao>
        Na barra, verde é o recebido, âmbar o que falta receber e cinza o que não tem situação de pagamento. &quot;Recebido&quot; é o que a loja marcou como pago; &quot;Não informada&quot; são agendamentos de antes das formas de pagamento.
      </NotaDaSecao>
    </>
  )
}

// ============================================================
// Vendas de produtos: faturamento bruto, CMV e faturamento líquido
// (bruto − CMV), no total e por produto.
// ============================================================
function margem(liquidoComCusto: number, brutoComCusto: number): string {
  return brutoComCusto > 0 ? `${((liquidoComCusto / brutoComCusto) * 100).toFixed(1).replace('.', ',')}%` : '—'
}

function VendasDeProdutos({ v }: { v: VendasProdutos }) {
  const bruto = Number(v.bruto)
  const cmv = Number(v.cmv)
  const brutoComCusto = Number(v.bruto_com_custo)
  if (bruto === 0) return <SecaoVazia>Nenhum produto vendido em atendimentos concluídos neste período.</SecaoVazia>
  const semCusto = Number(v.itens_sem_custo)

  return (
    <>
      <MiniIndicadores
        itens={[
          { valor: moeda(bruto), rotulo: 'faturamento bruto' },
          { valor: moeda(cmv), rotulo: 'CMV (custo das mercadorias)', tom: 'perigo' },
          { valor: moeda(Number(v.liquido)), rotulo: 'faturamento líquido (bruto − CMV)', tom: 'sucesso' },
          { valor: margem(brutoComCusto - cmv, brutoComCusto), rotulo: 'margem' },
        ]}
      />
      {/* No celular a tabela do site vira um cartão por produto, com os valores em sequência. */}
      <View style={styles.tabela}>
        {v.produtos.map(p => (
          <View key={p.id_produto} style={styles.linha}>
            <Text style={[styles.celula, styles.celulaInteira, styles.forte]}>{p.produto}</Text>
            <Text style={styles.celula}>{rotuloEstoque(Number(p.quantidade), p.unidade_venda)}</Text>
            <Text style={styles.celula}>{moeda(Number(p.bruto))}</Text>
            <View>
              {Number(p.bruto_com_custo) > 0
                ? <Text style={styles.celula}>{moeda(Number(p.cmv))}</Text>
                : <Text style={[styles.celula, styles.semCusto]}>sem custo</Text>}
              {Number(p.sem_custo) > 0 && Number(p.bruto_com_custo) > 0 && <Text style={styles.celulaNota}>{p.sem_custo} sem custo</Text>}
            </View>
            <Text style={[styles.celula, styles.forte]}>{moeda(Number(p.liquido))}</Text>
            <Text style={styles.celula}>{margem(Number(p.bruto_com_custo) - Number(p.cmv), Number(p.bruto_com_custo))}</Text>
          </View>
        ))}
      </View>
      <NotaDaSecao>
        Mesma regra do faturamento: só entram atendimentos concluídos no período. O CMV usa o custo registrado no momento de cada venda.
        {semCusto > 0 && (
          <> <Text style={styles.negrito}>{moeda(Number(v.bruto_sem_custo))}</Text> em {plural(semCusto, 'venda')} sem custo registrado (feitas antes de cadastrar o custo): entram no bruto e no líquido sem descontar CMV, e ficam fora da margem. Cadastre o custo em Produtos para as próximas vendas.</>
        )}
      </NotaDaSecao>
    </>
  )
}

// ============================================================
// Planos: receita paga no período, cobranças pelo vencimento, os planos
// e os serviços mais usados pelos benefícios.
// ============================================================
function PlanosNoRelatorio({ r }: { r: RelatorioPlanos }) {
  const maiorUso = Math.max(1, ...r.servicos.map(s => Number(s.usos)))
  const receitaDosPlanos = r.planos.reduce((soma, p) => soma + Number(p.receita), 0)
  return (
    <>
      <MiniIndicadores
        itens={[
          { valor: moeda(Number(r.receita_periodo)), rotulo: 'receita de planos (pagamentos no período)', tom: 'sucesso' },
          { valor: Number(r.ativas), rotulo: `planos ativos · ${moeda(Number(r.receita_mensal))}/mês recorrente` },
          { valor: Number(r.pagas_qtd), rotulo: `cobranças pagas · ${moeda(Number(r.pagas_valor))}`, tom: 'sucesso' },
          { valor: Number(r.pendentes_qtd), rotulo: `pendentes · ${moeda(Number(r.pendentes_valor))}`, tom: 'alerta' },
          { valor: Number(r.vencidas_qtd), rotulo: `vencidas · ${moeda(Number(r.vencidas_valor))}`, tom: 'perigo' },
        ]}
      />
      <View style={styles.duasColunas}>
        <GrupoDaSecao titulo="Planos mais vendidos">
          <Ranking
            itens={r.planos.map(p => ({
              chave: p.plano,
              titulo: p.plano,
              valor: moeda(Number(p.receita)),
              detalhe: `${Number(p.ativas)} ativa${Number(p.ativas) !== 1 ? 's' : ''} · ${Number(p.novas)} nova${Number(p.novas) !== 1 ? 's' : ''} no período`,
              ...parteDe(Number(p.receita), receitaDosPlanos),
            }))}
          />
        </GrupoDaSecao>
        <GrupoDaSecao titulo="Serviços mais usados pelos planos">
          {r.servicos.length === 0 ? (
            <SecaoVazia>Nenhum benefício usado neste período.</SecaoVazia>
          ) : (
            <Ranking
              itens={r.servicos.map(s => ({
                chave: s.servico,
                titulo: s.servico,
                valor: plural(Number(s.usos), 'uso'),
                parte: Number(s.usos) / maiorUso,
              }))}
            />
          )}
        </GrupoDaSecao>
      </View>
      <NotaDaSecao>
        Pagas/pendentes/vencidas: cobranças com vencimento no período. Receita: cobranças marcadas como pagas no período. Serviço usado pelo plano não entra no faturamento dos atendimentos (a receita vem da cobrança do plano).
      </NotaDaSecao>
    </>
  )
}

// Medidas da página do site em 375 de largura.
const styles = StyleSheet.create({
  // Cartão do filtro de período (`.relatorio-filtros.card`).
  filtros: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 24 },
  // 16 do cartão + 36 das opções + 12 + 42 do botão + 6 de vão (mais a borda).
  calendario: { position: 'absolute', top: 113 },
  apagado: { opacity: 0.6 },
  duasColunas: { gap: 24 },
  filtrosDaTabela: { gap: 12 },
  // Tabela no celular: um cartão por linha, com as células em sequência.
  tabela: { gap: 12, marginBottom: 12 },
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
  celulaNota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  semCusto: { color: '#858d99' },
  forte: { fontWeight: '600' },
  negrito: { fontWeight: '700' },
  pagamento: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pagamentoTexto: { fontSize: 14, lineHeight: 20, color: '#1f2937' },
  semRegistro: { alignItems: 'center', gap: 19, paddingVertical: 24 },
  semRegistroTexto: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  paginacao: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 36 },
  paginacaoTexto: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  paginacaoBotoes: { flexDirection: 'row', gap: 8 },
})
