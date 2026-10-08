import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformAdmin } from '@/lib/admin'
import { dataBRFmt } from '@/lib/interno-util'
import BotaoAcao from '@/components/interno/BotaoAcao'
import FormAdmin from '@/components/interno/FormAdmin'
import CodigoAcesso from '@/components/interno/CodigoAcesso'
import { alterarStatusAdminAction } from '@/lib/actions-interno'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Administradores — Interno' }
export const dynamic = 'force-dynamic'

export default async function InternoAdmins() {
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>
  const eu = await getPlatformAdmin()

  const { data } = await db.from('admin_usuario').select('id, email, nome, ativo, created_at, codigo_gerado_em').order('created_at')
  const admins = (data ?? []) as { id: string; email: string; nome: string | null; ativo: boolean; created_at: string; codigo_gerado_em?: string | null }[]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Administradores</h1>
        <p className="page-subtitle">Quem tem acesso a este painel interno</p>
      </div>

      <CodigoAcesso geradoEm={admins.find(a => a.id === eu?.id)?.codigo_gerado_em ?? null} />

      <FormAdmin />

      <div className="table-container">
        <table className="table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th>Desde</th><th /></tr></thead>
          <tbody>
            {admins.map(a => (
              <tr key={a.id}>
                <td className="font-semibold">{a.nome ?? '—'}{a.id === eu?.id && <span className="text-sm text-muted"> (você)</span>}</td>
                <td>{a.email}</td>
                <td><span className={`badge ${a.ativo ? 'badge-ativo' : 'badge-inativo'}`}>{a.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td className="text-sm text-muted">{dataBRFmt(a.created_at)}</td>
                <td>
                  {a.id !== eu?.id && (
                    <BotaoAcao
                      acao={alterarStatusAdminAction.bind(null, a.id, !a.ativo)}
                      confirmar={a.ativo ? `Remover o acesso de ${a.email}?` : undefined}
                    >
                      {a.ativo ? 'Desativar' : 'Reativar'}
                    </BotaoAcao>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
