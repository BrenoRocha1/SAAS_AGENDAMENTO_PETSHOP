import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { hojeBrasilISO } from '@/lib/agenda'
import { obterContextoLojista } from '@/lib/lojista-context'
import { normalizarCorrida } from '@/lib/taxidog'
import TaxiDogPainel from '@/components/lojista/TaxiDogPainel'
import { IconAlert, IconCar } from '@/components/icons'

export const metadata: Metadata = { title: 'TaxiDog — Corridas' }

interface Props {
  searchParams: Promise<{ data?: string }>
}

export default async function TaxiDogPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  // Quem gerencia a agenda vê todas as corridas da loja; quem só tem a
  // função TaxiDog vê as dele + as ainda sem TaxiDog (fn_listar_corridas
  // já filtra assim, migration 046): pode assumir uma disponível e avançar
  // as etapas das dele, mas não atribuir a outro nem cancelar.
  const modoMotorista = !contexto.podeGerenciarAgenda && contexto.podeTaxidog

  const cabecalho = (
    <div className="page-header">
      <h1 className="page-title">{modoMotorista ? 'Minhas corridas' : 'TaxiDog'}</h1>
      <p className="page-subtitle">
        {modoMotorista ? 'Pegue as corridas disponíveis e acompanhe as suas' : 'Corridas de busca e entrega dos pets'}
      </p>
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

  const hojeISO = hojeBrasilISO()
  const data = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO
  const podeAtribuir = contexto.role === 'lojista' || contexto.acessoTotal

  const [corridasRes, configRes, { data: taxidogs }] = await Promise.all([
    supabase.rpc('fn_listar_corridas', { p_data_ini: data, p_data_fim: data }),
    supabase.from('taxidog_config').select('ativo').eq('id_lojista', contexto.idLojista).maybeSingle(),
    podeAtribuir
      ? supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', contexto.idLojista).eq('ativo', true).eq('pode_taxidog', true).order('nome')
      : Promise.resolve({ data: [] as { id_funcionario: string; nome: string }[] }),
  ])

  if (corridasRes.error) {
    return (
      <>
        {cabecalho}
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar as corridas. Execute a migration 042_taxidog.sql se ainda não rodou.
            {process.env.NODE_ENV !== 'production' && ` [DEV: ${corridasRes.error.message}]`}
          </span>
        </div>
      </>
    )
  }

  const corridas = ((corridasRes.data ?? []) as Record<string, unknown>[]).map(normalizarCorrida)

  return (
    <>
      {cabecalho}
      {!configRes.data?.ativo && !modoMotorista && (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-5)' }}>
          <IconCar style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            O TaxiDog está desativado — novos clientes não conseguem pedir.{' '}
            {podeAtribuir && <Link href="/lojista/configuracoes/taxidog" className="text-accent">Configurar TaxiDog</Link>}
          </span>
        </div>
      )}
      <TaxiDogPainel
        idLojista={contexto.idLojista}
        data={data}
        hojeISO={hojeISO}
        corridas={corridas}
        taxidogs={(taxidogs ?? []) as { id_funcionario: string; nome: string }[]}
        podeAtribuir={podeAtribuir}
        podeAssumir={contexto.podeTaxidog}
        modoMotorista={modoMotorista}
      />
    </>
  )
}
