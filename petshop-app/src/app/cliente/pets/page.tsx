import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { differenceInYears } from 'date-fns'
import PetCard from '@/components/cliente/PetCard'
import { IconDog, IconPlus } from '@/components/icons'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Pets' }

interface PetRow {
  id_pet: string
  nome: string
  raca: string
  sexo: string
  dt_nasc: string
  peso?: number
  obs?: string
  foto_url: string | null
}

export default async function PetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: pets } = await supabase
    .from('pet')
    .select('*')
    .eq('id_cliente', user!.id)
    .eq('ativo', true)
    .order('created_at', { ascending: false })

  const listaPets = (pets ?? []) as PetRow[]

  return (
    <>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Meus Pets</h1>
          <p className="page-subtitle">Gerencie seus animais de estimação</p>
        </div>
        <Link href="/cliente/pets/novo" className="btn btn-primary">
          <IconPlus style={{ width: 15, height: 15 }} /> Cadastrar Pet
        </Link>
      </div>

      {!listaPets.length ? (
        <div className="empty-state card">
          <IconDog style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum pet cadastrado ainda</div>
          <p style={{ marginBottom: 'var(--space-5)' }}>
            Cadastre seu primeiro pet para começar a agendar serviços
          </p>
          <Link href="/cliente/pets/novo" className="btn btn-primary">
            Cadastrar meu pet
          </Link>
        </div>
      ) : (
        <div className="grid-3">
          {listaPets.map(pet => {
            const idade = differenceInYears(new Date(), new Date(pet.dt_nasc))
            return (
              <PetCard
                key={pet.id_pet}
                pet={pet}
                idade={idade}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
