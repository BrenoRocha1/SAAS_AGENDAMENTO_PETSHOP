import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { obterContextoLojista } from '@/lib/lojista-context'
import PdvCaixa from '@/components/lojista/PdvCaixa'
import { normalizarFormasLoja } from '@/lib/pagamento'
import { hojeBrasilISO } from '@/lib/agenda'
import { formatarReais } from '@/lib/taxidog'
import type { ProdutoPdv } from '@/lib/pdv'
import { IconAlert, IconReceipt } from '@/components/icons'
import type { Metadata } from 'next'
import './pdv.css'

export const metadata: Metadata = { title: 'Caixa (PDV)' }

export default async function PdvPage() {
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  // O caixa mexe no estoque, então segue a permissão de Produtos.
  if (!contexto.podeGerenciarProdutos) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Caixa</h1>
        </div>
        <div className="empty-state card">
          <IconAlert style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para usar o caixa</div>
          <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
        </div>
      </>
    )
  }

  const hoje = hojeBrasilISO()
  const inicioHoje = `${hoje}T00:00:00-03:00`

  const [produtosRes, categoriasRes, formasRes, lojaRes, hojeRes] = await Promise.all([
    supabase
      .from('produto')
      .select('id_produto, nome, id_categoria, unidade_venda, preco_venda, estoque_atual, estoque_minimo, foto_url')
      .eq('id_lojista', contexto.idLojista)
      .eq('status', 'Ativo')
      .order('nome'),
    supabase
      .from('categoria_produto')
      .select('id_categoria, nome')
      .eq('id_lojista', contexto.idLojista)
      .order('nome'),
    supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: contexto.idLojista }),
    supabase.from('lojista').select('nome_loja').eq('id_lojista', contexto.idLojista).maybeSingle(),
    // Também serve de teste: sem a migration 083 a tabela não existe.
    supabase
      .from('venda')
      .select('total')
      .eq('id_lojista', contexto.idLojista)
      .eq('status', 'concluida')
      .gte('created_at', inicioHoje),
  ])

  if (hojeRes.error) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Caixa</h1>
        </div>
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível abrir o caixa agora. Execute a migration 083_pdv.sql se ainda não rodou, e tente novamente.
            {process.env.NODE_ENV !== 'production' && ` [DEV: ${hojeRes.error.message}]`}
          </span>
        </div>
      </>
    )
  }

  const produtos: ProdutoPdv[] = (produtosRes.data ?? []).map(p => ({
    id_produto: p.id_produto,
    nome: p.nome,
    id_categoria: p.id_categoria,
    unidade_venda: p.unidade_venda,
    preco_venda: Number(p.preco_venda),
    estoque_atual: Number(p.estoque_atual),
    estoque_minimo: Number(p.estoque_minimo),
    foto_url: p.foto_url,
  }))

  const vendasHoje = hojeRes.data ?? []
  const totalHoje = vendasHoje.reduce((s, v) => s + Number(v.total), 0)

  return (
    <>
      <div className="pdv-cabecalho">
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Caixa</h1>
          <p className="page-subtitle">Venda produtos no balcão em poucos toques</p>
        </div>
        <div className="pdv-cabecalho-acoes">
          <span className="pdv-hoje">
            Hoje <strong>{vendasHoje.length} {vendasHoje.length === 1 ? 'venda' : 'vendas'}</strong> · <strong>{formatarReais(totalHoje)}</strong>
          </span>
          <Link href="/lojista/pdv/vendas" className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <IconReceipt style={{ width: 16, height: 16 }} /> Histórico
          </Link>
        </div>
      </div>

      <PdvCaixa
        produtos={produtos}
        categorias={categoriasRes.data ?? []}
        formas={normalizarFormasLoja(formasRes.data)}
        nomeLoja={lojaRes.data?.nome_loja ?? 'Meu Petshop'}
      />
    </>
  )
}
