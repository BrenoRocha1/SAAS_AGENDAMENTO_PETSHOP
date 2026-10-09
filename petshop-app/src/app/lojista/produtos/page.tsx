import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import ProdutosList from '@/components/lojista/ProdutosList'
import { obterContextoLojista } from '@/lib/lojista-context'
import type { Metadata } from 'next'
import type { ProdutoFiscal } from '@/lib/fiscal'
import Ilustracao from '@/components/Ilustracao'

export const metadata: Metadata = { title: 'Produtos' }

export default async function ProdutosPage() {
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarProdutos) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Produtos</h1>
        </div>
        <div className="empty-state card">
          <Ilustracao nome="sem-permissao" />
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
  const [{ data: produtos }, { data: categorias }, custosRes, fiscalRes] = await Promise.all([
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
    // Custo (CMV, migration 062) numa tabela à parte, só da equipe.
    // Tolerante: sem a migration, o campo de custo não aparece.
    supabase
      .from('produto_custo')
      .select('id_produto, custo_unitario')
      .eq('id_lojista', contexto.idLojista),
    // Informações fiscais (migration 094) — também à parte e tolerante.
    supabase
      .from('produto_fiscal')
      .select('id_produto, codigo_barras, ncm, cest, cfop, origem, cst_csosn')
      .eq('id_lojista', contexto.idLojista),
  ])
  const custoPorProduto = new Map(
    ((custosRes.error ? [] : custosRes.data ?? []) as { id_produto: string; custo_unitario: number }[])
      .map(c => [c.id_produto, Number(c.custo_unitario)]),
  )
  const fiscalPorProduto = new Map(
    ((fiscalRes.error ? [] : fiscalRes.data ?? []) as (ProdutoFiscal & { id_produto: string })[])
      .map(({ id_produto, ...f }) => [id_produto, f]),
  )
  // Produto excluído depois de vendido (migration 087) continua no banco
  // pelo histórico, mas não aparece mais aqui. Sem a coluna, ninguém sai.
  const produtosComCusto = (produtos ?? [])
    .filter(p => !p.excluido_em)
    .map(p => ({ ...p, custo_unitario: custoPorProduto.get(p.id_produto) ?? null, fiscal: fiscalPorProduto.get(p.id_produto) ?? null }))

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Produtos</h1>
        <p className="page-subtitle">Cadastre e controle os produtos vendidos pelo seu petshop</p>
      </div>
      <ProdutosList produtos={produtosComCusto} categorias={categorias ?? []} cmvAtivo={!custosRes.error} fiscalAtivo={!fiscalRes.error} />
    </>
  )
}
