'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { desativarPetAction } from '@/lib/actions'

interface Pet {
  id_pet: string
  nome: string
  raca: string
  sexo: string
  dt_nasc: string
  peso?: number
  obs?: string
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
      {/* Header do card */}
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
            background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(245,158,11,0.1))',
            border: '1px solid rgba(124,58,237,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.625rem',
            flexShrink: 0,
          }}
        >
          {pet.sexo === 'Macho' ? '🐶' : '🐩'}
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

      {/* Detalhes */}
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
            📝 {pet.obs}
          </div>
        )}
      </div>

      {/* Ações */}
      {!confirmDelete ? (
        <div className="flex gap-2">
          <Link href={`/cliente/pets/${pet.id_pet}/editar`} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
            ✏️ Editar
          </Link>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setConfirmDelete(true)}
          >
            🗑️
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
