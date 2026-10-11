import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { ContextoLojista } from '@/lib/lojista-context'
import { normalizarCorrida } from '@/lib/taxidog'
import TaxiDogPainel, { type RotaDaCorrida } from '@/components/lojista/TaxiDogPainel'
import { IconAlert, IconCar } from '@/components/icons'

// Corpo do Kanban de corridas (sem o cabeçalho), usado em dois lugares:
//   • dentro do Kanban (/lojista/kanban?visao=taxidog) — dono e equipe
//     com agenda, que veem todas as corridas da loja;
//   • em /lojista/taxidog — "Minhas corridas" do funcionário que só é
//     TaxiDog (vê as dele + as ainda sem TaxiDog, migration 046).
// Corrida que está numa rota aparece com "Rota #N" e anda pela rota
// (página /lojista/taxidog/rotas, migration 053).
// `caminho` é pra onde a navegação por dia leva (?data=...).
export default async function TaxiDogConteudo({ contexto, data, hojeISO, caminho, motorista, idUsuario }: {
  contexto: ContextoLojista
  data: string
  hojeISO: string
  caminho: string
  // "Minhas corridas": vale também para quem gerencia a agenda E é TaxiDog.
  motorista?: boolean
  idUsuario?: string
}) {
  const supabase = await createClient()
  const modoMotorista = motorista ?? (!contexto.podeGerenciarAgenda && contexto.podeTaxidog)
  // Em "Minhas corridas" ninguém distribui corridas: só pega as livres.
  const podeAtribuir = contexto.podeGerenciarAgenda && !modoMotorista
  const podeConfigurar = contexto.role === 'lojista' || contexto.acessoTotal

  const [corridasRes, configRes, { data: taxidogs }] = await Promise.all([
    supabase.rpc('fn_listar_corridas', { p_data_ini: data, p_data_fim: data }),
    supabase.from('taxidog_config').select('ativo').eq('id_lojista', contexto.idLojista).maybeSingle(),
    podeAtribuir
      ? supabase.rpc('fn_taxidogs_publicos', { p_id_lojista: contexto.idLojista })
      : Promise.resolve({ data: [] as { id_funcionario: string; nome: string }[] }),
  ])

  if (corridasRes.error) {
    return (
      <div className="alert alert-error">
        <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
        <span>
          Não foi possível carregar as corridas. Execute a migration 042_taxidog.sql se ainda não rodou.
          {process.env.NODE_ENV !== 'production' && ` [DEV: ${corridasRes.error.message}]`}
        </span>
      </div>
    )
  }

  let corridas = ((corridasRes.data ?? []) as Record<string, unknown>[]).map(normalizarCorrida)
  // Quem gerencia a agenda recebe todas as corridas da loja do banco; em
  // "Minhas corridas" ficam só as dele e as ainda sem TaxiDog, como para
  // um TaxiDog comum.
  if (modoMotorista && contexto.podeGerenciarAgenda && idUsuario) {
    corridas = corridas.filter(c => !c.id_funcionario || c.id_funcionario === idUsuario)
  }

  // Em qual rota ativa cada corrida ainda tem parada por fazer. Tolerante:
  // sem a migration 052 a tabela não existe e nenhuma aparece em rota.
  const rotaPorCorrida: Record<string, RotaDaCorrida> = {}
  if (corridas.length > 0) {
    const { data: itens } = await supabase
      .from('taxidog_parada_item')
      .select('id_corrida, id_rota, rota:id_rota ( numero, status )')
      .eq('feito', false)
      .in('id_corrida', corridas.map(c => c.id_corrida))
    for (const i of (itens ?? []) as unknown as { id_corrida: string; id_rota: string; rota: { numero: number; status: string } | null }[]) {
      if (!i.rota || i.rota.status === 'concluida' || i.rota.status === 'cancelada') continue
      rotaPorCorrida[i.id_corrida] = { id_rota: i.id_rota, numero: i.rota.numero }
    }
  }

  return (
    <>
      {!configRes.data?.ativo && !modoMotorista && (
        <div className="alert alert-info" style={{ marginBottom: 'var(--space-5)' }}>
          <IconCar style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            O TaxiDog está desativado — novos clientes não conseguem pedir.{' '}
            {podeConfigurar && <Link href="/lojista/configuracoes/taxidog" className="text-accent">Configurar TaxiDog</Link>}
          </span>
        </div>
      )}
      <TaxiDogPainel
        data={data}
        hojeISO={hojeISO}
        caminho={caminho}
        caminhoRotas="/lojista/taxidog/rotas"
        corridas={corridas}
        rotaPorCorrida={rotaPorCorrida}
        taxidogs={(taxidogs ?? []) as { id_funcionario: string; nome: string }[]}
        podeAtribuir={podeAtribuir}
        podeAssumir={contexto.podeTaxidog}
        modoMotorista={modoMotorista}
      />
    </>
  )
}
