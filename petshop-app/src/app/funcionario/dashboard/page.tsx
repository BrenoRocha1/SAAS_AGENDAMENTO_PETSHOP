import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Funcionário' }

export default async function FuncionarioDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Buscar dados do funcionário
  const { data: funcionario } = await supabase
    .from('funcionario')
    .select('nome, cargo, pode_gerenciar_agenda, pode_gerenciar_servicos, id_lojista')
    .eq('id_funcionario', user!.id)
    .single()

  // Buscar nome do petshop
  const { data: lojista } = await supabase
    .from('lojista')
    .select('nome_loja')
    .eq('id_lojista', funcionario!.id_lojista)
    .single()

  // Buscar agendamentos de hoje se tem permissão
  let agendamentosHoje: Array<{
    id_agendamento: string
    hr_agendamento: string
    status: string
    nome_cliente?: string
    nome_pet?: string
    nome_servico?: string
  }> = []

  if (funcionario?.pode_gerenciar_agenda) {
    const today = new Date().toISOString().split('T')[0]
    const { data: agendamentos } = await supabase
      .from('agendamento')
      .select(`
        id_agendamento,
        hr_agendamento,
        status,
        cliente:cliente(nome),
        pet:pet(nome),
        servico:servico(nome)
      `)
      .eq('id_lojista', funcionario.id_lojista)
      .eq('dt_agendamento', today)
      .neq('status', 'Cancelado')
      .order('hr_agendamento', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agendamentosHoje = (agendamentos ?? []).map((a: any) => ({
      id_agendamento: a.id_agendamento,
      hr_agendamento: a.hr_agendamento,
      status: a.status,
      nome_cliente: a.cliente?.nome,
      nome_pet: a.pet?.nome,
      nome_servico: a.servico?.nome,
    }))
  }

  const statusColors: Record<string, string> = {
    Pendente: 'var(--warning-400)',
    Confirmado: 'var(--info-400)',
    Concluído: 'var(--success-400)',
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Olá, {funcionario?.nome?.split(' ')[0]}! 👋</h1>
        <p className="page-subtitle">
          {funcionario?.cargo ? `${funcionario.cargo} em ` : 'Funcionário em '}
          <strong>{lojista?.nome_loja}</strong>
        </p>
      </div>

      {/* Cards de permissões */}
      <div className="grid-2" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="card" style={{ borderLeft: `4px solid ${funcionario?.pode_gerenciar_agenda ? 'var(--success-400)' : 'var(--gray-600)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: '1.5rem' }}>📅</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--gray-100)' }}>Gerenciar Agenda</div>
              <div style={{ fontSize: '0.85rem', color: funcionario?.pode_gerenciar_agenda ? 'var(--success-400)' : 'var(--gray-500)' }}>
                {funcionario?.pode_gerenciar_agenda ? '✓ Ativo' : '✕ Sem permissão'}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ borderLeft: `4px solid ${funcionario?.pode_gerenciar_servicos ? 'var(--success-400)' : 'var(--gray-600)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: '1.5rem' }}>✂️</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--gray-100)' }}>Gerenciar Serviços</div>
              <div style={{ fontSize: '0.85rem', color: funcionario?.pode_gerenciar_servicos ? 'var(--success-400)' : 'var(--gray-500)' }}>
                {funcionario?.pode_gerenciar_servicos ? '✓ Ativo' : '✕ Sem permissão'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agendamentos de hoje */}
      {funcionario?.pode_gerenciar_agenda && (
        <>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--gray-100)',
            marginBottom: 'var(--space-4)',
            fontFamily: 'var(--font-heading)',
          }}>
            📋 Agenda de Hoje
          </h2>

          {agendamentosHoje.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-state-icon">🎉</div>
              <div className="empty-state-title">Nenhum agendamento para hoje</div>
              <p>Aproveite o dia tranquilo!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {agendamentosHoje.map((ag: any) => (
                <div key={ag.id_agendamento} className="card" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-4)',
                }}>
                  <div style={{
                    background: 'var(--gray-800)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-2) var(--space-3)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-heading)',
                    fontSize: '1.1rem',
                    color: 'var(--primary-400)',
                    minWidth: '70px',
                    textAlign: 'center',
                  }}>
                    {ag.hr_agendamento?.slice(0, 5)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--gray-100)' }}>
                      {ag.nome_servico}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>
                      🐕 {ag.nome_pet} • 👤 {ag.nome_cliente}
                    </div>
                  </div>
                  <span style={{
                    padding: 'var(--space-1) var(--space-3)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: statusColors[ag.status] ?? 'var(--gray-400)',
                    background: `${statusColors[ag.status] ?? 'var(--gray-600)'}15`,
                    border: `1px solid ${statusColors[ag.status] ?? 'var(--gray-600)'}30`,
                  }}>
                    {ag.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!funcionario?.pode_gerenciar_agenda && !funcionario?.pode_gerenciar_servicos && (
        <div className="empty-state card" style={{ marginTop: 'var(--space-8)' }}>
          <div className="empty-state-icon">🔒</div>
          <div className="empty-state-title">Sem permissões configuradas</div>
          <p>Entre em contato com o responsável pelo petshop para configurar suas permissões de acesso.</p>
        </div>
      )}
    </>
  )
}
