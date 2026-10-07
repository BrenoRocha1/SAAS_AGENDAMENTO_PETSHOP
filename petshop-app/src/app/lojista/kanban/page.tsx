import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import type { Metadata } from 'next'
import { hojeBrasilISO } from '@/lib/agenda'
import { obterContextoLojista } from '@/lib/lojista-context'
import KanbanBoard, { type KanbanItem } from '@/components/lojista/KanbanBoard'
import type { ClienteComPets, ServicoAtivo } from '@/components/lojista/DashboardClient'
import TaxiDogConteudo from '@/components/lojista/TaxiDogConteudo'
import { carregarTransportePorVisita } from '@/lib/taxidog-visita'
import { carregarPagamentos } from '@/lib/pagamento-servidor'
import { idsAlteradosPeloCliente } from '@/lib/alteracoes-servidor'
import { IconAlert, IconCar, IconChartBar, IconKanban, IconRoute } from '@/components/icons'
import Link from 'next/link'
import Ilustracao from '@/components/Ilustracao'

export const metadata: Metadata = { title: 'Gestor de Agendamentos' }

interface Props {
  // visao=taxidog: o Kanban das corridas do TaxiDog, no lugar do de
  // agendamentos ("Visualizar TaxiDog").
  searchParams: Promise<{ data?: string; visao?: string }>
}

