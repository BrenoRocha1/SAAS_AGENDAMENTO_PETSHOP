import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { hojeBrasilISO } from '@/lib/agenda'
import { obterContextoLojista } from '@/lib/lojista-context'
import KanbanBoard, { type KanbanItem } from '@/components/lojista/KanbanBoard'
import { IconAlert, IconKanban } from '@/components/icons'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Kanban de Agendamentos' }

interface Props {
  searchParams: Promise<{ data?: string }>
}

export default async function KanbanPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarAgenda) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Kanban de Agendamentos</h1>
        </div>
        <div className="empty-state card">
          <IconKanban style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para gerenciar a agenda</div>
          <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
        </div>
      </>
    )
  }

  const lojistaId = contexto.idLojista

  // Gate: só mostra o board se o lojista tiver o Kanban ativado (migration
  // 013). Se a coluna ainda não existir no banco, trata como "ativado por
  // padrão" (mesmo fallback do layout/sidebar) em vez de quebrar a página.
  const { data: lojistaRow, error: lojistaErro } = await supabase
    .from('lojista')
    .select('kanban_ativo')
    .eq('id_lojista', lojistaId)
    .single()

  const kanbanAtivo = lojistaErro ? true : (lojistaRow?.kanban_ativo ?? true)

  if (!kanbanAtivo) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Kanban de Agendamentos</h1>
        </div>
        <div className="empty-state card">
          <IconKanban style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">O Kanban está desativado</div>
          <p style={{ marginBottom: 'var(--space-4)' }}>
            Ative o Gestor de Agendamentos no Perfil da Loja pra usar essa tela.
          </p>
          <Link href="/lojista/perfil" className="btn btn-primary">Ir para Perfil da Loja</Link>
        </div>
      </>
    )
  }

  const hojeISO = hojeBrasilISO()
  const selectedDate = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO

  const [
    { data: agendaRaw, error: agendaErro },
    { data: funcionariosRaw },
    { data: servicosRaw },
  ] = await Promise.all([
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor, id_funcionario, id_servico, obs,
        pet:id_pet ( nome, raca, especie, porte, foto_url ),
        servico:id_servico ( nome ),
        cliente:id_cliente ( nome ),
        funcionario:id_funcionario ( nome )
      `)
      .eq('id_lojista', lojistaId)
      .eq('dt_agendamento', selectedDate)
      .neq('status', 'Cancelado')
      .order('hr_agendamento'),
    supabase
      .from('funcionario')
      .select('id_funcionario, nome')
      .eq('id_lojista', lojistaId)
      .eq('ativo', true)
      .order('created_at'),
    supabase
      .from('servico')
      .select('id_servico, nome')
      .eq('id_lojista', lojistaId)
      .eq('status', 'Ativo')
      .order('nome'),
  ])

  if (agendaErro) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Kanban de Agendamentos</h1>
        </div>
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar os agendamentos ({agendaErro.message}). Se a mensagem citar a
            coluna &quot;especie&quot; ou &quot;porte&quot;, é preciso rodar a migration
            010_precos_variacoes.sql.
          </span>
        </div>
      </>
    )
  }

  // Produtos comprados junto de algum agendamento do dia (migration 039).
  // Consulta separada de `produto` (sem embed) de propósito — mesmo
  // cuidado do cliente/agendamentos/page.tsx: relação nova, cache de
  // schema do PostgREST pode não ter atualizado logo após a migration.
  const idsDoDia = (agendaRaw ?? []).map(a => a.id_agendamento)
  const { data: itensProdutoRaw } = idsDoDia.length > 0
    ? await supabase
        .from('agendamento_produto')
        .select('id_agendamento, id_produto, quantidade, preco_unitario')
        .in('id_agendamento', idsDoDia)
    : { data: [] as { id_agendamento: string; id_produto: string; quantidade: number; preco_unitario: number }[] }

  const idsProdutos = [...new Set((itensProdutoRaw ?? []).map(i => i.id_produto))]
  const { data: produtosInfoRaw } = idsProdutos.length > 0
    ? await supabase.from('produto').select('id_produto, nome, unidade_venda').in('id_produto', idsProdutos)
    : { data: [] as { id_produto: string; nome: string; unidade_venda: string }[] }
  const infoPorProduto = new Map((produtosInfoRaw ?? []).map(p => [p.id_produto, p]))

  const produtosPorAgendamento: Record<string, { nome: string; unidade_venda: string; quantidade: number; preco_unitario: number }[]> = {}
  for (const item of itensProdutoRaw ?? []) {
    const info = infoPorProduto.get(item.id_produto)
    if (!info) continue
    ;(produtosPorAgendamento[item.id_agendamento] ??= []).push({
      nome: info.nome,
      unidade_venda: info.unidade_venda,
      quantidade: Number(item.quantidade),
      preco_unitario: Number(item.preco_unitario),
    })
  }

  const itens: KanbanItem[] = ((agendaRaw ?? []) as unknown as Array<{
    id_agendamento: string
    dt_agendamento: string
    hr_agendamento: string
    status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído'
    valor: number
    id_funcionario: string | null
    id_servico: string
    obs: string | null
    pet: { nome: string; raca: string; especie: 'Cão' | 'Gato' | null; porte: 'Pequeno' | 'Médio' | 'Grande' | null; foto_url: string | null } | null
    servico: { nome: string } | null
    cliente: { nome: string } | null
    funcionario: { nome: string } | null
  }>).map(a => ({
    id_agendamento: a.id_agendamento,
    dt_agendamento: a.dt_agendamento,
    hr_agendamento: a.hr_agendamento,
    status: a.status,
    valor: Number(a.valor),
    nome_pet: a.pet?.nome ?? 'Pet',
    raca_pet: a.pet?.raca ?? null,
    especie_pet: a.pet?.especie ?? null,
    porte_pet: a.pet?.porte ?? null,
    foto_pet: a.pet?.foto_url ?? null,
    nome_cliente: a.cliente?.nome ?? '—',
    nome_servico: a.servico?.nome ?? 'Serviço',
    id_servico: a.id_servico,
    id_funcionario: a.id_funcionario,
    nome_funcionario: a.funcionario?.nome ?? null,
    obs: a.obs,
    produtos: produtosPorAgendamento[a.id_agendamento] ?? [],
  }))

  return (
    <KanbanBoard
      selectedDate={selectedDate}
      hojeISO={hojeISO}
      itensIniciais={itens}
      funcionarios={(funcionariosRaw ?? []) as { id_funcionario: string; nome: string }[]}
      servicos={(servicosRaw ?? []) as { id_servico: string; nome: string }[]}
      podeAtribuirProfissional={contexto.acessoTotal}
    />
  )
}
