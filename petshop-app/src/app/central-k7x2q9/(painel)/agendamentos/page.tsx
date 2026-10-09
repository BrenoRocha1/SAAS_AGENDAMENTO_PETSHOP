import { createAdminClient } from '@/lib/supabase/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { TAMANHO_PAGINA, numeroPagina } from '@/lib/interno-util'
import { formatarReais } from '@/lib/taxidog'
import Paginacao from '@/components/interno/Paginacao'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Agendamentos — Interno' }
export const dynamic = 'force-dynamic'

const STATUS = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado']

interface Props { searchParams: Promise<{ status?: string; pagina?: string }> }

interface Linha {
  id_agendamento: string; dt_agendamento: string; hr_agendamento: string; status: string; valor: number
  lojista: { nome_loja: string } | null
  cliente: { nome: string } | null
  pet: { nome: string } | null
  servico: { nome: string } | null
}

export default async function InternoAgendamentos({ searchParams }: Props) {
  const sp = await searchParams
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>

  const status = STATUS.includes(sp.status ?? '') ? (sp.status as string) : ''
  const pagina = numeroPagina(sp.pagina)

  let q = db
    .from('agendamento')
    .select(
      'id_agendamento, dt_agendamento, hr_agendamento, status, valor, lojista:id_lojista(nome_loja), cliente:id_cliente(nome), pet:id_pet(nome), servico:id_servico(nome)',
      { count: 'exact' },
    )
  if (status) q = q.eq('status', status)
  const { data, count } = await q
    .order('dt_agendamento', { ascending: false })
    .order('hr_agendamento', { ascending: false })
    .range((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA - 1)
  const linhas = (data ?? []) as unknown as Linha[]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Agendamentos</h1>
        <p className="page-subtitle">Todos os agendamentos de todas as empresas</p>
      </div>

      <form method="get" className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)' }}>
        <select className="form-select" name="status" defaultValue={status} style={{ flex: '0 1 220px' }}>
          <option value="">Todos os status</option>
          {STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Filtrar</button>
      </form>

      {linhas.length === 0 ? (
        <div className="empty-state card"><div className="empty-state-title">Nenhum agendamento</div></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Data</th><th>Empresa</th><th>Cliente / Pet</th><th>Serviço</th><th>Valor</th><th>Status</th></tr></thead>
            <tbody>
              {linhas.map(a => (
                <tr key={a.id_agendamento}>
                  <td className="text-sm">{a.dt_agendamento.split('-').reverse().join('/')} {a.hr_agendamento.slice(0, 5)}</td>
                  <td>{a.lojista?.nome_loja ?? '—'}</td>
                  <td><div>{a.cliente?.nome ?? '—'}</div><div className="text-sm text-muted">{a.pet?.nome ?? '—'}</div></td>
                  <td>{a.servico?.nome ?? '—'}</td>
                  <td>{formatarReais(a.valor)}</td>
                  <td><span className="badge badge-pendente">{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao base={`${ROTA_INTERNA}/agendamentos`} params={{ ...(status ? { status } : {}) }} pagina={pagina} total={count ?? 0} tamanho={TAMANHO_PAGINA} />
    </>
  )
}
