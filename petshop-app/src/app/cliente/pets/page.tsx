import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import Link from 'next/link'
import { differenceInYears } from 'date-fns'
import PetCard from '@/components/cliente/PetCard'
import { IconChevronRight, IconDog, IconPaw, IconPlus } from '@/components/icons'
import { iniciais } from '@/lib/format'
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
  especie?: string | null
  porte?: string | null
}

export default async function PetsPage() {
  const supabase = await createClient()
  const user = await obterUsuario()

  const { data: pets } = await supabase
    .from('pet')
    .select('*')
    .eq('id_cliente', user!.id)
    .eq('ativo', true)
    .order('created_at', { ascending: false })

  const listaPets = (pets ?? []) as PetRow[]

  return (
    <>
      {/* Celular (até 768px): a mesma tela "Meus pets" do app. */}
      <div className="so-celular tela-app">
        <div className="tela-app-titulo">
          <h1>Meus pets</h1>
          <Link href="/cliente/pets/novo" className="tela-app-novo">
            <IconPlus style={{ width: 18, height: 18 }} /> Novo
          </Link>
        </div>

        {!listaPets.length ? (
          <div className="dash-app-vazio">
            <span className="dash-app-vazio-icone"><IconPaw style={{ width: 26, height: 26 }} /></span>
            <strong>Nenhum pet cadastrado</strong>
            <span>Cadastre o seu pet para poder agendar.</span>
          </div>
        ) : (
          <div className="dash-app-lista">
            {[...listaPets].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(pet => (
              <Link key={pet.id_pet} href={`/cliente/pets/${pet.id_pet}/editar`} className="dash-app-linha">
                <span className="tela-app-avatar is-52" style={pet.foto_url ? { backgroundImage: `url(${pet.foto_url})` } : undefined}>
                  {!pet.foto_url && iniciais(pet.nome)}
                </span>
                <span className="dash-app-linha-info">
                  <span className="dash-app-linha-pet">{pet.nome}</span>
                  <span className="dash-app-linha-sub is-media">{[pet.especie, pet.raca, pet.porte].filter(Boolean).join(' • ')}</span>
                </span>
                <IconChevronRight className="tela-app-seta" style={{ width: 18, height: 18 }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="so-desktop">
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
      </div>
    </>
  )
}
