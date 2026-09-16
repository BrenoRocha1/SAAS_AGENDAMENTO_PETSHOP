import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { IconAlert, IconChevronLeft, IconUserBadge } from '@/components/icons'
import { calcularPeriodo, calcularPeriodoAnterior, type PeriodoPreset } from '@/lib/relatorios'
import PerfilFuncionarioClient, {
  type AgendamentoFuncionario,
  type FuncionarioInfo,
} from '@/components/lojista/PerfilFuncionarioClient'

export const metadata: Metadata = { title: 'Perfil do Funcionário — Lojista' }

const PRESETS_VALIDOS: PeriodoPreset[] = ['hoje', '7dias', '30dias', 'este-mes', 'mes-anterior', 'personalizado']
// Cobre com folga qualquer período (personalizado é limitado a 366 dias,
// ver calcularPeriodo) — um único funcionário não chega perto disso em
// volume real de agendamentos.
const LIMITE_LINHAS = 1000

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periodo?: string; ini?: string; fim?: string }>
}

interface AgendamentoRow {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Concluído' | 'Cancelado'
  valor: number
  id_pet: string
  pet: { nome: string } | null
  id_servico: string
  servico: { nome: string } | null
  id_cliente: string
  cliente: { nome: string } | null
}

export default async function PerfilFuncionarioPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const lojistaId = user!.id

  const preset: PeriodoPreset = PRESETS_VALIDOS.includes(sp.periodo as PeriodoPreset)
    ? (sp.periodo as PeriodoPreset)
    : '30dias'
  const periodo = calcularPeriodo(preset, sp.ini, sp.fim)
  const periodoAnterior = calcularPeriodoAnterior(periodo)

  // RLS ("funcionario: lojista ve seus funcionarios", migration 006) já
  // garante o isolamento entre lojas — o .eq('id_lojista', ...) explícito
  // é a segunda camada (defesa em profundidade), não a única.
  const [{ data: funcionarioRow }, { data: agendaRaw, error: agendaErro }] = await Promise.all([
    supabase
      .from('funcionario')
      .select('id_funcionario, nome, email, telefone, cargo, pode_gerenciar_agenda, pode_gerenciar_servicos, ativo, created_at')
      .eq('id_funcionario', id)
      .eq('id_lojista', lojistaId)
      .maybeSingle(),
    // Período atual + anterior numa única consulta (evita duas idas ao
    // banco) — depois separados em dois arrays em JS pelo intervalo de
    // data de cada um.
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor,
        id_pet, pet:id_pet ( nome ),
        id_servico, servico:id_servico ( nome ),
        id_cliente, cliente:id_cliente ( nome )
      `)
      .eq('id_funcionario', id)
      .eq('id_lojista', lojistaId)
      .gte('dt_agendamento', periodoAnterior.ini)
      .lte('dt_agendamento', periodo.fim)
      .order('dt_agendamento', { ascending: false })
      .order('hr_agendamento', { ascending: false })
      .limit(LIMITE_LINHAS)
      .returns<AgendamentoRow[]>(),
  ])

  if (!funcionarioRow) {
    return (
      <>
        <Link href="/lojista/funcionarios" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
          <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Funcionários
        </Link>
        <div className="empty-state card">
          <IconUserBadge style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Funcionário não encontrado</div>
          <p>Ele pode ter sido removido, ou não pertence ao seu petshop.</p>
        </div>
      </>
    )
  }

  const funcionario: FuncionarioInfo = funcionarioRow

  if (agendaErro) {
    return (
      <>
        <Link href="/lojista/funcionarios" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
          <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Funcionários
        </Link>
        <div className="page-header">
          <h1 className="page-title">{funcionario.nome}</h1>
        </div>
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar os atendimentos agora.{' '}
            {process.env.NODE_ENV !== 'production' && `[DEV: ${agendaErro.message}]`}
          </span>
        </div>
      </>
    )
  }

  const todos: AgendamentoFuncionario[] = ((agendaRaw ?? []) as AgendamentoRow[]).map(a => ({
    id_agendamento: a.id_agendamento,
    dt_agendamento: a.dt_agendamento,
    hr_agendamento: a.hr_agendamento,
    status: a.status,
    valor: Number(a.valor),
    id_pet: a.id_pet,
    nome_pet: a.pet?.nome ?? '—',
    id_servico: a.id_servico,
    nome_servico: a.servico?.nome ?? '—',
    id_cliente: a.id_cliente,
    nome_cliente: a.cliente?.nome ?? '—',
  }))

  const agendamentos = todos.filter(a => a.dt_agendamento >= periodo.ini && a.dt_agendamento <= periodo.fim)
  const agendamentosAnterior = todos.filter(a => a.dt_agendamento >= periodoAnterior.ini && a.dt_agendamento <= periodoAnterior.fim)

  return (
    <>
      <Link href="/lojista/funcionarios" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Funcionários
      </Link>

      <PerfilFuncionarioClient
        funcionario={funcionario}
        preset={preset}
        periodo={periodo}
        agendamentos={agendamentos}
        agendamentosAnterior={agendamentosAnterior}
      />
    </>
  )
}
