import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { IconAlert } from '@/components/icons'
import PetsList, { type PetLinha } from '@/components/lojista/PetsList'
import type { ClienteBasico, PetParaEditar } from '@/components/lojista/PetFormModal'

export const metadata: Metadata = { title: 'Pets — Lojista' }

const PAGE_SIZE = 20
const ESPECIES_VALIDAS = ['Cão', 'Gato']
const PORTES_VALIDOS = ['Pequeno', 'Médio', 'Grande']

interface Props {
  searchParams: Promise<{
    busca?: string
    especie?: string
    porte?: string
    pagina?: string
    editar?: string
  }>
}

export default async function PetsLojistaPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const lojistaId = user!.id

  const busca = params.busca?.trim() ?? ''
  const especie = ESPECIES_VALIDAS.includes(params.especie ?? '') ? params.especie! : ''
  const porte = PORTES_VALIDOS.includes(params.porte ?? '') ? params.porte! : ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)

  // Duas consultas independentes — disparadas juntas. A busca/paginação
  // roda inteira dentro do Postgres (fn_buscar_pets_lojista, migration
  // 018): nome do pet, nome do tutor e raça, tudo com ILIKE no banco —
  // nunca carrega a lista inteira pro navegador pra filtrar em JS.
  const [petsRes, clientesRes] = await Promise.all([
    supabase.rpc('fn_buscar_pets_lojista', {
      p_id_lojista: lojistaId,
      p_busca: busca || null,
      p_especie: especie || null,
      p_porte: porte || null,
      p_limit: PAGE_SIZE,
      p_offset: (pagina - 1) * PAGE_SIZE,
    }),
    // Só os campos que o seletor de tutor precisa (nome/telefone) — não
    // carrega os pets de cada cliente aqui, isso já vem na própria lista.
    supabase
      .from('cliente_lojista')
      .select('cliente:id_cliente ( id_cliente, nome, telefone )')
      .eq('id_lojista', lojistaId),
  ])

  if (petsRes.error) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Pets</h1>
          <p className="page-subtitle">Gerencie os pets cadastrados na sua loja.</p>
        </div>
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar os pets agora.{' '}
            {process.env.NODE_ENV !== 'production' && `[DEV: ${petsRes.error.message}]`}
            {' '}Execute a migration 018_pets_lojista.sql se ainda não rodou, e tente novamente.
          </span>
        </div>
      </>
    )
  }

  const rows = (petsRes.data ?? []) as unknown as Array<{
    id_pet: string
    nome: string
    especie: 'Cão' | 'Gato' | null
    porte: 'Pequeno' | 'Médio' | 'Grande' | null
    raca: string
    sexo: 'Macho' | 'Fêmea'
    dt_nasc: string
    peso: number | null
    obs: string | null
    id_cliente: string
    nome_cliente: string
    telefone_cliente: string
    created_at: string
    total_count: number
  }>

  const pets: PetLinha[] = rows.map(r => ({
    id_pet: r.id_pet,
    nome: r.nome,
    especie: r.especie,
    porte: r.porte,
    raca: r.raca,
    sexo: r.sexo,
    dt_nasc: r.dt_nasc,
    peso: r.peso,
    obs: r.obs,
    id_cliente: r.id_cliente,
    nome_cliente: r.nome_cliente,
    telefone_cliente: r.telefone_cliente,
    created_at: r.created_at,
  }))
  const total = rows[0]?.total_count ?? 0

  const clientes: ClienteBasico[] = ((clientesRes.data ?? []) as unknown as Array<{
    cliente: ClienteBasico | null
  }>)
    .map(v => v.cliente)
    .filter((c): c is ClienteBasico => !!c)
    .sort((a, b) => a.nome.localeCompare(b.nome))

  // ?editar=<id> (vem da tela de detalhe do pet) — busca o pet específico
  // direto, independente do filtro/página atual da listagem, pra abrir o
  // modal de edição já preenchido mesmo que esse pet não esteja na
  // página visível agora.
  let petParaEditarInicial: PetParaEditar | null = null
  if (params.editar) {
    const { data: petRow } = await supabase
      .from('pet')
      .select(`
        id_pet, nome, raca, sexo, especie, porte, dt_nasc, peso, obs,
        cliente:id_cliente ( id_cliente, nome, telefone )
      `)
      .eq('id_pet', params.editar)
      .maybeSingle()

    if (petRow) {
      const c = petRow.cliente as unknown as { id_cliente: string; nome: string; telefone: string } | null
      if (c) {
        petParaEditarInicial = {
          id_pet: petRow.id_pet,
          nome: petRow.nome,
          raca: petRow.raca,
          sexo: petRow.sexo,
          especie: petRow.especie,
          porte: petRow.porte,
          dt_nasc: petRow.dt_nasc,
          peso: petRow.peso,
          obs: petRow.obs,
          id_cliente: c.id_cliente,
          nome_cliente: c.nome,
        }
      }
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Pets</h1>
        <p className="page-subtitle">Gerencie os pets cadastrados na sua loja.</p>
      </div>

      <PetsList
        pets={pets}
        total={total}
        pagina={pagina}
        pageSize={PAGE_SIZE}
        busca={busca}
        filtroEspecie={especie}
        filtroPorte={porte}
        clientes={clientes}
        petParaEditarInicial={petParaEditarInicial}
      />
    </>
  )
}
