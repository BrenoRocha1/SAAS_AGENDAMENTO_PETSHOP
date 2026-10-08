'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { desativarPetAction } from '@/lib/actions'
import { IconAlert, IconClose, IconDog, IconPaw, IconTrash } from '@/components/icons'
import '@/components/lojista/pets-lista.css'

interface Pet {
  id_pet: string
  nome: string
  raca: string
  sexo: string
  foto_url?: string | null
  especie?: string | null
  porte?: string | null
}

interface Props {
  pet: Pet
  // "3 anos", "5 meses".
  idade: string
}

// Card de pet da conta do cliente ("Meus pets") — o mesmo card com a foto em
// cima da tela de Pets da loja (lojista/pets-lista.css). O card inteiro abre
// o pet para editar; na tela grande, a lixeira do canto remove (com
// confirmação). No celular a remoção fica dentro da ficha, como no app.
export default function PetCard({ pet, idade }: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()

  function remover() {
    startTransition(async () => {
      await desativarPetAction(pet.id_pet)
      setConfirmando(false)
    })
  }

  return (
    <div className="pet-card">
      <Link href={`/cliente/pets/${pet.id_pet}/editar`} className="pet-card-link" aria-label={`Abrir ${pet.nome}`}>
        <span className="pet-card-foto">
          {pet.foto_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
            <img src={pet.foto_url} alt="" loading="lazy" />
          ) : pet.especie === 'Gato' ? <IconPaw /> : <IconDog />}
          {pet.especie && <span className="pet-card-selo">{pet.especie}</span>}
        </span>
        <span className="pet-card-info">
          <span className="pet-card-nome">{pet.nome}</span>
          <span className="pet-card-sub">{[pet.raca, pet.porte].filter(Boolean).join(' · ') || 'Pet'}</span>
          <span className="pet-card-linha is-simples"><span>{pet.sexo} · {idade}</span></span>
        </span>
      </Link>
      <button type="button" className="pet-card-editar is-perigo" title="Remover pet" aria-label={`Remover ${pet.nome}`} onClick={() => setConfirmando(true)}>
        <IconTrash />
      </button>

      {confirmando && (
        <div className="modal-overlay" onClick={() => !isPending && setConfirmando(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Remover pet</h3>
              <button type="button" className="modal-close" onClick={() => setConfirmando(false)} aria-label="Fechar" disabled={isPending}>
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="modal-body">
              <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-full)', flexShrink: 0,
                  background: 'rgba(239,68,68,0.1)', color: 'var(--danger-400)',
                  display: 'grid', placeItems: 'center',
                }}>
                  <IconAlert style={{ width: 18, height: 18 }} />
                </span>
                <p style={{ color: 'var(--gray-200)' }}>
                  Tem certeza que deseja remover <strong style={{ color: 'var(--gray-100)' }}>{pet.nome}</strong>?
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmando(false)} disabled={isPending}>Cancelar</button>
              <button type="button" className={`btn btn-danger ${isPending ? 'btn-loading' : ''}`} onClick={remover} disabled={isPending}>
                {isPending ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
