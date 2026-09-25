import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { agoraBrasil } from '@/lib/agenda'
import { formatarTelefone, formatarCpf } from '@/lib/format'
import { obterContextoLojista } from '@/lib/lojista-context'
import { classeBadgeStatus, ehEtapaAtiva, rotuloStatus } from '@/lib/status-agendamento'
import {
  IconCalendar,
  IconChevronLeft,
  IconClock,
  IconDog,
  IconMoney,
  IconPencil,
  IconPlus,
  IconScissors,
  IconStar,
  IconUsers,
  IconWhatsapp,
} from '@/components/icons'
import { Estrelas, formatarMedia } from '@/components/cliente/Estrelas'
import PlanosDoCliente from '@/components/lojista/planos/PlanosDoCliente'
import { formasAtivas, normalizarFormasLoja } from '@/lib/pagamento'
import type { Assinatura, Plano } from '@/lib/planos'

export const metadata: Metadata = { title: 'Perfil do Cliente — Lojista' }

interface Props {
  params: Promise<{ id: string }>
}

interface AgendamentoRow {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  valor: number
  id_pet: string
  pet: { nome: string } | null
  id_servico: string
  servico: { nome: string } | null
  funcionario: { nome: string } | null
}

interface AvaliacaoRow {
  id_avaliacao: string
  nota: number
  comentario: string | null
  created_at: string
  pet: { nome: string } | null
  servico: { nome: string } | null
  funcionario: { nome: string } | null
}

function moeda(v: number) {
  return `R$ ${v.toFixed(2)}`
}

