import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const metadata: Metadata = { title: 'Dashboard — Lojista' }

export default async function LojistaDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Métricas via RPC
  const { data: metricas } = await supabase.rpc('fn_metricas_lojista', {
    p_id_lojista: user!.id,
  })

  // Agenda do dia
  const { data: agendaDia } = await supabase.rpc('fn_agenda_dia', {
    p_id_lojista: user!.id,
    p_data: new Date().toISOString().split('T')[0],
  })

  const m = metricas as any ?? {}
  const hoje = new Date()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard 📊</h1>
        <p className="page-subtitle">
          {format(hoje, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid-4" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)' }}>📅</div>
          <div className="stat-card-value">{m.hoje ?? 0}</div>
          <div className="stat-card-label">Agendamentos hoje</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.25)' }}>⏳</div>
          <div className="stat-card-value">{m.pendentes ?? 0}</div>
          <div className="stat-card-label">Pendentes</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.25)' }}>💰</div>
          <div className="stat-card-value">
            R$ {Number(m.receita_mes ?? 0).toFixed(0)}
          </div>
          <div className="stat-card-label">Receita este mês</div>
        </div>
        <div className="stat-card animate-slide-up">
          <div className="stat-card-icon" style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.25)' }}>👥</div>
          <div className="stat-card-value">{m.clientes_unicos ?? 0}</div>
          <div className="stat-card-label">Clientes únicos</div>
        </div>
      </div>

      {/* Agenda do Dia */}
      <div className="card">
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-6)' }}>
          <h3>Agenda de Hoje</h3>
          <span className="badge badge-confirmado">{agendaDia?.length ?? 0} agendamentos</span>
        </div>

        {!agendaDia?.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">☀️</div>
            <div className="empty-state-title">Sem agendamentos para hoje</div>
            <p>Aproveite para configurar seus serviços e horários</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Cliente</th>
                  <th>Pet</th>
                  <th>Serviço</th>
                  <th>Duração</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(agendaDia as any[]).map((ag) => (
                  <tr key={ag.id_agendamento}>
                    <td>
                      <strong>{ag.hr_agendamento?.slice(0, 5)}</strong>
                    </td>
                    <td>{ag.nome_cliente}</td>
                    <td>{ag.nome_pet}</td>
                    <td>{ag.nome_servico}</td>
                    <td>{ag.duracao} min</td>
                    <td className="text-success">R$ {Number(ag.valor).toFixed(2)}</td>
                    <td>
                      <span className={`badge badge-${ag.status.toLowerCase().replace('í','i').replace('ê','e')}`}>
                        {ag.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
