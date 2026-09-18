import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { obterContextoLojista } from '@/lib/lojista-context'
import { calcularPeriodo, type PeriodoPreset, type Periodo } from '@/lib/relatorios'
import { IconAlert, IconChevronLeft, IconStar } from '@/components/icons'
import AvaliacoesClient, { type LinhaAvaliacao, type ResumoAvaliacoes } from '@/components/lojista/AvaliacoesClient'

export const metadata: Metadata = { title: 'Avaliações — Configurações' }

const PAGE_SIZE = 20
const PRESETS_VALIDOS: PeriodoPreset[] = ['hoje', '7dias', '30dias', 'este-mes', 'mes-anterior', 'personalizado']

interface Props {
  searchParams: Promise<{
    periodo?: string
    ini?: string
    fim?: string
    nota?: string
    servico?: string
    funcionario?: string
    pagina?: string
  }>
}

export default async function AvaliacoesPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  // Configurações inteira já é só do responsável pela conta e de
  // administradores (middleware + sidebar); esta checagem repete a regra
  // aqui, e as funções SQL repetem de novo (auth_lojista_id()).
  if (!contexto.acessoTotal) {
    return (
      <div className="empty-state card">
        <IconStar style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Sem permissão para ver as avaliações</div>
        <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
      </div>
    )
  }

  const lojistaId = contexto.idLojista

  // Sem ?periodo= = todo o período (padrão). Com preset, reaproveita o
  // mesmo cálculo de datas dos Relatórios de Vendas.
  const preset = PRESETS_VALIDOS.includes(params.periodo as PeriodoPreset) ? (params.periodo as PeriodoPreset) : null
  const periodo: Periodo | null = preset ? calcularPeriodo(preset, params.ini, params.fim) : null
  const notaNum = Number(params.nota)
  const filtroNota = Number.isInteger(notaNum) && notaNum >= 1 && notaNum <= 5 ? notaNum : null
  const filtroServico = params.servico ?? ''
  const filtroFuncionario = params.funcionario ?? ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)

  const filtrosRpc = {
    p_id_lojista: lojistaId,
    p_data_ini: periodo?.ini ?? null,
    p_data_fim: periodo?.fim ?? null,
    p_nota: filtroNota,
    p_id_servico: filtroServico || null,
    p_id_funcionario: filtroFuncionario || null,
  }

  const [resumoRes, listaRes, { data: servicosRaw }, { data: funcionariosRaw }] = await Promise.all([
    supabase.rpc('fn_avaliacoes_resumo_lojista', filtrosRpc),
    supabase.rpc('fn_avaliacoes_lojista', { ...filtrosRpc, p_limit: PAGE_SIZE, p_offset: (pagina - 1) * PAGE_SIZE }),
    supabase.from('servico').select('id_servico, nome').eq('id_lojista', lojistaId).order('nome'),
    supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', lojistaId).order('nome'),
  ])

  const erro = resumoRes.error ?? listaRes.error
  if (erro) {
    return (
      <>
        <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
          <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
        </Link>
        <div className="page-header">
          <h1 className="page-title">Avaliações</h1>
          <p className="page-subtitle">Avaliações dos clientes da sua loja.</p>
        </div>
        <div className="alert alert-error" style={{ alignItems: 'center' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Não foi possível carregar as avaliações agora.{' '}
            {process.env.NODE_ENV !== 'production' && `[DEV: ${erro.message}] Execute a migration 034_avaliacoes.sql se ainda não rodou.`}
          </span>
          <Link href="/lojista/configuracoes/avaliacoes" className="btn btn-secondary btn-sm">Tentar novamente</Link>
        </div>
      </>
    )
  }

  // NUMERIC do Postgres pode chegar como string via PostgREST — normaliza.
  const bruto = resumoRes.data as {
    geral: { media: number | string | null; total: number }
    periodo: { media: number | string | null; total: number; nota_5: number; nota_4: number; nota_3: number; nota_2: number; nota_1: number }
  }
  const resumo: ResumoAvaliacoes = {
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
  }

  const linhas = (listaRes.data ?? []) as Array<LinhaAvaliacao & { total_count: number | string }>
  const totalLista = linhas.length > 0 ? Number(linhas[0].total_count) : 0

  return (
    <AvaliacoesClient
      resumo={resumo}
      avaliacoes={linhas}
      totalLista={totalLista}
      pagina={pagina}
      pageSize={PAGE_SIZE}
      preset={preset}
      periodo={periodo}
      filtroNota={filtroNota}
      filtroServico={filtroServico}
      filtroFuncionario={filtroFuncionario}
      servicos={(servicosRaw ?? []) as { id_servico: string; nome: string }[]}
      funcionarios={(funcionariosRaw ?? []) as { id_funcionario: string; nome: string }[]}
    />
  )
}
