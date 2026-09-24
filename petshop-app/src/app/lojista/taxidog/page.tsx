import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hojeBrasilISO } from '@/lib/agenda'
import { obterContextoLojista } from '@/lib/lojista-context'
import TaxiDogConteudo from '@/components/lojista/TaxiDogConteudo'
import { IconCar, IconChartBar, IconRoute } from '@/components/icons'

export const metadata: Metadata = { title: 'TaxiDog — Rotas' }

interface Props {
  searchParams: Promise<{ data?: string; rota?: string; visao?: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// "Minhas rotas" do TaxiDog. Dono e equipe com agenda organizam as rotas
// dentro do Kanban ("Visualizar TaxiDog") — esta página só mostra o modo
// da loja quando o Kanban está desativado.
export default async function TaxiDogPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  const hojeISO = hojeBrasilISO()
  const data = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO
  const idRota = params.rota && UUID_RE.test(params.rota) ? params.rota : null
  // TaxiDog que também gerencia a agenda abre "Minhas rotas"; ?visao=loja
  // leva ele pra organização (quando o Kanban está desativado).
  const modo = contexto.podeTaxidog && !(contexto.podeGerenciarAgenda && params.visao === 'loja') ? 'motorista' : 'loja'

  let kanbanAtivo = true
  if (contexto.podeGerenciarAgenda) {
    // Tolerante como o resto: sem a coluna, o Kanban conta como ativado.
    const { data: lojistaRow, error } = await supabase.from('lojista').select('kanban_ativo').eq('id_lojista', contexto.idLojista).maybeSingle()
    kanbanAtivo = error ? true : (lojistaRow?.kanban_ativo ?? true)
    if (modo === 'loja' && kanbanAtivo) redirect(`/lojista/kanban?visao=taxidog&data=${data}`)
  }

  const cabecalho = (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      <div>
        <h1 className="page-title">{modo === 'motorista' ? 'Minhas rotas' : 'TaxiDog'}</h1>
        <p className="page-subtitle">
          {modo === 'motorista' ? 'Suas rotas de busca e entrega, parada a parada' : 'Organize as buscas e entregas em rotas'}
        </p>
      </div>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        {contexto.podeGerenciarAgenda && contexto.podeTaxidog && (
          <Link
            href={modo === 'motorista'
              ? (kanbanAtivo ? `/lojista/kanban?visao=taxidog&data=${data}` : `/lojista/taxidog?visao=loja&data=${data}`)
              : '/lojista/taxidog'}
            className="btn btn-ghost btn-sm"
          >
            <IconRoute style={{ width: 14, height: 14 }} /> {modo === 'motorista' ? 'Organizar rotas' : 'Minhas rotas'}
          </Link>
        )}
        {(contexto.podeGerenciarAgenda || contexto.podeTaxidog) && (
          <Link href="/lojista/taxidog/relatorio" className="btn btn-secondary btn-sm">
            <IconChartBar style={{ width: 14, height: 14 }} /> Relatório de corridas
          </Link>
        )}
      </div>
    </div>
  )

  if (!contexto.podeGerenciarAgenda && !contexto.podeTaxidog) {
    return (
      <>
        {cabecalho}
        <div className="empty-state card">
          <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para acompanhar o TaxiDog</div>
          <p>Fale com o responsável pelo petshop para liberar o acesso.</p>
        </div>
      </>
    )
  }

  return (
    <>
      {cabecalho}
      <TaxiDogConteudo
        contexto={contexto}
        modo={modo}
        data={data}
        hojeISO={hojeISO}
        caminho={modo === 'motorista' ? '/lojista/taxidog' : '/lojista/taxidog?visao=loja'}
        idRota={idRota}
      />
    </>
  )
}
