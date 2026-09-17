import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EditarPetForm from '@/components/cliente/EditarPetForm'
import PetFotoUpload from '@/components/cliente/PetFotoUpload'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Editar Pet' }

export default async function EditarPetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: pet } = await supabase
    .from('pet')
    .select('*')
    .eq('id_pet', id)
    .eq('id_cliente', user!.id)
    .maybeSingle()

  if (!pet) redirect('/cliente/pets')

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Editar Pet</h1>
        <p className="page-subtitle">Atualize as informações de {pet.nome}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <PetFotoUpload idPet={pet.id_pet} fotoUrlInicial={pet.foto_url} />
        <EditarPetForm pet={pet} />
      </div>
    </>
  )
}
