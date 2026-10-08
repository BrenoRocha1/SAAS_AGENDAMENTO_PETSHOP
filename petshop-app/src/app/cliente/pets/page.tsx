import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import Link from 'next/link'
import { differenceInDays, differenceInMonths, differenceInYears } from 'date-fns'
import PetCard from '@/components/cliente/PetCard'
import { IconPlus } from '@/components/icons'
import type { Metadata } from 'next'
import Ilustracao from '@/components/Ilustracao'

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

// "3 anos", "1 ano", "5 meses", "20 dias" — a idade a partir do nascimento
// (curta, para caber na linha do card).
function idadeDoPet(nascimento: string): string {
  const hoje = new Date()
  const n = new Date(`${nascimento.slice(0, 10)}T12:00:00`)
  const anos = differenceInYears(hoje, n)
  if (anos >= 1) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`
  const meses = differenceInMonths(hoje, n)
  if (meses >= 1) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`
  const dias = differenceInDays(hoje, n)
  return dias < 1 ? 'recém-nascido' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`
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

  // Em ordem de nome, como no app.
  const listaPets = ((pets ?? []) as PetRow[]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // Os pets em cards com a foto em cima (o mesmo card da tela de Pets da
  // loja) — a mesma grade na tela grande e no celular.
  const grade = (
    <div className="pets-grade">
      {listaPets.map(pet => <PetCard key={pet.id_pet} pet={pet} idade={idadeDoPet(pet.dt_nasc)} />)}
    </div>
  )

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
            <Ilustracao nome="pets" altura={110} style={{ marginBottom: 0 }} />
            <strong>Nenhum pet cadastrado</strong>
            <span>Cadastre o seu pet para poder agendar.</span>
          </div>
        ) : grade}
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
          <Ilustracao nome="pets" />
          <div className="empty-state-title">Nenhum pet cadastrado ainda</div>
          <p style={{ marginBottom: 'var(--space-5)' }}>
            Cadastre seu primeiro pet para começar a agendar serviços
          </p>
          <Link href="/cliente/pets/novo" className="btn btn-primary">
            Cadastrar meu pet
          </Link>
        </div>
      ) : grade}
      </div>
    </>
  )
}
