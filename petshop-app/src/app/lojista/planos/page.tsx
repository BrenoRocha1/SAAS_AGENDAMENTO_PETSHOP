import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import { hojeBrasilISO } from '@/lib/agenda'
import { formasAtivas, normalizarFormasLoja } from '@/lib/pagamento'
import type { Assinatura, CobrancaDaLoja, HistoricoPlano, Plano } from '@/lib/planos'
import PlanosLista, { type ServicoOpcao } from '@/components/lojista/planos/PlanosLista'
import { AssinaturasLista, CobrancasLista, HistoricoPlanosLista } from '@/components/lojista/planos/PlanosListas'
import { IconAlert } from '@/components/icons'

export const metadata: Metadata = { title: 'Planos — Lojista' }

const ABAS = [
  ['planos', 'Planos'],
  ['assinaturas', 'Assinaturas'],
  ['cobrancas', 'Cobranças'],
  ['historico', 'Histórico'],
] as const
type Aba = typeof ABAS[number][0]
const FILTROS = ['pendentes', 'vencidas', 'pagas', 'canceladas', 'todas']

export default async function PlanosPage({ searchParams }: { searchParams: Promise<{ aba?: string; filtro?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null
  // Planos e cobranças são financeiros: dono ou administrador.
  if (contexto.role === 'funcionario' && !contexto.acessoTotal) {
    return (
      <div className="empty-state card">
        <div className="empty-state-title">Sem permissão para ver planos</div>
        <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
      </div>
    )
  }

  const aba: Aba = (ABAS.map(a => a[0]) as string[]).includes(params.aba ?? '') ? (params.aba as Aba) : 'planos'
  const filtro = FILTROS.includes(params.filtro ?? '') ? params.filtro! : 'pendentes'
  const hojeISO = hojeBrasilISO()

  const planosRes = await supabase.rpc('fn_planos_da_loja')
  const faltaMigration = !!planosRes.error
  const planos = (planosRes.data ?? []) as Plano[]

  let conteudo: React.ReactNode = null
  if (!faltaMigration) {
    if (aba === 'planos') {
      const { data: servicosRaw } = await supabase
        .from('servico')
        .select('id_servico, nome, preco, status')
        .eq('id_lojista', contexto.idLojista)
        .order('nome')
      const servicos: ServicoOpcao[] = ((servicosRaw ?? []) as { id_servico: string; nome: string; preco: number; status: string }[])
        .map(s => ({ id_servico: s.id_servico, nome: s.nome, preco: Number(s.preco), ativo: s.status === 'Ativo' }))
      conteudo = <PlanosLista planos={planos} servicos={servicos} />
    } else if (aba === 'assinaturas') {
      const { data } = await supabase.rpc('fn_assinaturas_da_loja', { p_id_cliente: null, p_detalhes: false })
      conteudo = <AssinaturasLista assinaturas={(data ?? []) as Assinatura[]} />
    } else if (aba === 'cobrancas') {
      const [{ data }, { data: formasRaw }] = await Promise.all([
        supabase.rpc('fn_cobrancas_planos', { p_filtro: filtro, p_data_ini: null, p_data_fim: null }),
        supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: contexto.idLojista }),
      ])
      conteudo = (
        <CobrancasLista
          cobrancas={(data ?? []) as CobrancaDaLoja[]}
          filtro={filtro}
          hojeISO={hojeISO}
          formasAceitas={formasAtivas(normalizarFormasLoja(formasRaw))}
        />
      )
    } else {
      const { data } = await supabase.rpc('fn_historico_planos', { p_limite: 150 })
      conteudo = <HistoricoPlanosLista itens={(data ?? []) as HistoricoPlano[]} />
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Planos</h1>
        <p className="page-subtitle">Planos recorrentes, assinaturas dos clientes e as cobranças de cada período</p>
      </div>

      {faltaMigration ? (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Para usar planos, execute a migration 060_planos_assinaturas.sql.</span>
        </div>
      ) : (
        <>
          <nav className="planos-abas" aria-label="Seções de planos">
            {ABAS.map(([v, l]) => (
              <Link key={v} href={`/lojista/planos?aba=${v}`} className={aba === v ? 'is-ativa' : ''} aria-current={aba === v ? 'page' : undefined}>
                {l}
              </Link>
            ))}
          </nav>
          {conteudo}
        </>
      )}
    </>
  )
}
