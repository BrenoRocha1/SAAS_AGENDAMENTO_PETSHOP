import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const metadata: Metadata = { title: 'Empresas' }

interface LojistaRow {
  id_lojista: string
  nome_loja: string
  email: string
  telefone: string
  cidade: string | null
  estado: string | null
  ativo: boolean
  created_at: string
}

export default async function AdminEmpresasPage() {
  // Lista todas as empresas da plataforma — só é possível ver todo mundo
  // (não só a própria) via o client admin (service_role), porque a RLS de
  // `lojista` restringe SELECT a "o próprio lojista" ou "cliente vendo loja
  // ativa". Chegar até aqui já passou pelo gate de admin_usuario no layout.
  const adminClient = createAdminClient()
  if (!adminClient) {
    return (
      <div className="alert alert-error">
        <span>
          Serviço indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.
        </span>
      </div>
    )
  }

  const [{ data: lojistasRaw }, { data: agendamentosRaw }] = await Promise.all([
    adminClient
      .from('lojista')
      .select('id_lojista, nome_loja, email, telefone, cidade, estado, ativo, created_at')
      .order('created_at', { ascending: false }),
    adminClient
      .from('agendamento')
      .select('id_lojista, status'),
  ])

  const lojistas = (lojistasRaw ?? []) as LojistaRow[]
  const agendamentos = (agendamentosRaw ?? []) as { id_lojista: string; status: string }[]

  const contagemPorLojista = new Map<string, { total: number; concluidos: number }>()
  for (const a of agendamentos) {
    const atual = contagemPorLojista.get(a.id_lojista) ?? { total: 0, concluidos: 0 }
    atual.total++
    if (a.status === 'Concluído') atual.concluidos++
    contagemPorLojista.set(a.id_lojista, atual)
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Empresas</h1>
        <p className="page-subtitle">Todos os petshops cadastrados na plataforma</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="stat-card">
          <div className="stat-card-value">{lojistas.length}</div>
          <div className="stat-card-label">Empresas cadastradas</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{lojistas.filter(l => l.ativo).length}</div>
          <div className="stat-card-label">Ativas</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{agendamentos.length}</div>
          <div className="stat-card-label">Agendamentos (todas as empresas)</div>
        </div>
      </div>

      {lojistas.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Nenhuma empresa cadastrada ainda</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Contato</th>
                <th>Cidade/UF</th>
                <th>Agendamentos</th>
                <th>Status</th>
                <th>Cadastrada em</th>
              </tr>
            </thead>
            <tbody>
              {lojistas.map(l => {
                const c = contagemPorLojista.get(l.id_lojista)
                return (
                  <tr key={l.id_lojista}>
                    <td className="font-semibold" style={{ color: 'var(--gray-100)' }}>{l.nome_loja}</td>
                    <td>
                      <div>{l.email}</div>
                      <div className="text-sm text-muted">{l.telefone}</div>
                    </td>
                    <td>{l.cidade ? `${l.cidade}${l.estado ? `/${l.estado}` : ''}` : '—'}</td>
                    <td>
                      {c?.total ?? 0}
                      <span className="text-sm text-muted"> ({c?.concluidos ?? 0} concluídos)</span>
                    </td>
                    <td>
                      <span className={`badge ${l.ativo ? 'badge-ativo' : 'badge-inativo'}`}>
                        {l.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="text-sm text-muted">
                      {format(new Date(l.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
