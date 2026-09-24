import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hojeBrasilISO } from '@/lib/agenda'
import { obterContextoLojista } from '@/lib/lojista-context'
import TaxiDogConteudo from '@/components/lojista/TaxiDogConteudo'
import { IconCar, IconChartBar } from '@/components/icons'

export const metadata: Metadata = { title: 'TaxiDog — Corridas' }

interface Props {
  searchParams: Promise<{ data?: string }>
}

// "Minhas corridas" do funcionário que só é TaxiDog. Dono e equipe com
// agenda veem as corridas dentro do Kanban ("Visualizar TaxiDog") — esta
// rota só atende eles quando o Kanban está desativado na loja.
export default async function TaxiDogPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  const modoMotorista = !contexto.podeGerenciarAgenda && contexto.podeTaxidog
  const hojeISO = hojeBrasilISO()
  const data = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO

  if (contexto.podeGerenciarAgenda) {
    // Tolerante como o resto: sem a coluna, o Kanban conta como ativado.
    const { data: lojistaRow, error } = await supabase.from('lojista').select('kanban_ativo').eq('id_lojista', contexto.idLojista).maybeSingle()
    const kanbanAtivo = error ? true : (lojistaRow?.kanban_ativo ?? true)
    if (kanbanAtivo) redirect(`/lojista/kanban?visao=taxidog&data=${data}`)
  }

  const cabecalho = (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      <div>
        <h1 className="page-title">{modoMotorista ? 'Minhas corridas' : 'TaxiDog'}</h1>
        <p className="page-subtitle">
          {modoMotorista ? 'Pegue as corridas disponíveis e acompanhe as suas' : 'Corridas de busca e entrega dos pets'}
        </p>
      </div>
      {(contexto.podeGerenciarAgenda || contexto.podeTaxidog) && (
        <Link href="/lojista/taxidog/relatorio" className="btn btn-secondary btn-sm">
          <IconChartBar style={{ width: 14, height: 14 }} /> Relatório de corridas
        </Link>
      )}
    </div>
  )

  if (!contexto.podeGerenciarAgenda && !contexto.podeTaxidog) {
    return (
      <>
        {cabecalho}
        <div className="empty-state card">
          <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para acompanhar as corridas</div>
          <p>Fale com o responsável pelo petshop para liberar o acesso à agenda.</p>
        </div>
      </>
    )
  }

  return (
    <>
      {cabecalho}
      <TaxiDogConteudo contexto={contexto} data={data} hojeISO={hojeISO} caminho="/lojista/taxidog" />
    </>
  )
}
