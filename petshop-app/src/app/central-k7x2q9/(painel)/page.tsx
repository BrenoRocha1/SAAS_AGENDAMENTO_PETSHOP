import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatarReais } from '@/lib/taxidog'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { dataBRFmt, diasAtras, hojeBrasil, somarVendas } from '@/lib/interno-util'
import { acharContaDemo } from '@/lib/demo-loja'
import ContaDemonstracao from '@/components/interno/ContaDemonstracao'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Visão geral — Interno' }
export const dynamic = 'force-dynamic'
// "Criar conta de exemplo" roda daqui e faz muitas gravações.
export const maxDuration = 60

export default async function InternoVisaoGeral() {
  const db = createAdminClient()
  if (!db) {
    return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.</span></div>
  }

  const trintaDias = diasAtras(30)
  const hoje = hojeBrasil()
  const contar = (tabela: string, filtro?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = db.from(tabela).select('*', { count: 'exact', head: true })
    return filtro ? filtro(q) : q
  }

  const [
    empresas, empresasAtivas, clientes, pets, agendamentos, agendHoje, funcionarios, vendas30, ultimas, demo,
  ] = await Promise.all([
    contar('lojista'),
    contar('lojista', q => q.eq('ativo', true)),
    contar('cliente'),
    contar('pet'),
    contar('agendamento'),
    contar('agendamento', q => q.eq('dt_agendamento', hoje)),
    contar('funcionario', q => q.eq('ativo', true)),
    somarVendas(db, trintaDias),
    db.from('lojista').select('id_lojista, nome_loja, cidade, estado, ativo, created_at').order('created_at', { ascending: false }).limit(6),
    acharContaDemo(db),
  ])


  const cards: { valor: string | number; rotulo: string }[] = [
    { valor: empresas.count ?? 0, rotulo: 'Empresas cadastradas' },
    { valor: empresasAtivas.count ?? 0, rotulo: 'Empresas ativas' },
    { valor: clientes.count ?? 0, rotulo: 'Clientes' },
    { valor: pets.count ?? 0, rotulo: 'Pets' },
    { valor: agendamentos.count ?? 0, rotulo: 'Agendamentos (total)' },
    { valor: agendHoje.count ?? 0, rotulo: 'Agendamentos para hoje' },
    { valor: funcionarios.count ?? 0, rotulo: 'Funcionários ativos' },
    { valor: formatarReais(vendas30.total), rotulo: `Vendas PDV em 30 dias (${vendas30.quantidade})` },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Visão geral</h1>
        <p className="page-subtitle">Números de toda a plataforma, ao vivo</p>
      </div>

      <div className="grid-4" style={{ marginBottom: 'var(--space-8)' }}>
        {cards.map(c => (
          <div className="stat-card" key={c.rotulo}>
            <div className="stat-card-value">{c.valor}</div>
            <div className="stat-card-label">{c.rotulo}</div>
          </div>
        ))}
      </div>

      <ContaDemonstracao demo={demo} />

      <h2 className="page-title" style={{ fontSize: '1.125rem', marginBottom: 'var(--space-3)' }}>Últimas empresas</h2>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Empresa</th><th>Cidade/UF</th><th>Status</th><th>Cadastrada em</th></tr>
          </thead>
          <tbody>
            {(ultimas.data ?? []).map((l: { id_lojista: string; nome_loja: string; cidade: string | null; estado: string | null; ativo: boolean; created_at: string }) => (
              <tr key={l.id_lojista}>
                <td><Link href={`${ROTA_INTERNA}/empresas/${l.id_lojista}`} className="font-semibold">{l.nome_loja}</Link></td>
                <td>{l.cidade ? `${l.cidade}${l.estado ? `/${l.estado}` : ''}` : '—'}</td>
                <td><span className={`badge ${l.ativo ? 'badge-ativo' : 'badge-inativo'}`}>{l.ativo ? 'Ativa' : 'Inativa'}</span></td>
                <td className="text-sm text-muted">{dataBRFmt(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
