import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { agoraBrasilHHMM, hojeBrasilISO } from '@/lib/agenda'
import { formatarReais } from '@/lib/taxidog'
import { IconCalendar, IconDog, IconMoney, IconPaw, IconPlus, IconRepeat, IconScissors, IconStore } from '@/components/icons'
import { dataBR, type AssinaturaDoCliente } from '@/lib/planos'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import type { Metadata } from 'next'
import Ilustracao from '@/components/Ilustracao'

export const metadata: Metadata = { title: 'Dashboard — Cliente' }

interface AgendamentoProximo {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
  valor: number
  pet: { nome: string; raca: string } | null
  servico: { nome: string } | null
  lojista: { nome_loja: string } | null
}

export default async function ClienteDashboard() {
  const supabase = await createClient()
  const user = await obterUsuario()

  const [{ data: cliente }, { data: agendamentosRaw }, { count: totalPets }, { count: totalAgendamentos }, { data: totalGasto }, { data: planosRaw, error: planosErro }] = await Promise.all([
    supabase.from('cliente').select('nome').eq('id_cliente', user!.id).maybeSingle(),
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor,
        pet:id_pet ( nome, raca ),
        servico:id_servico ( nome ),
        lojista:id_lojista ( nome_loja )
      `)
      .eq('id_cliente', user!.id)
      .gte('dt_agendamento', hojeBrasilISO())
      // Só o que ainda vai acontecer: finalizado ou cancelado não é "próximo".
      .in('status', ['Pendente', 'Confirmado', 'Em andamento'])
      .order('dt_agendamento', { ascending: true })
      .order('hr_agendamento', { ascending: true })
      .limit(5),
    supabase.from('pet').select('*', { count: 'exact', head: true }).eq('id_cliente', user!.id).eq('ativo', true),
    supabase.from('agendamento').select('*', { count: 'exact', head: true }).eq('id_cliente', user!.id),
    supabase.from('agendamento').select('valor').eq('id_cliente', user!.id).eq('status', 'Concluído'),
    // Planos dos pets (migration 068) — sem ela, o card não aparece.
    supabase.rpc('fn_meus_planos'),
  ])

  const agendamentos = (agendamentosRaw ?? []) as unknown as AgendamentoProximo[]
  const valorTotal = totalGasto?.reduce((acc, a) => acc + (a.valor ?? 0), 0) ?? 0
  const primeiroNome = cliente?.nome?.split(' ')[0] ?? ''
  const hoje = hojeBrasilISO()
  const planosAtivos = ((planosErro ? [] : planosRaw ?? []) as AssinaturaDoCliente[]).filter(a => a.status === 'ativa')

  // Celular: mesma tela Início do app (petshop-mobile/app/cliente/index.tsx).
  const horaAgora = Number(agoraBrasilHHMM().slice(0, 2))
  const saudacao = horaAgora < 12 ? 'Bom dia' : horaAgora < 18 ? 'Boa tarde' : 'Boa noite'
  const resumoDoPlano = (a: AssinaturaDoCliente) =>
    (a.periodo_atual && a.periodo_atual.beneficios.length > 0
      ? a.periodo_atual.beneficios.map(b => {
          const restam = Math.max(0, b.quantidade - Number(b.usados))
          return `${b.servico}: ${restam} de ${b.quantidade} ${b.quantidade === 1 ? 'restante' : 'restantes'}`
        }).join(' · ')
      : `Começa em ${dataBR(a.data_inicio)}`)
    + (a.proxima_cobranca ? ` · renova em ${dataBR(a.proxima_cobranca)}` : '')

  return (
    <>
      {/* Celular (até 768px): a mesma tela Início do app. */}
      <div className="dash-app">
        <div className="dash-app-header">
          <h1 className="dash-app-saudacao">{saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
          <p className="dash-app-sub">Aqui está um resumo da sua conta</p>
        </div>

        <Link href="/cliente/novo-agendamento" className="dash-app-botao">
          <IconPlus style={{ width: 18, height: 18 }} /> Novo agendamento
        </Link>

        <div className="dash-app-stats">
          <div className="dash-app-stat">
            <span className="dash-app-stat-icone"><IconPaw style={{ width: 18, height: 18 }} /></span>
            <strong>{totalPets ?? 0}</strong>
            <span>Pets cadastrados</span>
          </div>
          <div className="dash-app-stat">
            <span className="dash-app-stat-icone is-azul"><IconCalendar style={{ width: 18, height: 18 }} /></span>
            <strong>{totalAgendamentos ?? 0}</strong>
            <span>Agendamentos</span>
          </div>
        </div>
        <div className="dash-app-stats is-uma">
          <div className="dash-app-stat">
            <span className="dash-app-stat-icone is-verde"><IconMoney style={{ width: 18, height: 18 }} /></span>
            <strong>{formatarReais(valorTotal)}</strong>
            <span>Total investido</span>
          </div>
        </div>

        {planosAtivos.length > 0 && (
          <div className="dash-app-secao" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="dash-app-secao-topo">
              <h2>Meus planos</h2>
              <Link href="/cliente/planos">Ver detalhes</Link>
            </div>
            <div className="dash-app-lista">
              {planosAtivos.map(a => {
                const abertas = a.cobrancas.filter(c => c.status === 'pendente')
                const vencida = abertas.some(c => c.vencimento < hoje)
                return (
                  <div key={a.id_assinatura} className="dash-app-cartao">
                    <strong>{a.plano} · {a.pet ?? 'Pet'}</strong>
                    <span>{resumoDoPlano(a)}</span>
                    {abertas.length > 0 && (
                      <span className={`dash-app-selo ${vencida ? 'is-vencida' : 'is-aberta'}`}>
                        {vencida ? 'Cobrança vencida' : 'Cobrança em aberto'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="dash-app-secao-topo">
          <h2>Próximos agendamentos</h2>
          <Link href="/cliente/agendamentos">Ver todos</Link>
        </div>
        {!agendamentos.length ? (
          <div className="dash-app-vazio">
            <Ilustracao nome="agendar" altura={110} style={{ marginBottom: 0 }} />
            <strong>Nenhum agendamento próximo</strong>
            <span>Que tal agendar um serviço para o seu pet?</span>
          </div>
        ) : (
          <div className="dash-app-lista">
            {agendamentos.map(ag => {
              const [, mes, dia] = ag.dt_agendamento.split('-')
              return (
                <Link key={ag.id_agendamento} href="/cliente/agendamentos" className="dash-app-linha">
                  <span className="dash-app-linha-data">
                    <strong>{dia}/{mes}</strong>
                    <span>{ag.hr_agendamento.slice(0, 5)}</span>
                  </span>
                  <span className="dash-app-linha-divisor" />
                  <span className="dash-app-linha-info">
                    <span className="dash-app-linha-pet">{ag.servico?.nome ?? 'Serviço'}</span>
                    <span className="dash-app-linha-sub">{ag.pet?.nome ?? 'Pet'} · {ag.lojista?.nome_loja ?? ''}</span>
                  </span>
                  <span className={`badge ${classeBadgeStatus(ag.status)}`}>{rotuloStatus(ag.status)}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="dash-desktop">
      <div className="page-header">
        <h1 className="page-title">Olá{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
        <p className="page-subtitle">Aqui está um resumo da sua conta</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon tone-primary">
            <IconDog style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{totalPets ?? 0}</div>
          <div className="stat-card-label">Pets cadastrados</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon tone-info">
            <IconCalendar style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{totalAgendamentos ?? 0}</div>
          <div className="stat-card-label">Total de agendamentos</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon tone-success">
            <IconMoney style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{formatarReais(valorTotal)}</div>
          <div className="stat-card-label">Total investido</div>
        </div>
      </div>

      {planosAtivos.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
            <h3 className="flex items-center gap-2"><IconRepeat style={{ width: 18, height: 18 }} /> Meus Planos</h3>
            <Link href="/cliente/planos" className="btn btn-secondary btn-sm">Ver detalhes</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {planosAtivos.map(a => {
              const abertas = a.cobrancas.filter(c => c.status === 'pendente')
              const vencida = abertas.some(c => c.vencimento < hoje)
              return (
                <div key={a.id_assinatura} className="card-elevated" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                  <div className="flex items-center justify-between gap-2" style={{ flexWrap: 'wrap' }}>
                    <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{a.plano} · {a.pet ?? 'Pet'}</span>
                    {abertas.length > 0 && (
                      <span className={`badge ${vencida ? 'badge-cancelado' : 'badge-pendente'}`}>
                        {vencida ? 'Cobrança vencida' : 'Cobrança em aberto'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                    {a.periodo_atual && a.periodo_atual.beneficios.length > 0
                      ? a.periodo_atual.beneficios.map(b => {
                          const restam = Math.max(0, b.quantidade - Number(b.usados))
                          return `${b.servico}: ${restam} de ${b.quantidade} restante${b.quantidade !== 1 ? 's' : ''}`
                        }).join(' · ')
                      : `Começa em ${dataBR(a.data_inicio)}`}
                    {a.proxima_cobranca ? ` · renova em ${dataBR(a.proxima_cobranca)}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-6)' }}>
          <h3>Próximos Agendamentos</h3>
          <Link href="/cliente/novo-agendamento" className="btn btn-primary btn-sm">
            Novo Agendamento
          </Link>
        </div>

        {!agendamentos.length ? (
          <div className="empty-state">
            <Ilustracao nome="agendar" />
            <div className="empty-state-title">Nenhum agendamento próximo</div>
            <p style={{ marginBottom: 'var(--space-4)' }}>Que tal agendar um serviço para seu pet?</p>
            <Link href="/cliente/novo-agendamento" className="btn btn-primary">
              Agendar agora
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {agendamentos.map(ag => (
              <div
                key={ag.id_agendamento}
                className="card-elevated"
                style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--primary-soft-bg)',
                    border: '1px solid var(--primary-soft-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-400)',
                    flexShrink: 0,
                  }}
                >
                  <IconScissors style={{ width: 22, height: 22 }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 'var(--space-1)' }}>
                    <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>
                      {ag.servico?.nome}
                    </span>
                    <span className={`badge ${classeBadgeStatus(ag.status)}`}>
                      {rotuloStatus(ag.status)}
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm text-muted">
                    <span className="flex items-center gap-1"><IconDog style={{ width: 13, height: 13 }} /> {ag.pet?.nome} ({ag.pet?.raca})</span>
                    <span className="flex items-center gap-1"><IconStore style={{ width: 13, height: 13 }} /> {ag.lojista?.nome_loja}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>
                    {format(new Date(ag.dt_agendamento + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })}
                  </div>
                  <div className="text-sm text-muted">{ag.hr_agendamento.slice(0, 5)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </>
  )
}
