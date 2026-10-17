import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { acharLoginPorEmail, termoSeguro } from '@/lib/interno-util'
import { rotuloTipoConta, tipoDaConta, type TipoConta } from '@/lib/conta-backup'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Contas — Interno' }
export const dynamic = 'force-dynamic'

interface Resultado { id: string; nome: string; email: string; tipo: TipoConta }

const BADGE: Record<TipoConta, string> = { cliente: 'badge-aceito', lojista: 'badge-ativo', funcionario: 'badge-inativo', sem: 'badge-pendente' }

// Contas: acha uma conta (cliente, loja ou só o login do Google) para
// converter entre cliente e loja, guardar backup ou importar dados.
export default async function InternoContas({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const { busca: bruto } = await searchParams
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>

  const busca = termoSeguro(bruto)
  let resultados: Resultado[] = []
  if (busca.length >= 2) {
    const [lojas, clientes] = await Promise.all([
      db.from('lojista').select('id_lojista, nome_loja, email').or(`nome_loja.ilike.%${busca}%,email.ilike.%${busca}%`).limit(20),
      db.from('cliente').select('id_cliente, nome, email').or(`nome.ilike.%${busca}%,email.ilike.%${busca}%`).limit(20),
    ])
    resultados = [
      ...((lojas.data ?? []) as { id_lojista: string; nome_loja: string; email: string }[]).map(l => ({ id: l.id_lojista, nome: l.nome_loja, email: l.email, tipo: 'lojista' as const })),
      ...((clientes.data ?? []) as { id_cliente: string; nome: string; email: string }[]).map(c => ({ id: c.id_cliente, nome: c.nome, email: c.email, tipo: 'cliente' as const })),
    ]
    // E-mail exato: acha também quem só entrou com o Google (sem perfil).
    if (busca.includes('@') && !resultados.some(r => r.email.toLowerCase() === busca.toLowerCase())) {
      const login = await acharLoginPorEmail(db, busca)
      if (login) {
        const { tipo, nome } = await tipoDaConta(db, login.id)
        resultados.push({ id: login.id, nome: nome ?? '—', email: login.email, tipo })
      }
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Contas</h1>
        <p className="page-subtitle">Converter entre cliente e loja, guardar backup e importar dados</p>
      </div>

      <form method="get" className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <input className="form-input" name="busca" defaultValue={busca} placeholder="Nome, nome da loja ou e-mail" style={{ flex: '1 1 260px' }} autoFocus />
        <button className="btn btn-primary" type="submit">Buscar</button>
      </form>

      {busca.length < 2 ? (
        <div className="empty-state card">
          <div className="empty-state-title">Busque a conta</div>
          <p>Digite o nome, o nome da loja ou o e-mail. Para quem só entrou com o Google e ainda não escolheu o perfil, use o e-mail completo.</p>
        </div>
      ) : resultados.length === 0 ? (
        <div className="empty-state card"><div className="empty-state-title">Nenhuma conta encontrada</div></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th /></tr></thead>
            <tbody>
              {resultados.map(r => (
                <tr key={`${r.tipo}-${r.id}`}>
                  <td className="font-semibold">{r.nome}</td>
                  <td>{r.email}</td>
                  <td><span className={`badge ${BADGE[r.tipo]}`}>{rotuloTipoConta(r.tipo)}</span></td>
                  <td><Link href={`${ROTA_INTERNA}/contas/${r.id}`} className="btn btn-secondary btn-sm">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
