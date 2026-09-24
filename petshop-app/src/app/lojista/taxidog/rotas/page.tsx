import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { hojeBrasilISO } from '@/lib/agenda'
import { formatarEnderecoLoja } from '@/lib/format'
import { obterContextoLojista } from '@/lib/lojista-context'
import { googleMapsConfigurado } from '@/lib/rotas-mapa'
import { normalizarRota, normalizarTrecho, type Rota } from '@/lib/taxidog-rotas'
import type { TaxiDogOpcao } from '@/lib/taxidog'
import TaxiDogRotas, { type PerfilRotas } from '@/components/lojista/TaxiDogRotas'
import TaxiDogRotaExecucao from '@/components/lojista/TaxiDogRotaExecucao'
import { IconAlert, IconCar, IconKanban } from '@/components/icons'

export const metadata: Metadata = { title: 'TaxiDog — Rotas' }

interface Props {
  searchParams: Promise<{ data?: string; rota?: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Rotas do TaxiDog (migration 053). A gestão (dono, administrador, gestão
// de agendamentos) chega por dentro do Gestor de Agendamentos ("Visualizar
// TaxiDog" → "Rotas do TaxiDog"), monta rotas com qualquer corrida e
// aprova as dos TaxiDogs; o TaxiDog chega por "Minhas rotas" no menu e
// monta as dele. ?rota=... abre a tela da rota (execução).
export default async function RotasTaxiDogPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  const perfil: PerfilRotas = contexto.podeGerenciarAgenda ? 'gestor' : 'taxidog'
  const hojeISO = hojeBrasilISO()
  let data = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : hojeISO
  const idRota = params.rota && UUID_RE.test(params.rota) ? params.rota : null
  const caminho = '/lojista/taxidog/rotas'

  const cabecalho = (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      <div>
        <h1 className="page-title">{perfil === 'taxidog' ? 'Minhas rotas' : 'Rotas do TaxiDog'}</h1>
        <p className="page-subtitle">Junte várias buscas e entregas numa rota só</p>
      </div>
      <Link href={perfil === 'taxidog' ? '/lojista/taxidog' : `/lojista/kanban?visao=taxidog&data=${data}`} className="btn btn-ghost btn-sm">
        <IconKanban style={{ width: 14, height: 14 }} /> {perfil === 'taxidog' ? 'Minhas corridas' : 'Corridas do TaxiDog'}
      </Link>
    </div>
  )

  if (!contexto.podeGerenciarAgenda && !contexto.podeTaxidog) {
    return (
      <>
        {cabecalho}
        <div className="empty-state card">
          <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para ver as rotas</div>
          <p>Fale com o responsável pelo petshop para liberar o acesso.</p>
        </div>
      </>
    )
  }

  const erroMigration = (mensagem: string) => (
    <>
      {cabecalho}
      <div className="alert alert-error">
        <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
        <span>
          Não foi possível carregar as rotas. Execute as migrations 052_taxidog_rotas.sql e 053_taxidog_kanban_e_rotas.sql se ainda não rodou.
          {process.env.NODE_ENV !== 'production' && ` [DEV: ${mensagem}]`}
        </span>
      </div>
    </>
  )

  // Rota aberta: o dia da página vira o dela (as corridas pra adicionar
  // são desse dia).
  let rotaAberta: Rota | null = null
  if (idRota) {
    const { data: linhas, error } = await supabase.rpc('fn_listar_rotas', { p_data_ini: hojeISO, p_data_fim: hojeISO, p_id_rota: idRota })
    if (error) return erroMigration(error.message)
    const linha = (linhas as Record<string, unknown>[] | null)?.[0]
    rotaAberta = linha ? normalizarRota(linha) : null
    if (rotaAberta) data = rotaAberta.data
  }

  const [lojaRes, configRes, rotasRes, pendentesRes, { data: taxidogs }] = await Promise.all([
    supabase.from('lojista').select('endereco, numero, complemento, bairro, cidade, estado').eq('id_lojista', contexto.idLojista).maybeSingle(),
    supabase.from('taxidog_config').select('taxidog_cria_rotas').eq('id_lojista', contexto.idLojista).maybeSingle(),
    rotaAberta ? Promise.resolve({ data: [], error: null }) : supabase.rpc('fn_listar_rotas', { p_data_ini: data, p_data_fim: data }),
    supabase.rpc('fn_trechos_pendentes', { p_data: data }),
    perfil === 'gestor'
      ? supabase.rpc('fn_taxidogs_publicos', { p_id_lojista: contexto.idLojista })
      : Promise.resolve({ data: [] as TaxiDogOpcao[] }),
  ])

  if (rotasRes.error) return erroMigration(rotasRes.error.message)
  if (pendentesRes.error) return erroMigration(pendentesRes.error.message)

  // Sem a migration 045: só a rua em texto livre.
  const lojaRow = lojaRes.error
    ? (await supabase.from('lojista').select('endereco, cidade, estado').eq('id_lojista', contexto.idLojista).maybeSingle()).data
    : lojaRes.data
  const enderecoLoja = lojaRow ? formatarEnderecoLoja(lojaRow) : ''
  // Sem a coluna (migration 053 não rodou) conta como "precisa aprovar".
  const precisaAprovacao = !(configRes.data as { taxidog_cria_rotas?: boolean } | null)?.taxidog_cria_rotas
  const pendentes = ((pendentesRes.data ?? []) as Record<string, unknown>[]).map(normalizarTrecho)

  if (idRota) {
    return (
      <>
        {cabecalho}
        {rotaAberta ? (
          <TaxiDogRotaExecucao
            rota={rotaAberta}
            perfil={perfil}
            precisaAprovacao={precisaAprovacao}
            hojeISO={hojeISO}
            caminho={caminho}
            enderecoLoja={enderecoLoja}
            pendentes={pendentes}
            taxidogs={(taxidogs ?? []) as TaxiDogOpcao[]}
            googleConfigurado={googleMapsConfigurado()}
          />
        ) : (
          <div className="empty-state card">
            <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
            <div className="empty-state-title">Rota não encontrada</div>
            <p>Ela pode ter sido passada para outro TaxiDog. <Link href={caminho} className="text-accent">Ver as rotas</Link></p>
          </div>
        )}
      </>
    )
  }

  let rotas = ((rotasRes.data ?? []) as Record<string, unknown>[]).map(normalizarRota)
  // O TaxiDog vê só as dele (a gestão que também é TaxiDog vê todas).
  if (perfil === 'taxidog') rotas = rotas.filter(r => r.id_funcionario === user!.id)

  return (
    <>
      {cabecalho}
      <TaxiDogRotas
        perfil={perfil}
        precisaAprovacao={precisaAprovacao}
        data={data}
        hojeISO={hojeISO}
        caminho={caminho}
        rotas={rotas}
        pendentes={pendentes}
        taxidogs={(taxidogs ?? []) as TaxiDogOpcao[]}
        enderecoLoja={enderecoLoja}
        googleConfigurado={googleMapsConfigurado()}
      />
    </>
  )
}
