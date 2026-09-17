import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { hojeBrasilISO } from '@/lib/agenda'
import { IconCalendar, IconDog, IconMoney, IconScissors, IconStore } from '@/components/icons'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Cliente' }

const statusConfig: Record<string, { label: string; cls: string }> = {
  Pendente:   { label: 'Pendente',   cls: 'badge-pendente' },
  Confirmado: { label: 'Confirmado', cls: 'badge-confirmado' },
  Concluído:  { label: 'Concluído',  cls: 'badge-concluido' },
  Cancelado:  { label: 'Cancelado',  cls: 'badge-cancelado' },
}

interface AgendamentoProximo {
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  status: 'Pendente' | 'Confirmado' | 'Concluído' | 'Cancelado'
  valor: number
  pet: { nome: string; raca: string } | null
  servico: { nome: string } | null
  lojista: { nome_loja: string } | null
}

export default async function ClienteDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: cliente }, { data: agendamentosRaw }, { count: totalPets }, { count: totalAgendamentos }, { data: totalGasto }] = await Promise.all([
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
      .not('status', 'eq', 'Cancelado')
      .order('dt_agendamento', { ascending: true })
      .order('hr_agendamento', { ascending: true })
      .limit(5),
    supabase.from('pet').select('*', { count: 'exact', head: true }).eq('id_cliente', user!.id).eq('ativo', true),
    supabase.from('agendamento').select('*', { count: 'exact', head: true }).eq('id_cliente', user!.id),
    supabase.from('agendamento').select('valor').eq('id_cliente', user!.id).eq('status', 'Concluído'),
  ])

  const agendamentos = (agendamentosRaw ?? []) as unknown as AgendamentoProximo[]
  const valorTotal = totalGasto?.reduce((acc, a) => acc + (a.valor ?? 0), 0) ?? 0
  const primeiroNome = cliente?.nome?.split(' ')[0] ?? ''

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Olá{primeiroNome ? `, ${primeiroNome}` : ''}!</h1>
        <p className="page-subtitle">Aqui está um resumo da sua conta</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)', color: 'var(--primary-400)' }}>
            <IconDog style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{totalPets ?? 0}</div>
          <div className="stat-card-label">Pets cadastrados</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.25)', color: 'var(--info-400)' }}>
            <IconCalendar style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">{totalAgendamentos ?? 0}</div>
          <div className="stat-card-label">Total de agendamentos</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.25)', color: 'var(--success-400)' }}>
            <IconMoney style={{ width: 20, height: 20 }} />
          </div>
          <div className="stat-card-value">R$ {valorTotal.toFixed(2)}</div>
          <div className="stat-card-label">Total investido</div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-6)' }}>
          <h3>Próximos Agendamentos</h3>
          <Link href="/cliente/novo-agendamento" className="btn btn-primary btn-sm">
            Novo Agendamento
          </Link>
        </div>

        {!agendamentos.length ? (
          <div className="empty-state">
            <IconCalendar style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
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
                    <span className={`badge ${statusConfig[ag.status]?.cls}`}>
                      {statusConfig[ag.status]?.label}
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
    </>
  )
}
