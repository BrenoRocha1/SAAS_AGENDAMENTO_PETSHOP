import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { IconAlert } from '@/components/icons'
import RelatorioVendasClient, {
  type ResumoPeriodo,
  type VendaPorDia,
  type VendaPorServico,
  type VendaPorProfissional,
  type VendaPorCliente,
  type ClientesResumo,
  type LinhaDetalhamento,
  type VendaPorPagamento,
} from '@/components/lojista/RelatorioVendasClient'
import { carregarPagamentos } from '@/lib/pagamento-servidor'
import {
  calcularPeriodo,
  calcularPeriodoAnterior,
  type PeriodoPreset,
} from '@/lib/relatorios'

export const metadata: Metadata = { title: 'Relatórios de Vendas — Lojista' }

const PAGE_SIZE = 20
const PRESETS_VALIDOS: PeriodoPreset[] = ['hoje', '7dias', '30dias', 'este-mes', 'mes-anterior', 'personalizado']
const STATUS_VALIDOS = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado'] as const

interface Props {
  searchParams: Promise<{
    periodo?: string
    ini?: string
    fim?: string
    funcionario?: string
    servico?: string
    status?: string
    ordenar?: string
    pagina?: string
  }>
}

export default async function RelatoriosVendasPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const lojistaId = user!.id

  const preset: PeriodoPreset = PRESETS_VALIDOS.includes(params.periodo as PeriodoPreset)
    ? (params.periodo as PeriodoPreset)
    : '30dias'
  const periodo = calcularPeriodo(preset, params.ini, params.fim)
  const periodoAnterior = calcularPeriodoAnterior(periodo)

  const filtroFuncionario = params.funcionario ?? ''
  const filtroServico = params.servico ?? ''
  const filtroStatus = STATUS_VALIDOS.includes(params.status as typeof STATUS_VALIDOS[number])
    ? (params.status as typeof STATUS_VALIDOS[number])
    : ''
  const ordenar = params.ordenar === 'data_asc' || params.ordenar === 'valor_desc' || params.ordenar === 'valor_asc'
    ? params.ordenar
    : 'data_desc'
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)

  // Query base do detalhamento — reaproveitada pra contar e pra paginar
  // (mesmos filtros nas duas), assim o total bate exatamente com as linhas.
  function baseDetalhamento() {
    let q = supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, valor, status,
        pet:id_pet ( nome ),
        servico:id_servico ( nome ),
        cliente:id_cliente ( nome ),
        funcionario:id_funcionario ( nome )
      `, { count: 'exact' })
      .eq('id_lojista', lojistaId)
      .gte('dt_agendamento', periodo.ini)
      .lte('dt_agendamento', periodo.fim)
    if (filtroFuncionario) q = q.eq('id_funcionario', filtroFuncionario)
    if (filtroServico) q = q.eq('id_servico', filtroServico)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    return q
  }

  const ORDENACOES: Record<string, { coluna: 'dt_agendamento' | 'valor'; ascendente: boolean }> = {
    data_desc: { coluna: 'dt_agendamento', ascendente: false },
    data_asc: { coluna: 'dt_agendamento', ascendente: true },
    valor_desc: { coluna: 'valor', ascendente: false },
    valor_asc: { coluna: 'valor', ascendente: true },
  }
  const { coluna, ascendente } = ORDENACOES[ordenar]

  // Todas as consultas abaixo são independentes — disparadas juntas numa
  // única leva (mesmo padrão do dashboard) em vez de uma atrás da outra.
  const [
    resumoRes,
    resumoAnteriorRes,
    porDiaRes,
    porServicoRes,
    porProfissionalRes,
    porClienteRes,
    clientesResumoRes,
    porPagamentoRes,
    { data: funcionariosRaw },
    { data: servicosRaw },
    detalhamentoRes,
  ] = await Promise.all([
    supabase.rpc('fn_relatorio_vendas_resumo', { p_id_lojista: lojistaId, p_data_ini: periodo.ini, p_data_fim: periodo.fim }),
    supabase.rpc('fn_relatorio_vendas_resumo', { p_id_lojista: lojistaId, p_data_ini: periodoAnterior.ini, p_data_fim: periodoAnterior.fim }),
    supabase.rpc('fn_relatorio_vendas_por_dia', { p_id_lojista: lojistaId, p_data_ini: periodo.ini, p_data_fim: periodo.fim }),
    supabase.rpc('fn_relatorio_vendas_por_servico', { p_id_lojista: lojistaId, p_data_ini: periodo.ini, p_data_fim: periodo.fim }),
    supabase.rpc('fn_relatorio_vendas_por_profissional', { p_id_lojista: lojistaId, p_data_ini: periodo.ini, p_data_fim: periodo.fim }),
    supabase.rpc('fn_relatorio_vendas_por_cliente', { p_id_lojista: lojistaId, p_data_ini: periodo.ini, p_data_fim: periodo.fim, p_limite: 10 }),
    supabase.rpc('fn_relatorio_clientes_resumo', { p_id_lojista: lojistaId, p_data_ini: periodo.ini, p_data_fim: periodo.fim }),
    supabase.rpc('fn_relatorio_vendas_por_pagamento', { p_id_lojista: lojistaId, p_data_ini: periodo.ini, p_data_fim: periodo.fim }),
    supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', lojistaId).eq('ativo', true).order('nome'),
    supabase.from('servico').select('id_servico, nome').eq('id_lojista', lojistaId).order('nome'),
    baseDetalhamento()
      .order(coluna, { ascending: ascendente })
      .range((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE - 1),
  ])

  // fn_relatorio_vendas_resumo é a base de tudo (cards principais) — se
  // ela falhar (ex.: migration 016 ainda não rodou no banco), a página
  // inteira perde sentido. Em vez de derrubar o app inteiro com um erro
  // não tratado, mostra um estado de erro amigável com retry.
  if (resumoRes.error) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Relatórios de Vendas</h1>
          <p className="page-subtitle">Desempenho comercial do seu petshop</p>
        </div>
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar os relatórios agora.{' '}
            {process.env.NODE_ENV !== 'production' && `[DEV: ${resumoRes.error.message}]`}
            {' '}Execute a migration 016_relatorio_vendas.sql se ainda não rodou, e tente novamente.
          </span>
        </div>
      </>
    )
  }

  const resumo = resumoRes.data as ResumoPeriodo
  const resumoAnterior = (resumoAnteriorRes.data ?? null) as ResumoPeriodo | null
  const porDia = (porDiaRes.data ?? []) as VendaPorDia[]
  const porServico = (porServicoRes.data ?? []) as VendaPorServico[]
  const porProfissional = (porProfissionalRes.data ?? []) as VendaPorProfissional[]
  const porCliente = (porClienteRes.data ?? []) as VendaPorCliente[]
  const clientesResumo = (clientesResumoRes.data ?? null) as ClientesResumo | null
  // Sem a migration 057 a função não existe: a seção avisa.
  const porPagamento: VendaPorPagamento[] | null = porPagamentoRes.error
    ? null
    : ((porPagamentoRes.data ?? []) as Array<{ forma: string; pedidos: number | string; total: number | string; recebido: number | string; pendente: number | string }>).map(l => ({
        forma: l.forma,
        pedidos: Number(l.pedidos),
        total: Number(l.total),
        recebido: Number(l.recebido),
        pendente: Number(l.pendente),
      }))
  const funcionarios = (funcionariosRaw ?? []) as { id_funcionario: string; nome: string }[]
  const servicos = (servicosRaw ?? []) as { id_servico: string; nome: string }[]

  const detalhamento: LinhaDetalhamento[] = ((detalhamentoRes.data ?? []) as unknown as Array<{
    id_agendamento: string
    dt_agendamento: string
    hr_agendamento: string
    valor: number
    status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
    pet: { nome: string } | null
    servico: { nome: string } | null
    cliente: { nome: string } | null
    funcionario: { nome: string } | null
  }>).map(row => ({
    id_agendamento: row.id_agendamento,
    dt_agendamento: row.dt_agendamento,
    hr_agendamento: row.hr_agendamento,
    valor: Number(row.valor),
    status: row.status,
    nome_pet: row.pet?.nome ?? '—',
    nome_servico: row.servico?.nome ?? '—',
    nome_cliente: row.cliente?.nome ?? '—',
    nome_funcionario: row.funcionario?.nome ?? null,
    forma_pagamento: null,
    status_pagamento: null,
  }))
  const totalDetalhamento = detalhamentoRes.count ?? 0
  // Forma e status do pagamento das linhas da página (tolerante).
  const pagamentos = await carregarPagamentos(supabase, lojistaId, detalhamento.map(d => d.id_agendamento))
  for (const d of detalhamento) {
    d.forma_pagamento = pagamentos.porAgendamento.get(d.id_agendamento)?.forma ?? null
    d.status_pagamento = pagamentos.porAgendamento.get(d.id_agendamento)?.status ?? null
  }

  return (
    <RelatorioVendasClient
      preset={preset}
      periodo={periodo}
      resumo={resumo}
      resumoAnterior={resumoAnterior}
      porDia={porDia}
      porServico={porServico}
      porProfissional={porProfissional}
      porCliente={porCliente}
      clientesResumo={clientesResumo}
      porPagamento={porPagamento}
      funcionarios={funcionarios}
      servicos={servicos}
      filtroFuncionario={filtroFuncionario}
      filtroServico={filtroServico}
      filtroStatus={filtroStatus}
      ordenar={ordenar}
      pagina={pagina}
      pageSize={PAGE_SIZE}
      totalDetalhamento={totalDetalhamento}
      detalhamento={detalhamento}
    />
  )
}
