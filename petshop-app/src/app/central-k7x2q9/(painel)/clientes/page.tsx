import { createAdminClient } from '@/lib/supabase/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { TAMANHO_PAGINA, dataBRFmt, numeroPagina, termoSeguro, telefoneBR } from '@/lib/interno-util'
import Paginacao from '@/components/interno/Paginacao'
import BotaoAcao from '@/components/interno/BotaoAcao'
import TrocarEmail from '@/components/interno/TrocarEmail'
import { alterarStatusClienteAction, entrarComoAction } from '@/lib/actions-interno'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Clientes — Interno' }
export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ busca?: string; pagina?: string }> }

interface Linha { id_cliente: string; nome: string; email: string; telefone: string; ativo: boolean; created_at: string }

export default async function InternoClientes({ searchParams }: Props) {
  const sp = await searchParams
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>

  const busca = termoSeguro(sp.busca)
  const pagina = numeroPagina(sp.pagina)

  let q = db
    .from('cliente')
    .select('id_cliente, nome, email, telefone, ativo, created_at', { count: 'exact' })
  if (busca) q = q.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%`)
  const { data, count } = await q
    .order('created_at', { ascending: false })
    .range((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA - 1)
  const clientes = (data ?? []) as Linha[]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <p className="page-subtitle">Tutores cadastrados na plataforma</p>
      </div>

      <form method="get" className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <input className="form-input" name="busca" defaultValue={busca} placeholder="Buscar por nome ou e-mail" style={{ flex: '1 1 240px' }} />
        <button className="btn btn-primary" type="submit">Buscar</button>
      </form>

      {clientes.length === 0 ? (
        <div className="empty-state card"><div className="empty-state-title">Nenhum cliente encontrado</div></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Nome</th><th>Contato</th><th>Status</th><th>Cadastro</th><th /></tr></thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id_cliente}>
                  <td className="font-semibold">{c.nome}</td>
                  <td>
                    <div>{c.email}</div>
                    <div className="text-sm text-muted">{telefoneBR(c.telefone)}</div>
                    <div style={{ marginTop: 4 }}><TrocarEmail tipo="cliente" id={c.id_cliente} emailAtual={c.email} /></div>
                  </td>
                  <td><span className={`badge ${c.ativo ? 'badge-ativo' : 'badge-inativo'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="text-sm text-muted">{dataBRFmt(c.created_at)}</td>
                  <td style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <BotaoAcao
                      acao={entrarComoAction.bind(null, 'cliente', c.id_cliente)}
                      confirmar={`Entrar na conta de ${c.nome}? Sua sessão atual será trocada pela dela.`}
                    >
                      Entrar
                    </BotaoAcao>
                    <BotaoAcao
                      acao={alterarStatusClienteAction.bind(null, c.id_cliente, !c.ativo)}
                      confirmar={c.ativo ? `Desativar ${c.nome}?` : undefined}
                    >
                      {c.ativo ? 'Desativar' : 'Reativar'}
                    </BotaoAcao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao base={`${ROTA_INTERNA}/clientes`} params={{ ...(busca ? { busca } : {}) }} pagina={pagina} total={count ?? 0} tamanho={TAMANHO_PAGINA} />
    </>
  )
}
