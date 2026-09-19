import { createClient } from '@/lib/supabase/server'
import ProdutosList from '@/components/lojista/ProdutosList'
import { obterContextoLojista } from '@/lib/lojista-context'
import { IconPackage } from '@/components/icons'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produtos' }

export default async function ProdutosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarServicos) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Produtos</h1>
        </div>
        <div className="empty-state card">
          <IconPackage style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para gerenciar produtos</div>
          <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
        </div>
      </>
    )
  }

  // Categoria é resolvida no cliente por id_categoria (a partir de
  // `categorias`), em vez de um embed `categoria_produto(nome)` no
  // select — o embed depende do PostgREST reconhecer a FK no cache de
  // schema, e isso já se mostrou frágil logo após rodar a migration.
  // Um select plano não tem essa dependência.
  const [{ data: produtos }, { data: categorias }] = await Promise.all([
    supabase
      .from('produto')
      .select('*')
      .eq('id_lojista', contexto.idLojista)
      .order('nome'),
    supabase
      .from('categoria_produto')
      .select('id_categoria, nome')
      .eq('id_lojista', contexto.idLojista)
      .order('nome'),
  ])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Produtos</h1>
        <p className="page-subtitle">Cadastre e controle os produtos vendidos pelo seu petshop</p>
      </div>
      <ProdutosList produtos={produtos ?? []} categorias={categorias ?? []} />
    </>
  )
}
