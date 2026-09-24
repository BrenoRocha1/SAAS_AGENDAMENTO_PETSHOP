import Link from 'next/link'
import { addDays, format, parseISO, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { ContextoLojista } from '@/lib/lojista-context'
import { formatarEnderecoLoja } from '@/lib/format'
import { googleMapsConfigurado } from '@/lib/rotas-mapa'
import { normalizarRota, normalizarTrecho } from '@/lib/taxidog-rotas'
import type { TaxiDogOpcao } from '@/lib/taxidog'
import TaxiDogRotasLoja from '@/components/lojista/TaxiDogRotasLoja'
import TaxiDogRotasMotorista from '@/components/lojista/TaxiDogRotasMotorista'
import { IconAlert, IconCar } from '@/components/icons'

// Corpo da tela do TaxiDog (sem o cabeçalho), em dois modos:
//   • 'loja' — dentro do Kanban (/lojista/kanban?visao=taxidog): dono e
//     equipe com agenda organizam as solicitações em rotas;
//   • 'motorista' — /lojista/taxidog, "Minhas rotas" do TaxiDog: as rotas
//     atribuídas a ele e a execução parada a parada.
// `caminho` é pra onde a navegação leva (?data=... / ?rota=...).
export default async function TaxiDogConteudo({ contexto, modo, data, hojeISO, caminho, idRota = null }: {
  contexto: ContextoLojista
  modo: 'loja' | 'motorista'
  data: string
  hojeISO: string
  caminho: string
  idRota?: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const lojaRes = await supabase
    .from('lojista')
    .select('endereco, numero, complemento, bairro, cidade, estado')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()
  const lojaRow = lojaRes.error
    // Sem a migration 045: só a rua em texto livre.
    ? (await supabase.from('lojista').select('endereco, cidade, estado').eq('id_lojista', contexto.idLojista).maybeSingle()).data
    : lojaRes.data
  const enderecoLoja = lojaRow ? formatarEnderecoLoja(lojaRow) : ''

  const erroMigration = (mensagem: string) => (
    <div className="alert alert-error">
      <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
      <span>
        Não foi possível carregar as rotas. Execute a migration 052_taxidog_rotas.sql se ainda não rodou.
        {process.env.NODE_ENV !== 'production' && ` [DEV: ${mensagem}]`}
      </span>
    </div>
  )

  if (modo === 'motorista') {
    // Hoje, próximas duas semanas e o último mês (histórico).
    const ini = format(subDays(parseISO(hojeISO), 30), 'yyyy-MM-dd')
    const fim = format(addDays(parseISO(hojeISO), 14), 'yyyy-MM-dd')
    const rotasRes = await supabase.rpc('fn_listar_rotas', { p_data_ini: ini, p_data_fim: fim })
    if (rotasRes.error) return erroMigration(rotasRes.error.message)
    // Quem também gerencia a agenda recebe todas as rotas da loja — aqui
    // ficam só as dele.
    let rotas = ((rotasRes.data ?? []) as Record<string, unknown>[]).map(normalizarRota).filter(r => r.id_funcionario === user?.id)
    if (idRota && !rotas.some(r => r.id_rota === idRota)) {
      const { data: extra } = await supabase.rpc('fn_listar_rotas', { p_data_ini: hojeISO, p_data_fim: hojeISO, p_id_rota: idRota })
      rotas = [...rotas, ...((extra ?? []) as Record<string, unknown>[]).map(normalizarRota).filter(r => r.id_funcionario === user?.id)]
    }
    return <TaxiDogRotasMotorista rotas={rotas} hojeISO={hojeISO} enderecoLoja={enderecoLoja} idRotaAberta={idRota} caminho={caminho} />
  }

  const [rotasRes, pendentesRes, configRes, { data: taxidogs }] = await Promise.all([
    supabase.rpc('fn_listar_rotas', { p_data_ini: data, p_data_fim: data }),
    supabase.rpc('fn_trechos_pendentes', { p_data: data }),
    supabase.from('taxidog_config').select('ativo').eq('id_lojista', contexto.idLojista).maybeSingle(),
    supabase.rpc('fn_taxidogs_publicos', { p_id_lojista: contexto.idLojista }),
  ])

  if (rotasRes.error) return erroMigration(rotasRes.error.message)
  if (pendentesRes.error) return erroMigration(pendentesRes.error.message)

  const rotas = ((rotasRes.data ?? []) as Record<string, unknown>[]).map(normalizarRota)
  const pendentes = ((pendentesRes.data ?? []) as Record<string, unknown>[]).map(normalizarTrecho)
  const podeConfigurar = contexto.role === 'lojista' || contexto.acessoTotal

  return (
    <>
      {!configRes.data?.ativo && (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-5)' }}>
          <IconCar style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            O TaxiDog está desativado — novos clientes não conseguem pedir.{' '}
            {podeConfigurar && <Link href="/lojista/configuracoes/taxidog" className="text-accent">Configurar TaxiDog</Link>}
          </span>
        </div>
      )}
      <TaxiDogRotasLoja
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
