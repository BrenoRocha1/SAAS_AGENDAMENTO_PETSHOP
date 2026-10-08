import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { formatarReais } from '@/lib/taxidog'
import { dataBRFmt, telefoneBR } from '@/lib/interno-util'
import BotaoAcao from '@/components/interno/BotaoAcao'
import FormEmpresa from '@/components/interno/FormEmpresa'
import { alterarStatusEmpresaAction } from '@/lib/actions-interno'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Empresa — Interno' }
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function InternoEmpresa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>

  const { data: loja } = await db.from('lojista').select('*').eq('id_lojista', id).maybeSingle()
  if (!loja) notFound()

  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const contar = (tabela: string, filtro?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const q = db.from(tabela).select('*', { count: 'exact', head: true }).eq('id_lojista', id)
    return filtro ? filtro(q) : q
  }

  const [agend, agendConcl, servicos, produtos, equipe, planos, vendas30, equipeLista] = await Promise.all([
    contar('agendamento'),
    contar('agendamento', q => q.eq('status', 'Concluído')),
    contar('servico'),
    contar('produto'),
    contar('funcionario', q => q.eq('ativo', true)),
    contar('assinatura', q => q.eq('status', 'ativa')),
    db.from('venda').select('total').eq('id_lojista', id).eq('status', 'concluida').gte('created_at', trintaDias).limit(20000),
    db.from('funcionario').select('id_funcionario, nome, cargo, ativo').eq('id_lojista', id).order('nome'),
  ])

  const totalVendas = ((vendas30.data ?? []) as { total: number }[]).reduce((s, v) => s + Number(v.total), 0)

  const cards: { valor: string | number; rotulo: string }[] = [
    { valor: agend.count ?? 0, rotulo: 'Agendamentos' },
    { valor: agendConcl.count ?? 0, rotulo: 'Concluídos' },
    { valor: servicos.count ?? 0, rotulo: 'Serviços' },
    { valor: produtos.count ?? 0, rotulo: 'Produtos' },
    { valor: equipe.count ?? 0, rotulo: 'Equipe ativa' },
    { valor: planos.count ?? 0, rotulo: 'Assinaturas ativas' },
    { valor: formatarReais(totalVendas), rotulo: `PDV em 30 dias (${vendas30.data?.length ?? 0})` },
  ]

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <Link href={`${ROTA_INTERNA}/empresas`} className="text-sm text-muted">← Empresas</Link>
          <h1 className="page-title">{loja.nome_loja}</h1>
          <p className="page-subtitle">
            {loja.email} · {telefoneBR(loja.telefone)} · cadastrada em {dataBRFmt(loja.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <span className={`badge ${loja.ativo ? 'badge-ativo' : 'badge-inativo'}`}>{loja.ativo ? 'Ativa' : 'Inativa'}</span>
          <BotaoAcao
            acao={alterarStatusEmpresaAction.bind(null, id, !loja.ativo)}
            confirmar={loja.ativo ? `Desativar ${loja.nome_loja}?` : undefined}
            className={loja.ativo ? 'btn btn-danger btn-sm' : 'btn btn-success btn-sm'}
          >
            {loja.ativo ? 'Desativar empresa' : 'Reativar empresa'}
          </BotaoAcao>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 'var(--space-8)' }}>
        {cards.map(c => (
          <div className="stat-card" key={c.rotulo}>
            <div className="stat-card-value">{c.valor}</div>
            <div className="stat-card-label">{c.rotulo}</div>
          </div>
        ))}
      </div>

      <h2 className="page-title" style={{ fontSize: '1.125rem', marginBottom: 'var(--space-3)' }}>Dados da empresa</h2>
      <FormEmpresa id={id} nome_loja={loja.nome_loja} telefone={loja.telefone} cidade={loja.cidade ?? ''} estado={loja.estado ?? ''} />

      <h2 className="page-title" style={{ fontSize: '1.125rem', margin: 'var(--space-8) 0 var(--space-3)' }}>Equipe</h2>
      {(equipeLista.data ?? []).length === 0 ? (
        <div className="empty-state card"><div className="empty-state-title">Sem funcionários cadastrados</div></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Nome</th><th>Cargo</th><th>Status</th></tr></thead>
            <tbody>
              {(equipeLista.data ?? []).map((f: { id_funcionario: string; nome: string; cargo: string | null; ativo: boolean }) => (
                <tr key={f.id_funcionario}>
                  <td>{f.nome}</td>
                  <td>{f.cargo ?? '—'}</td>
                  <td><span className={`badge ${f.ativo ? 'badge-ativo' : 'badge-inativo'}`}>{f.ativo ? 'Ativo' : 'Inativo'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
