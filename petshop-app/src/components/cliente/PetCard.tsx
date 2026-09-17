'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { desativarPetAction } from '@/lib/actions'
import { IconDog, IconPencil, IconTrash } from '@/components/icons'

interface Pet {
  id_pet: string
  nome: string
  raca: string
  sexo: string
  dt_nasc: string
  peso?: number
  obs?: string
  foto_url?: string | null
}

interface Props {
  pet: Pet
  idade: number
}

export default function PetCard({ pet, idade }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await desativarPetAction(pet.id_pet)
      setConfirmDelete(false)
    })
  }

  return (
    <div className="card animate-slide-up" style={{ position: 'relative', overflow: 'visible' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
          paddingBottom: 'var(--space-4)',
          borderBottom: '1px solid var(--gray-800)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 'var(--radius-full)',
            background: 'var(--primary-soft-bg)',
            border: '1px solid var(--primary-soft-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {pet.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
            <img src={pet.foto_url} alt={pet.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <IconDog style={{ width: 24, height: 24, color: 'var(--primary-400)' }} />
          )}
        </div>
        <div>
          <h4 style={{ marginBottom: 2 }}>{pet.nome}</h4>
          <span className="text-sm text-muted">{pet.raca}</span>
        </div>
        <span
          className="badge"
          style={{
            marginLeft: 'auto',
            background: pet.sexo === 'Macho' ? 'rgba(96,165,250,0.15)' : 'rgba(251,113,133,0.15)',
            color: pet.sexo === 'Macho' ? 'var(--info-400)' : '#fb7185',
            border: `1px solid ${pet.sexo === 'Macho' ? 'rgba(96,165,250,0.3)' : 'rgba(251,113,133,0.3)'}`,
          }}
        >
          {pet.sexo}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
        <div className="flex justify-between">
          <span className="text-sm text-muted">Idade</span>
          <span className="text-sm font-semibold">{idade} {idade === 1 ? 'ano' : 'anos'}</span>
        </div>
        {pet.peso && (
          <div className="flex justify-between">
            <span className="text-sm text-muted">Peso</span>
            <span className="text-sm font-semibold">{pet.peso} kg</span>
          </div>
        )}
        {pet.obs && (
          <div
            style={{
              background: 'var(--gray-850)',
              border: '1px solid var(--gray-800)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: '0.8125rem',
              color: 'var(--gray-400)',
            }}
          >
            {pet.obs}
          </div>
        )}
      </div>

      {!confirmDelete ? (
        <div className="flex gap-2">
          <Link href={`/cliente/pets/${pet.id_pet}/editar`} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
            <IconPencil style={{ width: 14, height: 14 }} /> Editar
          </Link>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setConfirmDelete(true)}
          >
            <IconTrash style={{ width: 14, height: 14 }} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p className="text-sm text-danger" style={{ textAlign: 'center' }}>
            Tem certeza que deseja remover {pet.nome}?
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-danger btn-sm"
              style={{ flex: 1 }}
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? 'Removendo...' : 'Confirmar'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ flex: 1 }}
              onClick={() => setConfirmDelete(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
