import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { IconAlert } from '@/components/icons'
import { obterContextoLojista } from '@/lib/lojista-context'
import ClientesList, { type ClienteLinha } from '@/components/lojista/ClientesList'
import type { ClienteParaEditar } from '@/components/lojista/ClienteFormModal'

export const metadata: Metadata = { title: 'Clientes' }

const PAGE_SIZE = 20

interface Props {
  searchParams: Promise<{ busca?: string; pagina?: string; editar?: string }>
}

export default async function ClientesLojistaPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null
  if (!contexto.podeGerenciarClientesPets) {
    return (
      <div className="empty-state card">
        <IconAlert style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Sem permissão para ver clientes</div>
        <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
      </div>
    )
  }
  // Só o lojista de verdade ou um administrador (acesso_total) pode
  // criar/editar/excluir — quem só tem "gerenciar clientes e pets" apenas
  // visualiza, conforme pedido.
  const podeEditar = contexto.role === 'lojista' || contexto.acessoTotal
  const lojistaId = contexto.idLojista

  const busca = params.busca?.trim() ?? ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)

  // Busca + paginação inteiras no Postgres (fn_buscar_clientes_lojista,
  // migration 019) — antes a página buscava agendamento + cliente_lojista
  // por inteiro e agrupava em JS, sem busca nem limite nenhum.
  const { data: rows, error } = await supabase.rpc('fn_buscar_clientes_lojista', {
    p_id_lojista: lojistaId,
    p_busca: busca || null,
    p_limit: PAGE_SIZE,
    p_offset: (pagina - 1) * PAGE_SIZE,
  })

  if (error) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Clientes do seu petshop</p>
        </div>
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar os clientes agora.{' '}
            {process.env.NODE_ENV !== 'production' && `[DEV: ${error.message}]`}
            {' '}Execute a migration 019_clientes_lojista.sql se ainda não rodou, e tente novamente.
          </span>
        </div>
      </>
    )
  }

  const linhas = (rows ?? []) as unknown as Array<{
    id_cliente: string
    nome: string
    telefone: string
    email: string
    qtd_pets: number
    pets_resumo: string[] | null
    qtd_agendamentos: number
    total_count: number
  }>

  const clientes: ClienteLinha[] = linhas.map(r => ({
    id_cliente: r.id_cliente,
    nome: r.nome,
    telefone: r.telefone,
    email: r.email,
    qtdPets: r.qtd_pets,
    petsResumo: r.pets_resumo ?? [],
    qtdAgendamentos: r.qtd_agendamentos,
  }))
  const total = linhas[0]?.total_count ?? 0

  // ?editar=<id> (vem do perfil do cliente) — busca esse cliente específico
  // direto, independente da busca/página atual da listagem.
  let clienteParaEditarInicial: ClienteParaEditar | null = null
  if (params.editar) {
    const { data: clienteRow } = await supabase
      .from('cliente')
      .select('id_cliente, nome, telefone')
      .eq('id_cliente', params.editar)
      .maybeSingle()
    if (clienteRow) clienteParaEditarInicial = clienteRow
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <p className="page-subtitle">Clientes do seu petshop</p>
      </div>

      <ClientesList
        clientes={clientes}
        total={total}
        pagina={pagina}
        pageSize={PAGE_SIZE}
        busca={busca}
        clienteParaEditarInicial={clienteParaEditarInicial}
        podeEditar={podeEditar}
      />
    </>
  )
}
