import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'
import { TAMANHO_PAGINA, dataHoraBR, numeroPagina } from '@/lib/interno-util'
import Paginacao from '@/components/interno/Paginacao'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Registro de ações — Interno' }
export const dynamic = 'force-dynamic'

// O que cada ação gravada em admin_auditoria (migration 088) quer dizer.
const ROTULO: Record<string, string> = {
  'conta.entrar': 'Entrou na conta da loja',
  'conta.sair': 'Voltou da conta da loja',
  'conta.trocar_email': 'Trocou o e-mail da conta',
  'conta.converter': 'Converteu a conta',
  'conta.backup': 'Gerou backup da conta',
  'conta.backup_apagar': 'Apagou um backup',
  'conta.importar': 'Importou um backup na conta',
  'empresa.desativar': 'Desativou a empresa',
  'empresa.reativar': 'Reativou a empresa',
  'empresa.editar': 'Editou os dados da empresa',
  'empresa.criar_demo': 'Criou a conta de demonstração',
  'empresa.popular_demo': 'Atualizou os dados de demonstração',
  'acesso.estender': 'Deu mais dias de acesso',
  'acesso.definir': 'Mudou a data de fim do acesso',
  'acesso.livre': 'Isentou de cobrança',
  'acesso.cobrar': 'Voltou a cobrar',
  'cliente.desativar': 'Desativou o cliente',
  'cliente.reativar': 'Reativou o cliente',
  'admin.adicionar': 'Adicionou administrador',
  'admin.desativar': 'Desativou administrador',
  'admin.reativar': 'Reativou administrador',
}

interface Linha {
  id: string
  email_admin: string
  acao: string
  alvo_tipo: string | null
  alvo_id: string | null
  detalhes: Record<string, unknown> | null
  created_at: string
}

// Um resumo curto do que mudou (dias dados, e-mail trocado…).
function resumo(l: Linha): string {
  const d = l.detalhes ?? {}
  if (l.acao === 'acesso.estender' && typeof d.dias === 'number') return `+${d.dias} dias`
  if (l.acao === 'acesso.definir' && typeof d.acesso_ate === 'string') return `até ${dataHoraBR(d.acesso_ate)}`
  if (l.acao === 'conta.trocar_email' && typeof d.para === 'string') return `${String(d.de ?? '')} → ${d.para}`
  if (l.acao === 'admin.adicionar' && typeof d.email === 'string') return d.email
  if (l.acao === 'conta.converter' && typeof d.para === 'string') return `${d.de === 'sem' ? 'sem perfil' : d.de === 'lojista' ? 'loja' : 'cliente'} → ${d.para === 'lojista' ? 'loja' : 'cliente'}${d.erro ? ' (não terminou)' : ''}${d.backup ? ' · com backup' : ''}`
  if (l.acao === 'conta.importar' && d.origem && typeof d.origem === 'object') return `de ${String((d.origem as { nome?: string }).nome ?? '')}`
  return ''
}

export default async function InternoRegistro({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const sp = await searchParams
  const db = createAdminClient()
  if (!db) return <div className="alert alert-error"><span>SUPABASE_SERVICE_ROLE_KEY não configurada.</span></div>
  const pagina = numeroPagina(sp.pagina)

  const { data, count, error } = await db
    .from('admin_auditoria')
    .select('id, email_admin, acao, alvo_tipo, alvo_id, detalhes, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((pagina - 1) * TAMANHO_PAGINA, pagina * TAMANHO_PAGINA - 1)
  const linhas = (data ?? []) as Linha[]

  // Nomes das lojas, clientes e administradores da página, numa consulta cada.
  // Backup/conversão gravam o tipo do perfil (cliente/lojista) ou "conta".
  const ids = (tipo: string) => [...new Set(linhas.filter(l => l.alvo_tipo === tipo && l.alvo_id).map(l => l.alvo_id as string))]
  const [lojas, clientes, admins] = await Promise.all([
    ids('lojista').length ? db.from('lojista').select('id_lojista, nome_loja').in('id_lojista', ids('lojista')) : Promise.resolve({ data: [] }),
    ids('cliente').length ? db.from('cliente').select('id_cliente, nome').in('id_cliente', ids('cliente')) : Promise.resolve({ data: [] }),
    ids('admin').length ? db.from('admin_usuario').select('id, email').in('id', ids('admin')) : Promise.resolve({ data: [] }),
  ])
  const nomes = new Map<string, string>([
    ...((lojas.data ?? []) as { id_lojista: string; nome_loja: string }[]).map(x => [x.id_lojista, x.nome_loja] as [string, string]),
    ...((clientes.data ?? []) as { id_cliente: string; nome: string }[]).map(x => [x.id_cliente, x.nome] as [string, string]),
    ...((admins.data ?? []) as { id: string; email: string }[]).map(x => [x.id, x.email] as [string, string]),
  ])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Registro de ações</h1>
        <p className="page-subtitle">Tudo o que a equipe fez por este painel, do mais recente ao mais antigo</p>
      </div>

      {error ? (
        <div className="alert alert-error"><span>Não foi possível ler o registro. Execute a migration 088_teste_30_dias_e_auditoria_interna.sql se ainda não rodou.</span></div>
      ) : linhas.length === 0 ? (
        <div className="empty-state card"><div className="empty-state-title">Nenhuma ação registrada ainda</div></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Quando</th><th>Quem</th><th>O que fez</th><th>Em quem</th></tr></thead>
            <tbody>
              {linhas.map(l => {
                const nome = l.alvo_id ? nomes.get(l.alvo_id) ?? '—' : '—'
                const extra = resumo(l)
                return (
                  <tr key={l.id}>
                    <td className="text-sm" style={{ whiteSpace: 'nowrap' }}>{dataHoraBR(l.created_at)}</td>
                    <td className="text-sm">{l.email_admin}</td>
                    <td>
                      <div>{ROTULO[l.acao] ?? l.acao}</div>
                      {extra && <div className="text-sm text-muted">{extra}</div>}
                    </td>
                    <td>
                      {l.acao.startsWith('conta.') && l.alvo_id
                        // Conversão e backup: a página da conta (a loja/o cliente de antes pode nem existir mais).
                        ? <Link href={`${ROTA_INTERNA}/contas/${l.alvo_id}`} className="font-semibold">{nome === '—' ? 'Ver a conta' : nome}</Link>
                        : l.alvo_tipo === 'lojista' && l.alvo_id
                          ? <Link href={`${ROTA_INTERNA}/empresas/${l.alvo_id}`} className="font-semibold">{nome}</Link>
                          : nome}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Paginacao base={`${ROTA_INTERNA}/registro`} params={{}} pagina={pagina} total={count ?? 0} tamanho={TAMANHO_PAGINA} />
    </>
  )
}
