import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientesLojistaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: agendamentos } = await supabase
    .from('agendamento')
    .select(`
      id_cliente,
      cliente:id_cliente ( id_cliente, nome, telefone, email ),
      pet:id_pet ( nome, raca )
    `)
    .eq('id_lojista', user!.id)
    .not('status', 'eq', 'Cancelado')

  // Agrupar por cliente único
  const clientesMap = new Map<string, any>()
  for (const ag of agendamentos ?? []) {
    const c = ag.cliente as any
    if (!c) continue
    if (!clientesMap.has(c.id_cliente)) {
      clientesMap.set(c.id_cliente, { ...c, pets: new Set<string>(), totalAgendamentos: 0 })
    }
    const entry = clientesMap.get(c.id_cliente)
    entry.totalAgendamentos++
    if (ag.pet) entry.pets.add(`${(ag.pet as any).nome} (${(ag.pet as any).raca})`)
  }

  const clientes = Array.from(clientesMap.values()).map(c => ({
    ...c,
    pets: Array.from(c.pets as Set<string>),
  }))

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Clientes 👥</h1>
        <p className="page-subtitle">Clientes que já agendaram no seu petshop</p>
      </div>

      {clientes.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">Nenhum cliente ainda</div>
          <p>Seus clientes aparecerão aqui após o primeiro agendamento</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>Pets</th>
                <th>Agendamentos</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c: any) => (
                <tr key={c.id_cliente}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          color: 'white',
                          flexShrink: 0,
                        }}
                      >
                        {c.nome?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{c.nome}</span>
                    </div>
                  </td>
                  <td>
                    <div>{c.telefone}</div>
                    <div className="text-sm text-muted">{c.email}</div>
                  </td>
                  <td>
                    <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                      {c.pets.map((p: string) => (
                        <span key={p} className="badge badge-ativo" style={{ fontSize: '0.7rem' }}>{p}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className="font-semibold" style={{ color: 'var(--primary-400)' }}>
                      {c.totalAgendamentos}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
