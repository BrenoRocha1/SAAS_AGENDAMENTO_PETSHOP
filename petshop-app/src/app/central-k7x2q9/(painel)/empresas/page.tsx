import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { TAMANHO_PAGINA, dataBRFmt, numeroPagina, termoSeguro, telefoneBR } from '@/lib/interno-util'
import Paginacao from '@/components/interno/Paginacao'
import BotaoAcao from '@/components/interno/BotaoAcao'
import { alterarStatusEmpresaAction, entrarComoAction } from '@/lib/actions-interno'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Empresas — Interno' }
export const dynamic = 'force-dynamic'

interface Props { searchParams: Promise<{ busca?: string; status?: string; pagina?: string }> }

interface Linha {
  id_lojista: string; nome_loja: string; email: string; telefone: string
  cidade: string | null; estado: string | null; ativo: boolean; created_at: string
  acesso_ate: string | null; acesso_livre: boolean | null
}

export default async function InternoEmpresas({ searchParams }: Props) {
  const sp = await searchParams
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>

  const busca = termoSeguro(sp.busca)
  const status = sp.status === 'ativas' || sp.status === 'inativas' ? sp.status : ''
  const pagina = numeroPagina(sp.pagina)

  let q = db
    .from('lojista')
    .select('id_lojista, nome_loja, email, telefone, cidade, estado, ativo, created_at, acesso_ate, acesso_livre', { count: 'exact' })
  if (busca) q = q.or(`nome_loja.ilike.%${busca}%,email.ilike.%${busca}%,cidade.ilike.%${busca}%`)
  if (status) q = q.eq('ativo', status === 'ativas')
  const { data, count } = await q
    .order('created_at', { ascending: false })
    .range((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA - 1)
  const lojas = (data ?? []) as Linha[]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Empresas</h1>
        <p className="page-subtitle">Todos os petshops da plataforma</p>
      </div>

      <form method="get" className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <input className="form-input" name="busca" defaultValue={busca} placeholder="Buscar por nome, e-mail ou cidade" style={{ flex: '1 1 240px' }} />
        <select className="form-select" name="status" defaultValue={status} style={{ flex: '0 1 160px' }}>
          <option value="">Todas</option>
          <option value="ativas">Ativas</option>
          <option value="inativas">Inativas</option>
        </select>
        <button className="btn btn-primary" type="submit">Filtrar</button>
      </form>

      {lojas.length === 0 ? (
        <div className="empty-state card"><div className="empty-state-title">Nenhuma empresa encontrada</div></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Empresa</th><th>Contato</th><th>Cidade/UF</th><th>Status</th><th>Acesso</th><th>Cadastrada</th><th /></tr>
            </thead>
            <tbody>
              {lojas.map(l => (
                <tr key={l.id_lojista}>
                  <td><Link href={`${ROTA_INTERNA}/empresas/${l.id_lojista}`} className="font-semibold">{l.nome_loja}</Link></td>
                  <td><div>{l.email}</div><div className="text-sm text-muted">{telefoneBR(l.telefone)}</div></td>
                  <td>{l.cidade ? `${l.cidade}${l.estado ? `/${l.estado}` : ''}` : '—'}</td>
                  <td><span className={`badge ${l.ativo ? 'badge-ativo' : 'badge-inativo'}`}>{l.ativo ? 'Ativa' : 'Inativa'}</span></td>
                  <td className="text-sm">
                    {l.acesso_livre ? 'Isenta' : l.acesso_ate ? (new Date(l.acesso_ate).getTime() > Date.now() ? `até ${dataBRFmt(l.acesso_ate)}` : 'Encerrado') : '—'}
                  </td>
                  <td className="text-sm text-muted">{dataBRFmt(l.created_at)}</td>
                  <td style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <BotaoAcao
                      acao={entrarComoAction.bind(null, 'lojista', l.id_lojista)}
                      className="btn btn-primary btn-sm"
                      confirmar={`Entrar na conta de ${l.nome_loja}? Sua sessão atual será trocada pela dela.`}
                    >
                      Entrar na conta
                    </BotaoAcao>
                    <BotaoAcao
                      acao={alterarStatusEmpresaAction.bind(null, l.id_lojista, !l.ativo)}
                      confirmar={l.ativo ? `Desativar ${l.nome_loja}?` : undefined}
                    >
                      {l.ativo ? 'Desativar' : 'Reativar'}
                    </BotaoAcao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao base={`${ROTA_INTERNA}/empresas`} params={{ ...(busca && { busca }), ...(status && { status }) }} pagina={pagina} total={count ?? 0} tamanho={TAMANHO_PAGINA} />
    </>
  )
}
