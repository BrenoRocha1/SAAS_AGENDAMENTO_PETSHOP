import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { differenceInYears } from 'date-fns'
import PetCard from '@/components/cliente/PetCard'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Pets' }

export default async function PetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: pets } = await supabase
    .from('pet')
    .select('*')
    .eq('id_cliente', user!.id)
    .eq('ativo', true)
    .order('created_at', { ascending: false })

  return (
    <>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Meus Pets 🐕</h1>
          <p className="page-subtitle">Gerencie seus animais de estimação</p>
        </div>
        <Link href="/cliente/pets/novo" className="btn btn-primary">
          + Cadastrar Pet
        </Link>
      </div>

      {!pets?.length ? (
        <div className="empty-state card">
          <div className="empty-state-icon">🐾</div>
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
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {pets.map((pet: any) => {
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