export default async function KanbanPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarAgenda) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Gestor de Agendamentos</h1>
        </div>
        <div className="empty-state card">
          <Ilustracao nome="sem-permissao" />
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
  const hojeISO = hojeBrasilISO()
  const selectedDate = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO
  const visaoTaxiDog = params.visao === 'taxidog'

  // Os dados do board já saem agora, junto com as configurações abaixo
  // (antes esperavam por elas). Só são lidos mais embaixo.
  const dadosDoBoard = Promise.all([
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor, id_funcionario, id_servico, obs, id_pet, id_cliente,
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
    // Com preço e duração: além do filtro do board, alimenta o modal de
    // "Novo agendamento".
    supabase
      .from('servico')
      .select('id_servico, nome, preco, duracao')
      .eq('id_lojista', lojistaId)
      .eq('status', 'Ativo')
      .order('nome'),
    // Clientes e pets da loja, pro modal de "Novo agendamento" — as mesmas
    // consultas do Dashboard e da Agenda (todo cliente vinculado à loja,
    // migration 014; os pets já vêm filtrados pelo RLS, migration 015).
    supabase
      .from('cliente_lojista')
      .select('cliente:id_cliente ( id_cliente, nome, telefone )')
      .eq('id_lojista', lojistaId),
    supabase
      .from('pet')
      .select('id_pet, id_cliente, nome, raca')
      .eq('ativo', true),
  ])

  // (junto com a config do TaxiDog, usada logo abaixo — antes, em fila)
  const [{ data: lojistaRow, error: lojistaErro }, { data: taxidogCfg, error: taxidogCfgErro }] = await Promise.all([
    supabase.from('lojista').select('kanban_ativo').eq('id_lojista', lojistaId).single(),
    supabase.from('taxidog_config').select('ativo').eq('id_lojista', lojistaId).maybeSingle(),
  ])

  const kanbanAtivo = lojistaErro ? true : (lojistaRow?.kanban_ativo ?? true)

  if (!kanbanAtivo) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Gestor de Agendamentos</h1>
        </div>
        <div className="empty-state card">
          <IconKanban style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">O Gestor de Agendamentos está desativado</div>
          <p style={{ marginBottom: 'var(--space-4)' }}>
            Ative o Gestor de Agendamentos nas Configurações de Agendamentos pra usar essa tela.
          </p>
          {/* A chave saiu do Perfil da Loja; quem não é dono/administrador não chega lá. */}
          {contexto.acessoTotal && (
            <Link href="/lojista/configuracoes/agendamentos" className="btn btn-primary">Ir para Configurações de Agendamentos</Link>
          )}
        </div>
      </>
    )
  }

  // O botão "Visualizar TaxiDog" só aparece com o TaxiDog ativado (e sem a
  // migration 042 a tabela nem existe — aí some também).
  const mostraTaxiDog = visaoTaxiDog || (!taxidogCfgErro && !!taxidogCfg?.ativo)

  const cabecalho = (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      {/* No celular o título já está na barra do topo: sem este bloco (vazio),
          os botões não descem uma linha. */}
      <div className="so-desktop">
        <h1 className="page-title">{visaoTaxiDog ? 'Gestor de Agendamentos · TaxiDog' : 'Gestor de Agendamentos'}</h1>
        <p className="page-subtitle">
          {visaoTaxiDog ? 'Corridas de busca e entrega dos pets' : 'Acompanhe o atendimento em tempo real'}
        </p>
      </div>
      {mostraTaxiDog && (
        // No celular (.gestor-acoes): a troca de visão em cima, na largura
        // toda, e os dois atalhos do TaxiDog lado a lado embaixo dela.
        <div className="flex gap-2 gestor-acoes" style={{ flexWrap: 'wrap' }}>
          {visaoTaxiDog && (
            <>
              <Link href="/lojista/taxidog/relatorio" className="btn btn-ghost btn-sm">
                <IconChartBar style={{ width: 14, height: 14 }} /> Relatório<span className="so-desktop">&nbsp;de corridas</span>
              </Link>
              <Link href={`/lojista/taxidog/rotas?data=${selectedDate}`} className="btn btn-secondary btn-sm">
                <IconRoute style={{ width: 14, height: 14 }} /> Rotas<span className="so-desktop">&nbsp;do TaxiDog</span>
              </Link>
            </>
          )}
          <Link
            href={visaoTaxiDog ? `/lojista/kanban?data=${selectedDate}` : `/lojista/kanban?visao=taxidog&data=${selectedDate}`}
            className="btn btn-secondary btn-sm gestor-troca-visao"
          >
            {visaoTaxiDog
              ? <><IconKanban style={{ width: 14, height: 14 }} /> Visualizar agendamentos</>
              : <><IconCar style={{ width: 14, height: 14 }} /> Visualizar TaxiDog</>}
          </Link>
        </div>
      )}
    </div>
  )

  if (visaoTaxiDog) {
    return (
      <>
        {cabecalho}
        <TaxiDogConteudo contexto={contexto} data={selectedDate} hojeISO={hojeISO} caminho="/lojista/kanban?visao=taxidog" />
      </>
    )
  }

  const [
    { data: agendaRaw, error: agendaErro },
    { data: funcionariosRaw },
    { data: servicosRaw },
    { data: vinculos },
    { data: petsVisiveis },
  ] = await dadosDoBoard

  if (agendaErro) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Gestor de Agendamentos</h1>
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

  // Produtos do dia: itens e depois os nomes (dependem um do outro).
  async function carregarProdutos() {
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
    return { itensProdutoRaw, produtosInfoRaw }
  }

  // Tudo o que depende só dos agendamentos do dia sai junto (antes, uma
  // consulta esperava a outra). Todas tolerantes a migration pendente.
  const [{ itensProdutoRaw, produtosInfoRaw }, transporteDe, pagamentos, alteradosPeloCliente] = await Promise.all([
    carregarProdutos(),
    // TaxiDog de cada visita (mesmo pet, mesmo dia).
    carregarTransportePorVisita(
      supabase,
      ((agendaRaw ?? []) as unknown as { id_agendamento: string; id_pet: string; dt_agendamento: string }[]),
    ),
    // Forma e status do pagamento (migration 057).
    carregarPagamentos(supabase, lojistaId, idsDoDia),
    // Pedido mexido pelo cliente (serviço, pet ou data — migrations 070/071).
    idsAlteradosPeloCliente(
      supabase,
      ((agendaRaw ?? []) as unknown as { id_agendamento: string; id_cliente: string | null }[]),
    ),
  ])

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
    id_pet: string
    id_cliente: string | null
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
    id_cliente: a.id_cliente,
    nome_cliente: a.cliente?.nome ?? '—',
    nome_servico: a.servico?.nome ?? 'Serviço',
    id_servico: a.id_servico,
    id_funcionario: a.id_funcionario,
    nome_funcionario: a.funcionario?.nome ?? null,
    obs: a.obs,
    produtos: produtosPorAgendamento[a.id_agendamento] ?? [],
    taxidog: transporteDe(a),
    forma_pagamento: pagamentos.porAgendamento.get(a.id_agendamento)?.forma ?? null,
    status_pagamento: pagamentos.porAgendamento.get(a.id_agendamento)?.status ?? null,
    alterado_cliente: alteradosPeloCliente.has(a.id_agendamento),
  }))

  const clientesMap = new Map<string, ClienteComPets>()
  for (const v of (vinculos ?? []) as unknown as Array<{ cliente: { id_cliente: string; nome: string; telefone: string } | null }>) {
    if (v.cliente && !clientesMap.has(v.cliente.id_cliente)) clientesMap.set(v.cliente.id_cliente, { ...v.cliente, pets: [] })
  }
  for (const p of (petsVisiveis ?? []) as unknown as Array<{ id_pet: string; id_cliente: string; nome: string; raca: string }>) {
    clientesMap.get(p.id_cliente)?.pets.push({ id_pet: p.id_pet, nome: p.nome, raca: p.raca })
  }
  const clientesComPets = Array.from(clientesMap.values()).sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <>
      {cabecalho}
      <KanbanBoard
        lojistaId={lojistaId}
        selectedDate={selectedDate}
        hojeISO={hojeISO}
        itensIniciais={itens}
        clientes={clientesComPets}
        funcionarios={(funcionariosRaw ?? []) as { id_funcionario: string; nome: string }[]}
        servicos={(servicosRaw ?? []) as ServicoAtivo[]}
        podeAtribuirProfissional={contexto.acessoTotal}
        taxidogAtivo={!taxidogCfgErro && !!taxidogCfg?.ativo}
        formasPagamento={pagamentos.formasAceitas}
      />
    </>
  )
}
