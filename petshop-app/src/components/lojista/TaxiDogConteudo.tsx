import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { ContextoLojista } from '@/lib/lojista-context'
import { normalizarCorrida } from '@/lib/taxidog'
import TaxiDogPainel from '@/components/lojista/TaxiDogPainel'
import { IconAlert, IconCar } from '@/components/icons'

// Corpo da tela de corridas (sem o cabeçalho), usado em dois lugares:
//   • dentro do Kanban (/lojista/kanban?visao=taxidog) — dono e equipe
//     com agenda, que veem todas as corridas da loja;
//   • em /lojista/taxidog — "Minhas corridas" do funcionário que só é
//     TaxiDog (vê as dele + as ainda sem TaxiDog, migration 046).
// `caminho` é pra onde a navegação por dia leva (?data=...).
export default async function TaxiDogConteudo({ contexto, data, hojeISO, caminho }: {
  contexto: ContextoLojista
  data: string
  hojeISO: string
  caminho: string
}) {
  const supabase = await createClient()
  const modoMotorista = !contexto.podeGerenciarAgenda && contexto.podeTaxidog
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
      <div className="alert alert-error">
        <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
        <span>
          Não foi possível carregar as corridas. Execute a migration 042_taxidog.sql se ainda não rodou.
          {process.env.NODE_ENV !== 'production' && ` [DEV: ${corridasRes.error.message}]`}
        </span>
      </div>
    )
  }

  const corridas = ((corridasRes.data ?? []) as Record<string, unknown>[]).map(normalizarCorrida)

  return (
    <>
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
        data={data}
        hojeISO={hojeISO}
        caminho={caminho}
        corridas={corridas}
        taxidogs={(taxidogs ?? []) as { id_funcionario: string; nome: string }[]}
        podeAtribuir={podeAtribuir}
        podeAssumir={contexto.podeTaxidog}
        modoMotorista={modoMotorista}
      />
    </>
  )
}