export default async function PerfilClientePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null
  if (!contexto.podeGerenciarClientesPets) {
    return (
      <div className="empty-state card">
        <div className="empty-state-title">Sem permissão para ver clientes</div>
        <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
      </div>
    )
  }
  const podeEditar = contexto.role === 'lojista' || contexto.acessoTotal
  const lojistaId = contexto.idLojista

  // RLS ("cliente: lojista ve vinculados", migration 014) já garante que
  // só vem resultado se este cliente pertencer ao seu petshop.
  const [{ data: cliente }, { data: petsRaw }, { data: agendaRaw }, { data: avaliacoesRaw }] = await Promise.all([
    supabase
      .from('cliente')
      .select('id_cliente, nome, telefone, email, cpf, created_at, updated_at')
      .eq('id_cliente', id)
      .maybeSingle(),
    supabase
      .from('pet')
      .select('id_pet, nome, especie, porte, raca')
      .eq('id_cliente', id)
      .eq('ativo', true)
      .order('nome'),
    // TODO histórico deste cliente NESTE petshop, de uma vez só — é um
    // conjunto naturalmente pequeno (a vida inteira de agendamentos de UM
    // cliente, não da loja inteira), então resumo financeiro, ranking de
    // serviços, estatística por pet e "próximo/último atendimento" saem
    // todos daqui, calculados em JS, sem nenhuma outra consulta.
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor,
        id_pet, pet:id_pet ( nome ),
        id_servico, servico:id_servico ( nome ),
        funcionario:id_funcionario ( nome )
      `)
      .eq('id_cliente', id)
      .eq('id_lojista', lojistaId)
      .order('dt_agendamento', { ascending: false })
      .order('hr_agendamento', { ascending: false })
      .limit(200)
      .returns<AgendamentoRow[]>(),
    // Avaliações que ESTE cliente deixou pra ESTA loja (migration 034).
    // RLS ("avaliacao: lojista/funcionario ve da loja") já isola por loja;
    // o .eq('id_lojista') é a segunda camada. Mesmo raciocínio do
    // histórico acima: conjunto pequeno (um cliente só), então total e
    // média saem daqui em JS, sem outra consulta.
    supabase
      .from('avaliacao')
      .select(`
        id_avaliacao, nota, comentario, created_at,
        pet:id_pet ( nome ),
        servico:id_servico ( nome ),
        funcionario:id_funcionario ( nome )
      `)
      .eq('id_cliente', id)
      .eq('id_lojista', lojistaId)
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<AvaliacaoRow[]>(),
  ])

  // Planos e assinaturas (migration 060) — financeiro: só dono/administrador.
  // Tolerante: sem a migration, a seção simplesmente não aparece.
  let planosCliente: { assinaturas: Assinatura[]; planos: Plano[]; formas: ReturnType<typeof formasAtivas> } | null = null
  if (cliente && podeEditar) {
    const [assRes, planosRes, formasRes] = await Promise.all([
      supabase.rpc('fn_assinaturas_da_loja', { p_id_cliente: id, p_detalhes: true }),
      supabase.rpc('fn_planos_da_loja'),
      supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: lojistaId }),
    ])
    if (!assRes.error && !planosRes.error) {
      planosCliente = {
        assinaturas: (assRes.data ?? []) as Assinatura[],
        planos: (planosRes.data ?? []) as Plano[],
        formas: formasAtivas(normalizarFormasLoja(formasRes.data)),
      }
    }
  }

  if (!cliente) {
    return (
      <>
        <Link href="/lojista/clientes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
          <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Clientes
        </Link>
        <div className="empty-state card">
          <IconUsers style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Cliente não encontrado</div>
          <p>Ele pode não existir, ou não estar vinculado ao seu petshop.</p>
        </div>
      </>
    )
  }

  const pets = petsRaw ?? []
  const agendamentos = agendaRaw ?? []
  const hojeISO = format(agoraBrasil(), 'yyyy-MM-dd')

  // ── Resumo financeiro — mesma definição do Relatório de Vendas:
  // venda/faturamento = status 'Concluído'; pendente = 'Pendente' +
  // 'Confirmado'. Não é um cálculo novo, é a mesma regra reaplicada aqui.
  const concluidos = agendamentos.filter(a => a.status === 'Concluído')
  const naoCancelados = agendamentos.filter(a => a.status !== 'Cancelado')
  const totalGasto = concluidos.reduce((acc, a) => acc + Number(a.valor), 0)
  const totalPendente = agendamentos
    .filter(a => ehEtapaAtiva(a.status))
    .reduce((acc, a) => acc + Number(a.valor), 0)
  const qtdVendas = concluidos.length
  const ticketMedio = qtdVendas > 0 ? totalGasto / qtdVendas : 0
  const maiorValor = qtdVendas > 0 ? Math.max(...concluidos.map(a => Number(a.valor))) : null
  const qtdCancelados = agendamentos.filter(a => a.status === 'Cancelado').length

  // Só até hoje: um agendamento de data futura marcado como concluído
  // (dado antigo, de antes da trava) não é "último atendimento".
  const conclidosOrdAsc = concluidos
    .filter(a => a.dt_agendamento <= hojeISO)
    .sort((a, b) => (a.dt_agendamento + a.hr_agendamento).localeCompare(b.dt_agendamento + b.hr_agendamento))
  const dataPrimeiroAtendimento = conclidosOrdAsc[0]?.dt_agendamento ?? null
  const ultimoAtendimento = conclidosOrdAsc[conclidosOrdAsc.length - 1] ?? null
  // Dias com atendimento: vários serviços no mesmo dia são uma visita só.
  const diasComAtendimento = new Set(conclidosOrdAsc.map(a => a.dt_agendamento)).size
  const diasDesdeUltimo = ultimoAtendimento
    ? differenceInCalendarDays(agoraBrasil(), parseISO(ultimoAtendimento.dt_agendamento))
    : null
  // Frequência precisa de pelo menos 2 visitas concluídas pra existir um
  // intervalo real entre elas — com 0 ou 1, não tem o que medir, e por
  // isso a métrica simplesmente não aparece (não vira uma aproximação
  // inventada, tipo "assumir 30 dias").
  const frequenciaMediaDias = diasComAtendimento >= 2 && dataPrimeiroAtendimento && ultimoAtendimento
    ? Math.max(1, Math.round(differenceInCalendarDays(parseISO(ultimoAtendimento.dt_agendamento), parseISO(dataPrimeiroAtendimento)) / (diasComAtendimento - 1)))
    : null

  const proximoAgendamento = agendamentos
    .filter(a => ehEtapaAtiva(a.status) && a.dt_agendamento >= hojeISO)
    .sort((a, b) => (a.dt_agendamento + a.hr_agendamento).localeCompare(b.dt_agendamento + b.hr_agendamento))[0] ?? null

  // ── Serviços mais utilizados — agrupado a partir do mesmo histórico já
  // carregado (só atendimentos concluídos), sem consulta nova.
  const servicoMap = new Map<string, { nome: string; qtd: number; valor: number }>()
  for (const a of concluidos) {
    const chave = a.id_servico
    const atual = servicoMap.get(chave) ?? { nome: a.servico?.nome ?? 'Serviço', qtd: 0, valor: 0 }
    atual.qtd += 1
    atual.valor += Number(a.valor)
    servicoMap.set(chave, atual)
  }
  const servicosMaisUtilizados = Array.from(servicoMap.values()).sort((a, b) => b.qtd - a.qtd)

  // ── Pets do cliente + estatística por pet — mesma ideia: derivado do
  // histórico já carregado, sem N+1 (uma consulta por pet).
  const petsComStats = pets.map(pet => {
    const doPet = naoCancelados.filter(a => a.id_pet === pet.id_pet)
    const concluidosDoPet = doPet.filter(a => a.status === 'Concluído' && a.dt_agendamento <= hojeISO)
      .sort((a, b) => (b.dt_agendamento + b.hr_agendamento).localeCompare(a.dt_agendamento + a.hr_agendamento))
    const proximoDoPet = doPet
      .filter(a => ehEtapaAtiva(a.status) && a.dt_agendamento >= hojeISO)
      .sort((a, b) => (a.dt_agendamento + a.hr_agendamento).localeCompare(b.dt_agendamento + b.hr_agendamento))[0] ?? null
    return {
      ...pet,
      qtdAgendamentos: doPet.length,
      ultimoAtendimento: concluidosDoPet[0] ?? null,
      proximoAtendimento: proximoDoPet,
    }
  })
  const petMaisAtendido = petsComStats.length > 0
    ? petsComStats.reduce((mais, p) => (p.qtdAgendamentos > mais.qtdAgendamentos ? p : mais), petsComStats[0])
    : null

  // ── Linha do tempo — versão compacta dos mesmos agendamentos (eventos
  // reais, mesma fonte da tabela abaixo), só que resumida e mais recente
  // primeiro, pra dar uma visão rápida sem abrir a tabela inteira.
  const timeline = agendamentos.slice(0, 8)

  // ── Avaliações DADAS por este cliente — a média aqui é das notas que
  // ELE deu, não a média da loja (essa fica em Configurações → Avaliações).
  const avaliacoesCliente = avaliacoesRaw ?? []
  const mediaNotasCliente = avaliacoesCliente.length > 0
    ? avaliacoesCliente.reduce((acc, a) => acc + a.nota, 0) / avaliacoesCliente.length
    : null

  return (
    <>
      <Link href="/lojista/clientes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Clientes
      </Link>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">{cliente.nome}</h1>
          <p className="page-subtitle">
            {formatarTelefone(cliente.telefone)} · {cliente.email}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <a
            href={`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            title="Chamar no WhatsApp"
          >
            <IconWhatsapp style={{ width: 14, height: 14 }} /> WhatsApp
          </a>
          {podeEditar && (
            <>
              <Link href={`/lojista/pets?novoPetTutor=${cliente.id_cliente}`} className="btn btn-secondary btn-sm">
                <IconPlus style={{ width: 14, height: 14 }} /> Adicionar Pet
              </Link>
              <Link href={`/lojista/agendamentos?novoAgendamentoTutor=${cliente.id_cliente}`} className="btn btn-secondary btn-sm">
                <IconCalendar style={{ width: 14, height: 14 }} /> Novo Agendamento
              </Link>
              <Link href={`/lojista/clientes?editar=${cliente.id_cliente}`} className="btn btn-primary btn-sm">
                <IconPencil style={{ width: 14, height: 14 }} /> Editar
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── Resumo ── */}
      <div className="grid-4" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-card-icon tone-warning">
            <IconMoney style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{moeda(totalGasto)}</div>
          <div className="stat-card-label">Total gasto</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon tone-info">
            <IconMoney style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{moeda(ticketMedio)}</div>
          <div className="stat-card-label">Ticket médio</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon tone-primary">
            <IconCalendar style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{naoCancelados.length}</div>
          <div className="stat-card-label">Agendamentos ({qtdVendas} concluídos)</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon tone-success">
            <IconDog style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{pets.length}</div>
          <div className="stat-card-label">Pets</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        {/* ── Último / próximo agendamento ── */}
        <div className="card">
          <h3 className="relatorio-secao-titulo">
            <IconClock style={{ width: 15, height: 15 }} /> Último atendimento
          </h3>
          {ultimoAtendimento ? (
            <>
              <div className="dash-detail-row"><span>Data</span><span>{format(parseISO(ultimoAtendimento.dt_agendamento), 'dd/MM/yyyy')} às {ultimoAtendimento.hr_agendamento.slice(0, 5)}</span></div>
              <div className="dash-detail-row"><span>Pet</span><span>{ultimoAtendimento.pet?.nome ?? '—'}</span></div>
              <div className="dash-detail-row"><span>Serviço</span><span>{ultimoAtendimento.servico?.nome ?? '—'}</span></div>
              <div className="dash-detail-row"><span>Profissional</span><span>{ultimoAtendimento.funcionario?.nome ?? '—'}</span></div>
              <div className="dash-detail-row"><span>Valor</span><span>{moeda(Number(ultimoAtendimento.valor))}</span></div>
              {diasDesdeUltimo !== null && (
                <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                  {diasDesdeUltimo === 0
                    ? 'Último atendimento foi hoje.'
                    : `Há ${diasDesdeUltimo} dia${diasDesdeUltimo !== 1 ? 's' : ''} desde o último atendimento.`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Nenhum atendimento concluído ainda.</p>
          )}
        </div>

        <div className="card">
          <h3 className="relatorio-secao-titulo">
            <IconCalendar style={{ width: 15, height: 15 }} /> Próximo agendamento
          </h3>
          {proximoAgendamento ? (
            <>
              <div className="dash-detail-row"><span>Data</span><span>{format(parseISO(proximoAgendamento.dt_agendamento), 'dd/MM/yyyy')} às {proximoAgendamento.hr_agendamento.slice(0, 5)}</span></div>
              <div className="dash-detail-row"><span>Pet</span><span>{proximoAgendamento.pet?.nome ?? '—'}</span></div>
              <div className="dash-detail-row"><span>Serviço</span><span>{proximoAgendamento.servico?.nome ?? '—'}</span></div>
              <div className="dash-detail-row"><span>Profissional</span><span>{proximoAgendamento.funcionario?.nome ?? '—'}</span></div>
              <div className="dash-detail-row"><span>Valor</span><span>{moeda(Number(proximoAgendamento.valor))}</span></div>
              <div className="dash-detail-row"><span>Status</span><span><span className={`badge ${classeBadgeStatus(proximoAgendamento.status)}`}>{rotuloStatus(proximoAgendamento.status)}</span></span></div>
            </>
          ) : (
            <p className="text-sm text-muted">Nenhum agendamento futuro.</p>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        {/* ── Dados do cliente ── */}
        <div className="card">
          <h3 className="relatorio-secao-titulo">
            <IconUsers style={{ width: 15, height: 15 }} /> Dados do cliente
          </h3>
          <div className="dash-detail-row"><span>Nome</span><span>{cliente.nome}</span></div>
          <div className="dash-detail-row"><span>Telefone</span><span>{formatarTelefone(cliente.telefone)}</span></div>
          <div className="dash-detail-row"><span>E-mail</span><span>{cliente.email}</span></div>
          <div className="dash-detail-row"><span>CPF</span><span>{formatarCpf(cliente.cpf)}</span></div>
          <div className="dash-detail-row"><span>Cadastro</span><span>{format(parseISO(cliente.created_at), 'dd/MM/yyyy')}</span></div>
          <div className="dash-detail-row"><span>Última atualização</span><span>{format(parseISO(cliente.updated_at), 'dd/MM/yyyy')}</span></div>
        </div>

        {/* ── Resumo financeiro ── */}
        <div className="card">
          <h3 className="relatorio-secao-titulo">
            <IconMoney style={{ width: 15, height: 15 }} /> Resumo financeiro
          </h3>
          <div className="dash-detail-row"><span>Total gasto (concluídos)</span><span>{moeda(totalGasto)}</span></div>
          <div className="dash-detail-row"><span>Total pendente</span><span>{moeda(totalPendente)}</span></div>
          <div className="dash-detail-row"><span>Ticket médio</span><span>{moeda(ticketMedio)}</span></div>
          <div className="dash-detail-row"><span>Atendimentos concluídos</span><span>{qtdVendas}</span></div>
          <div className="dash-detail-row"><span>Cancelamentos</span><span>{qtdCancelados}</span></div>
          {maiorValor !== null && <div className="dash-detail-row"><span>Maior valor em um atendimento</span><span>{moeda(maiorValor)}</span></div>}
          {servicosMaisUtilizados[0] && <div className="dash-detail-row"><span>Serviço mais contratado</span><span>{servicosMaisUtilizados[0].nome}</span></div>}
          {frequenciaMediaDias !== null ? (
            <div className="dash-detail-row"><span>Frequência média</span><span>a cada {frequenciaMediaDias} dia{frequenciaMediaDias !== 1 ? 's' : ''}</span></div>
          ) : (
            <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
              Frequência média ainda não disponível (precisa de pelo menos 2 atendimentos concluídos).
            </p>
          )}
        </div>
      </div>

      {/* ── Pets ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h3 className="relatorio-secao-titulo">
          <IconDog style={{ width: 15, height: 15 }} /> Pets
          {petMaisAtendido && petMaisAtendido.qtdAgendamentos > 0 && (
            <span className="text-xs text-muted" style={{ fontWeight: 400, marginLeft: 'var(--space-2)' }}>
              (mais atendido: {petMaisAtendido.nome})
            </span>
          )}
        </h3>
        {petsComStats.length === 0 ? (
          <p className="text-sm text-muted">Nenhum pet cadastrado.</p>
        ) : (
          <div className="relatorio-lista">
            {petsComStats.map(p => (
              <Link key={p.id_pet} href={`/lojista/pets/${p.id_pet}`} className="relatorio-lista-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="relatorio-lista-info">
                  <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</div>
                  <div className="text-xs text-muted">
                    {[p.especie, p.porte, p.raca].filter(Boolean).join(' · ')} · {p.qtdAgendamentos} atendimento{p.qtdAgendamentos !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {p.ultimoAtendimento && <div className="text-xs text-muted">Último: {format(parseISO(p.ultimoAtendimento.dt_agendamento), 'dd/MM/yyyy')}</div>}
                  {p.proximoAtendimento && <div className="text-xs text-success">Próximo: {format(parseISO(p.proximoAtendimento.dt_agendamento), 'dd/MM/yyyy')}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Serviços mais utilizados ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h3 className="relatorio-secao-titulo">
          <IconScissors style={{ width: 15, height: 15 }} /> Serviços mais utilizados
        </h3>
        {servicosMaisUtilizados.length === 0 ? (
          <p className="text-sm text-muted">Nenhum atendimento concluído ainda.</p>
        ) : (
          <div className="relatorio-lista">
            {servicosMaisUtilizados.map(s => (
              <div key={s.nome} className="relatorio-lista-item">
                <div className="relatorio-lista-info">
                  <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                  <div className="text-xs text-muted">{s.qtd} atendimento{s.qtd !== 1 ? 's' : ''}</div>
                </div>
                <div className="font-semibold text-success">{moeda(s.valor)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {planosCliente && (
        <PlanosDoCliente
          assinaturas={planosCliente.assinaturas}
          planos={planosCliente.planos}
          pets={pets.map(p => ({ id_pet: p.id_pet, nome: p.nome }))}
          hojeISO={hojeISO}
          formasAceitas={planosCliente.formas}
        />
      )}

      {/* ── Avaliações feitas pelo cliente ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h3 className="relatorio-secao-titulo">
          <IconStar style={{ width: 15, height: 15 }} /> Avaliações do cliente
        </h3>
        {avaliacoesCliente.length === 0 || mediaNotasCliente == null ? (
          <p className="text-sm text-muted">Este cliente ainda não avaliou nenhum atendimento.</p>
        ) : (
          <>
            <div className="flex gap-6" style={{ flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
              <div>
                <div className="text-xs text-muted">Total de avaliações feitas</div>
                <div className="font-semibold" style={{ color: 'var(--gray-100)', fontSize: '1.125rem' }}>{avaliacoesCliente.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Média das notas que deu</div>
                <div className="avaliacao-media">
                  <span className="font-semibold" style={{ color: 'var(--gray-100)', fontSize: '1.125rem' }}>{formatarMedia(mediaNotasCliente)}</span>
                  <Estrelas nota={mediaNotasCliente} tamanho={14} />
                </div>
              </div>
            </div>
            {avaliacoesCliente.map(a => (
              <div key={a.id_avaliacao} className="avaliacao-item">
                <div className="avaliacao-item-topo">
                  <Estrelas nota={a.nota} />
                  <span className="text-xs text-muted">{format(new Date(a.created_at), 'dd/MM/yyyy')}</span>
                </div>
                <p className={`avaliacao-item-comentario ${a.comentario ? '' : 'is-vazio'}`}>
                  {a.comentario ? <>&ldquo;{a.comentario}&rdquo;</> : 'Sem comentário'}
                </p>
                <div className="avaliacao-item-meta">
                  <span>Pet: <strong>{a.pet?.nome ?? '—'}</strong></span>
                  <span>Serviço: <strong>{a.servico?.nome ?? '—'}</strong></span>
                  {a.funcionario?.nome && <span>Profissional: <strong>{a.funcionario.nome}</strong></span>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Linha do tempo ── */}
      {timeline.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 className="relatorio-secao-titulo">Linha do tempo</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {timeline.map(a => (
              <div key={a.id_agendamento} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--gray-850)' }}>
                <div style={{ minWidth: 90, fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                  {format(parseISO(a.dt_agendamento), 'dd/MM/yyyy')}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{a.servico?.nome ?? 'Serviço'}</span>
                  {' · '}
                  <span className="text-sm text-muted">Pet: {a.pet?.nome ?? '—'}</span>
                </div>
                <div className="text-sm font-semibold text-success">{moeda(Number(a.valor))}</div>
                <span className={`badge ${classeBadgeStatus(a.status)}`}>{rotuloStatus(a.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Histórico completo ── */}
      <div className="card">
        <h3 className="relatorio-secao-titulo">Histórico de agendamentos</h3>
        {agendamentos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum histórico disponível.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Pet</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agendamentos.map(a => (
                  <tr key={a.id_agendamento}>
                    <td>{format(parseISO(a.dt_agendamento), 'dd/MM/yyyy')}</td>
                    <td>{a.hr_agendamento.slice(0, 5)}</td>
                    <td>{a.pet?.nome ?? '—'}</td>
                    <td>{a.servico?.nome ?? '—'}</td>
                    <td>{a.funcionario?.nome ?? '—'}</td>
                    <td>{moeda(Number(a.valor))}</td>
                    <td><span className={`badge ${classeBadgeStatus(a.status)}`}>{rotuloStatus(a.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {agendamentos.length === 200 && (
              <p className="text-xs text-muted" style={{ padding: 'var(--space-3)' }}>
                Mostrando os 200 atendimentos mais recentes.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
