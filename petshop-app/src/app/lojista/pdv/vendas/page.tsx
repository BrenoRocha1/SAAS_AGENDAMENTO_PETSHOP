import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { obterContextoLojista } from '@/lib/lojista-context'
import PdvVendas from '@/components/lojista/PdvVendas'
import { agoraBrasil, hojeBrasilISO } from '@/lib/agenda'
import { subDays, format } from 'date-fns'
import type { VendaHistorico } from '@/lib/pdv'
import type { FormaPagamento } from '@/lib/pagamento'
import { IconAlert, IconChevronLeft } from '@/components/icons'
import type { Metadata } from 'next'
import '../pdv.css'

export const metadata: Metadata = { title: 'Vendas do caixa' }

const LIMITE_VENDAS = 300
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

interface Props {
  searchParams: Promise<{ de?: string; ate?: string }>
}

const dataValida = (s: string | undefined): s is string =>
  !!s && DATA_RE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00-03:00`))

export default async function PdvVendasPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)

  if (!contexto) return null

  if (!contexto.podeGerenciarProdutos) {
    return (
      <div className="empty-state card">
        <IconAlert style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
        <div className="empty-state-title">Sem permissão para ver as vendas do caixa</div>
        <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
      </div>
    )
  }

  const hoje = hojeBrasilISO()
  let de = dataValida(params.de) ? params.de : hoje
  let ate = dataValida(params.ate) ? params.ate : de
  if (de > ate) [de, ate] = [ate, de]
  if (ate > hoje) ate = hoje
  if (de > ate) de = ate
  // No máximo 1 ano por consulta.
  const limiteInferior = format(subDays(agoraBrasil(), 366), 'yyyy-MM-dd')
  if (de < limiteInferior) de = limiteInferior

  const inicio = `${de}T00:00:00-03:00`
  // Brasil não tem horário de verão desde 2019: o dia seguinte é +24h.
  const fim = new Date(Date.parse(`${ate}T00:00:00-03:00`) + 24 * 60 * 60 * 1000).toISOString()

  const vendasRes = await supabase
    .from('venda')
    .select('id_venda, numero, created_at, cliente_nome, subtotal, desconto, total, forma_pagamento, valor_recebido, troco, status, operador_nome, cancelada_em, cancelada_motivo')
    .eq('id_lojista', contexto.idLojista)
    .gte('created_at', inicio)
    .lt('created_at', fim)
    .order('created_at', { ascending: false })
    .limit(LIMITE_VENDAS)

  if (vendasRes.error) {
    return (
      <div className="alert alert-error">
        <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
        <span>
          Não foi possível carregar as vendas agora. Execute a migration 083_pdv.sql se ainda não rodou, e tente novamente.
          {process.env.NODE_ENV !== 'production' && ` [DEV: ${vendasRes.error.message}]`}
        </span>
      </div>
    )
  }

  const linhas = vendasRes.data ?? []

  // Itens em lotes (uma URL gigante com centenas de ids estoura o limite do PostgREST).
  const ids = linhas.map(v => v.id_venda as string)
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += 40) lotes.push(ids.slice(i, i + 40))
  const itensRes = await Promise.all(
    lotes.map(lote =>
      supabase
        .from('venda_item')
        .select('id_item, id_venda, produto_nome, unidade_venda, quantidade, preco_unitario, subtotal')
        .in('id_venda', lote)
        .order('produto_nome')
    )
  )
  const itensPorVenda = new Map<string, VendaHistorico['itens']>()
  for (const r of itensRes) {
    for (const i of r.data ?? []) {
      const lista = itensPorVenda.get(i.id_venda) ?? []
      lista.push({
        id_item: i.id_item,
        produto_nome: i.produto_nome,
        unidade_venda: i.unidade_venda,
        quantidade: Number(i.quantidade),
        preco_unitario: Number(i.preco_unitario),
        subtotal: Number(i.subtotal),
      })
      itensPorVenda.set(i.id_venda, lista)
    }
  }

  const vendas: VendaHistorico[] = linhas.map(v => ({
    id_venda: v.id_venda,
    numero: Number(v.numero),
    created_at: v.created_at,
    cliente_nome: v.cliente_nome,
    subtotal: Number(v.subtotal),
    desconto: Number(v.desconto),
    total: Number(v.total),
    forma_pagamento: v.forma_pagamento as FormaPagamento,
    valor_recebido: v.valor_recebido === null ? null : Number(v.valor_recebido),
    troco: v.troco === null ? null : Number(v.troco),
    status: v.status,
    operador_nome: v.operador_nome,
    cancelada_em: v.cancelada_em,
    cancelada_motivo: v.cancelada_motivo,
    itens: itensPorVenda.get(v.id_venda) ?? [],
  }))

  const agora = agoraBrasil()
  const presets = [
    { rotulo: 'Hoje', de: hoje, ate: hoje },
    { rotulo: 'Ontem', de: format(subDays(agora, 1), 'yyyy-MM-dd'), ate: format(subDays(agora, 1), 'yyyy-MM-dd') },
    { rotulo: '7 dias', de: format(subDays(agora, 6), 'yyyy-MM-dd'), ate: hoje },
    { rotulo: '30 dias', de: format(subDays(agora, 29), 'yyyy-MM-dd'), ate: hoje },
  ]

  return (
    <>
      <div className="pdv-cabecalho">
        <div className="page-header" style={{ margin: 0 }}>
          <h1 className="page-title">Vendas do caixa</h1>
          <p className="page-subtitle">Histórico das vendas de balcão</p>
        </div>
        <Link href="/lojista/pdv" className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <IconChevronLeft style={{ width: 16, height: 16 }} /> Voltar ao caixa
        </Link>
      </div>

      <PdvVendas
        // Recria o componente (e seu estado local) a cada novo filtro.
        key={`${de}_${ate}`}
        vendas={vendas}
        de={de}
        ate={ate}
        hoje={hoje}
        presets={presets}
        podeCancelar={contexto.role === 'lojista' || contexto.acessoTotal}
        truncado={linhas.length >= LIMITE_VENDAS}
      />
    </>
  )
}
