import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import type { Metadata } from 'next'
import Link from 'next/link'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { agoraBrasil } from '@/lib/agenda'
import { formatarTelefone, formatarCpf, iniciais } from '@/lib/format'
import { obterContextoLojista } from '@/lib/lojista-context'
import { classeBadgeStatus, ehEtapaAtiva, rotuloStatus } from '@/lib/status-agendamento'
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconMail,
  IconPhone,
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
import Ilustracao from '@/components/Ilustracao'
import { GradeIndicadores, Indicador } from '@/components/relatorio/Indicador'
import { DuasColunas, NotaDaSecao, Pilha, Secao, SecaoVazia } from '@/components/relatorio/Secao'
import { MiniIndicadores } from '@/components/relatorio/MiniIndicadores'
import { Ranking } from '@/components/relatorio/Ranking'
import { formatarReais } from '@/lib/taxidog'

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

const moeda = formatarReais

export default async function PerfilClientePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null
  if (!contexto.podeGerenciarClientesPets) {
    return (
      <div className="empty-state card">
        <Ilustracao nome="sem-permissao" />
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
      .select('id_pet, nome, especie, porte, raca, foto_url')
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
        <Link href="/lojista/clientes" className="btn btn-ghost btn-sm so-desktop" style={{ marginBottom: 'var(--space-4)' }}>
          <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Clientes
        </Link>
        <div className="empty-state card">
          <Ilustracao nome="nao-encontrado" />
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
      <Link href="/lojista/clientes" className="btn btn-ghost btn-sm so-desktop" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Clientes
      </Link>

      {/* Celular (até 768px): a mesma tela do cliente no app. O resumo
          financeiro, a linha do tempo e o histórico ficam no computador. */}
      <div className="so-celular tela-app">
        <div className="tela-app-perfil">
          <span className="tela-app-avatar is-72">{iniciais(cliente.nome)}</span>
          <strong>{cliente.nome}</strong>
        </div>

        <div className="tela-app-acoes" style={{ marginBottom: 'var(--space-4)' }}>
          <a href={`tel:${cliente.telefone.replace(/\D/g, '')}`} className="tela-app-botao-suave">
            <IconPhone style={{ width: 18, height: 18 }} /> Ligar
          </a>
          <a
            href={`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tela-app-botao-suave"
          >
            <IconWhatsapp style={{ width: 18, height: 18 }} /> WhatsApp
          </a>
        </div>

        {contexto.podeGerenciarAgenda && (
          <Link href={`/lojista/agendamentos?novoAgendamentoTutor=${cliente.id_cliente}`} className="dash-app-botao">
            <IconCalendar style={{ width: 18, height: 18 }} /> Novo agendamento
          </Link>
        )}

        <div className="tela-app-cartao">
          <div className="tela-app-info">
            <IconPhone style={{ width: 16, height: 16 }} />
            <span>Telefone</span>
            <strong>{formatarTelefone(cliente.telefone)}</strong>
          </div>
          <div className="tela-app-info">
            <IconMail style={{ width: 16, height: 16 }} />
            <span>E-mail</span>
            <strong>{cliente.email}</strong>
          </div>
        </div>

        {podeEditar && (
          <Link href={`/lojista/clientes?editar=${cliente.id_cliente}`} className="tela-app-botao is-largo">
            <IconPencil style={{ width: 16, height: 16 }} /> Editar nome e telefone
          </Link>
        )}

        <div className="dash-app-secao-topo">
          <h2>Pets ({pets.length})</h2>
          {podeEditar && (
            <Link href={`/lojista/pets?novoPetTutor=${cliente.id_cliente}`} className="tela-app-botao is-compacto">
              <IconPlus style={{ width: 16, height: 16 }} /> Novo pet
            </Link>
          )}
        </div>
        {pets.length === 0 ? (
          <div className="dash-app-vazio">
            <span className="dash-app-vazio-icone"><IconDog style={{ width: 26, height: 26 }} /></span>
            <strong>Nenhum pet cadastrado</strong>
          </div>
        ) : (
          <div className="dash-app-lista">
            {pets.map(pet => (
              <Link key={pet.id_pet} href={`/lojista/pets/${pet.id_pet}`} className="dash-app-linha">
                <span className="tela-app-avatar is-40" style={pet.foto_url ? { backgroundImage: `url(${pet.foto_url})` } : undefined}>
                  {!pet.foto_url && iniciais(pet.nome)}
                </span>
                <span className="dash-app-linha-info">
                  <span className="dash-app-linha-pet">{pet.nome}</span>
                  <span className="dash-app-linha-sub">{pet.raca}</span>
                </span>
                <IconChevronRight className="tela-app-seta" style={{ width: 18, height: 18 }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="so-desktop">
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

      <Pilha>
        {/* ── Resumo ── */}
        <GradeIndicadores colunas={4}>
          <Indicador rotulo="Total gasto" valor={moeda(totalGasto)} icone={<IconMoney />} detalhe="atendimentos concluídos" />
          <Indicador rotulo="Ticket médio" valor={moeda(ticketMedio)} icone={<IconMoney />} detalhe="por atendimento concluído" />
          <Indicador
            rotulo="Agendamentos"
            valor={naoCancelados.length}
            icone={<IconCalendar />}
            detalhe={`${qtdVendas} concluído${qtdVendas !== 1 ? 's' : ''}`}
          />
          <Indicador rotulo="Pets" valor={pets.length} icone={<IconDog />} />
        </GradeIndicadores>

        <DuasColunas>
          {/* ── Último / próximo agendamento ── */}
          <Secao
            titulo="Último atendimento"
            icone={<IconClock />}
            descricao={diasDesdeUltimo === null
              ? undefined
              : diasDesdeUltimo === 0
                ? 'Foi hoje'
                : `Há ${diasDesdeUltimo} dia${diasDesdeUltimo !== 1 ? 's' : ''}`}
          >
            {ultimoAtendimento ? (
              <div>
                <div className="dash-detail-row"><span>Data</span><span>{format(parseISO(ultimoAtendimento.dt_agendamento), 'dd/MM/yyyy')} às {ultimoAtendimento.hr_agendamento.slice(0, 5)}</span></div>
                <div className="dash-detail-row"><span>Pet</span><span>{ultimoAtendimento.pet?.nome ?? '—'}</span></div>
                <div className="dash-detail-row"><span>Serviço</span><span>{ultimoAtendimento.servico?.nome ?? '—'}</span></div>
                <div className="dash-detail-row"><span>Profissional</span><span>{ultimoAtendimento.funcionario?.nome ?? '—'}</span></div>
                <div className="dash-detail-row"><span>Valor</span><span>{moeda(Number(ultimoAtendimento.valor))}</span></div>
              </div>
            ) : (
              <SecaoVazia>Nenhum atendimento concluído ainda.</SecaoVazia>
            )}
          </Secao>

          <Secao titulo="Próximo agendamento" icone={<IconCalendar />}>
            {proximoAgendamento ? (
              <div>
                <div className="dash-detail-row"><span>Data</span><span>{format(parseISO(proximoAgendamento.dt_agendamento), 'dd/MM/yyyy')} às {proximoAgendamento.hr_agendamento.slice(0, 5)}</span></div>
                <div className="dash-detail-row"><span>Pet</span><span>{proximoAgendamento.pet?.nome ?? '—'}</span></div>
                <div className="dash-detail-row"><span>Serviço</span><span>{proximoAgendamento.servico?.nome ?? '—'}</span></div>
                <div className="dash-detail-row"><span>Profissional</span><span>{proximoAgendamento.funcionario?.nome ?? '—'}</span></div>
                <div className="dash-detail-row"><span>Valor</span><span>{moeda(Number(proximoAgendamento.valor))}</span></div>
                <div className="dash-detail-row"><span>Status</span><span><span className={`badge ${classeBadgeStatus(proximoAgendamento.status)}`}>{rotuloStatus(proximoAgendamento.status)}</span></span></div>
              </div>
            ) : (
              <SecaoVazia>Nenhum agendamento futuro.</SecaoVazia>
            )}
          </Secao>
        </DuasColunas>

        <DuasColunas>
          {/* ── Dados do cliente ── */}
          <Secao titulo="Dados do cliente" icone={<IconUsers />}>
            <div>
              <div className="dash-detail-row"><span>Nome</span><span>{cliente.nome}</span></div>
              <div className="dash-detail-row"><span>Telefone</span><span>{formatarTelefone(cliente.telefone)}</span></div>
              <div className="dash-detail-row"><span>E-mail</span><span>{cliente.email}</span></div>
              <div className="dash-detail-row"><span>CPF</span><span>{formatarCpf(cliente.cpf)}</span></div>
              <div className="dash-detail-row"><span>Cadastro</span><span>{format(parseISO(cliente.created_at), 'dd/MM/yyyy')}</span></div>
              <div className="dash-detail-row"><span>Última atualização</span><span>{format(parseISO(cliente.updated_at), 'dd/MM/yyyy')}</span></div>
            </div>
          </Secao>

          {/* ── Resumo financeiro ── */}
          <Secao titulo="Resumo financeiro" icone={<IconMoney />}>
            <div>
              <div className="dash-detail-row"><span>Total gasto (concluídos)</span><span>{moeda(totalGasto)}</span></div>
              <div className="dash-detail-row"><span>Total pendente</span><span>{moeda(totalPendente)}</span></div>
              <div className="dash-detail-row"><span>Ticket médio</span><span>{moeda(ticketMedio)}</span></div>
              <div className="dash-detail-row"><span>Atendimentos concluídos</span><span>{qtdVendas}</span></div>
              <div className="dash-detail-row"><span>Cancelamentos</span><span>{qtdCancelados}</span></div>
              {maiorValor !== null && <div className="dash-detail-row"><span>Maior valor em um atendimento</span><span>{moeda(maiorValor)}</span></div>}
              {servicosMaisUtilizados[0] && <div className="dash-detail-row"><span>Serviço mais contratado</span><span>{servicosMaisUtilizados[0].nome}</span></div>}
              {frequenciaMediaDias !== null && (
                <div className="dash-detail-row"><span>Frequência média</span><span>a cada {frequenciaMediaDias} dia{frequenciaMediaDias !== 1 ? 's' : ''}</span></div>
              )}
            </div>
            {frequenciaMediaDias === null && (
              <NotaDaSecao>Frequência média ainda não disponível (precisa de pelo menos 2 atendimentos concluídos).</NotaDaSecao>
            )}
          </Secao>
        </DuasColunas>

        {/* ── Pets ── */}
        <Secao
          titulo="Pets"
          icone={<IconDog />}
          descricao={petMaisAtendido && petMaisAtendido.qtdAgendamentos > 0 ? `Mais atendido: ${petMaisAtendido.nome}` : undefined}
        >
          {petsComStats.length === 0 ? (
            <SecaoVazia>Nenhum pet cadastrado.</SecaoVazia>
          ) : (
            <Ranking
              comIniciais
              itens={petsComStats.map(p => ({
                chave: p.id_pet,
                titulo: p.nome,
                href: `/lojista/pets/${p.id_pet}`,
                valor: `${p.qtdAgendamentos} atendimento${p.qtdAgendamentos !== 1 ? 's' : ''}`,
                detalhe: [
                  [p.especie, p.porte, p.raca].filter(Boolean).join(' · '),
                  p.ultimoAtendimento && `último em ${format(parseISO(p.ultimoAtendimento.dt_agendamento), 'dd/MM/yyyy')}`,
                  p.proximoAtendimento && `próximo em ${format(parseISO(p.proximoAtendimento.dt_agendamento), 'dd/MM/yyyy')}`,
                ].filter(Boolean).join(' · '),
              }))}
            />
          )}
        </Secao>

        {/* ── Serviços mais utilizados ── */}
        <Secao titulo="Serviços mais utilizados" icone={<IconScissors />} descricao="Parte de cada serviço no total gasto">
          {servicosMaisUtilizados.length === 0 ? (
            <SecaoVazia>Nenhum atendimento concluído ainda.</SecaoVazia>
          ) : (
            <Ranking
              itens={servicosMaisUtilizados.map(s => ({
                chave: s.nome,
                titulo: s.nome,
                valor: moeda(s.valor),
                detalhe: `${s.qtd} atendimento${s.qtd !== 1 ? 's' : ''}`,
                ...(totalGasto > 0
                  ? { parte: s.valor / totalGasto, rotuloDaParte: `${((s.valor / totalGasto) * 100).toFixed(1).replace('.', ',')}%` }
                  : {}),
              }))}
            />
          )}
        </Secao>

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
        <Secao titulo="Avaliações do cliente" icone={<IconStar />}>
          {avaliacoesCliente.length === 0 || mediaNotasCliente == null ? (
            <SecaoVazia>Este cliente ainda não avaliou nenhum atendimento.</SecaoVazia>
          ) : (
            <>
              <MiniIndicadores
                itens={[
                  { valor: avaliacoesCliente.length, rotulo: 'avaliações feitas' },
                  {
                    valor: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        {formatarMedia(mediaNotasCliente)}
                        <Estrelas nota={mediaNotasCliente} tamanho={14} />
                      </span>
                    ),
                    rotulo: 'média das notas que deu',
                  },
                ]}
              />
              <div>
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
              </div>
            </>
          )}
        </Secao>

        {/* ── Linha do tempo ── */}
        {timeline.length > 0 && (
          <Secao titulo="Linha do tempo" icone={<IconClock />} descricao="Os atendimentos mais recentes">
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
          </Secao>
        )}

        {/* ── Histórico completo ── */}
        <Secao titulo="Histórico de agendamentos" icone={<IconCalendar />}>
          {agendamentos.length === 0 ? (
            <SecaoVazia>Nenhum histórico disponível.</SecaoVazia>
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
                      <td style={{ whiteSpace: 'nowrap' }}>{moeda(Number(a.valor))}</td>
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
        </Secao>
      </Pilha>
      </div>
    </>
  )
}
