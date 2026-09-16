import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { hojeBrasilISO } from '@/lib/agenda'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Cliente' }

const statusConfig: Record<string, { label: string; cls: string }> = {
  Pendente:   { label: 'Pendente',   cls: 'badge-pendente' },
  Confirmado: { label: 'Confirmado', cls: 'badge-confirmado' },
  Concluído:  { label: 'Concluído',  cls: 'badge-concluido' },
  Cancelado:  { label: 'Cancelado',  cls: 'badge-cancelado' },
}

export default async function ClienteDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Próximos agendamentos
  const { data: agendamentos } = await supabase
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
    .limit(5)

  // Contagem de pets
  const { count: totalPets } = await supabase
    .from('pet')
    .select('*', { count: 'exact', head: true })
    .eq('id_cliente', user!.id)
    .eq('ativo', true)

  // Histórico
  const { count: totalAgendamentos } = await supabase
    .from('agendamento')
    .select('*', { count: 'exact', head: true })
    .eq('id_cliente', user!.id)

  const { data: totalGasto } = await supabase
    .from('agendamento')
    .select('valor')
    .eq('id_cliente', user!.id)
    .eq('status', 'Concluído')

  const valorTotal = totalGasto?.reduce((acc, a) => acc + (a.valor ?? 0), 0) ?? 0

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Olá! 👋</h1>
        <p className="page-subtitle">Aqui está um resumo da sua conta</p>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)' }}>🐕</div>
          <div className="stat-card-value">{totalPets ?? 0}</div>
          <div className="stat-card-label">Pets cadastrados</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.25)' }}>📅</div>
          <div className="stat-card-value">{totalAgendamentos ?? 0}</div>
          <div className="stat-card-label">Total de agendamentos</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.25)' }}>💰</div>
          <div className="stat-card-value">R$ {valorTotal.toFixed(2)}</div>
          <div className="stat-card-label">Total investido</div>
        </div>
      </div>

      {/* Próximos Agendamentos */}
      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-6)' }}>
          <h3>Próximos Agendamentos</h3>
          <Link href="/cliente/novo-agendamento" className="btn btn-primary btn-sm">
            + Novo Agendamento
          </Link>
        </div>

        {!agendamentos?.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">Nenhum agendamento próximo</div>
            <p style={{ marginBottom: 'var(--space-4)' }}>Que tal agendar um serviço para seu pet?</p>
            <Link href="/cliente/novo-agendamento" className="btn btn-primary">
              Agendar agora
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {agendamentos.map((ag: any) => (
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
                    background: 'rgba(124,58,237,0.15)',
                    border: '1px solid rgba(124,58,237,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    flexShrink: 0,
                  }}
                >
                  ✂️
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
                    <span>🐕 {ag.pet?.nome} ({ag.pet?.raca})</span>
                    <span>🏪 {ag.lojista?.nome_loja}</span>
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
