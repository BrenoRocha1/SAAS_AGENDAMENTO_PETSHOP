'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarPetAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconSave } from '@/components/icons'

interface Pet {
  id_pet: string
  nome: string
  raca: string
  sexo: string
  especie?: string | null
  porte?: string | null
  dt_nasc: string
  peso?: number | null
  obs?: string | null
}

interface Props {
  pet: Pet
}

export default function EditarPetForm({ pet }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await editarPetAction(pet.id_pet, new FormData(form))
      if (result?.error) setError(result.error)
      else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        router.refresh()
      }
    })
  }

  return (
    <div className="card" style={{ maxWidth: 580 }}>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Pet atualizado com sucesso!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className="form-grid-2">
          <div className="form-group">
            <label htmlFor="nome" className="form-label form-label-required">Nome do Pet</label>
            <input id="nome" name="nome" type="text" className="form-input" defaultValue={pet.nome} required />
          </div>
          <div className="form-group">
            <label htmlFor="raca" className="form-label form-label-required">Raça</label>
            <input id="raca" name="raca" type="text" className="form-input" defaultValue={pet.raca} required />
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label htmlFor="sexo" className="form-label form-label-required">Sexo</label>
            <select id="sexo" name="sexo" className="form-select" defaultValue={pet.sexo} required>
              <option value="">Selecione</option>
              <option value="Macho">Macho</option>
              <option value="Fêmea">Fêmea</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="dt_nasc" className="form-label form-label-required">Data de Nascimento</label>
            <input
              id="dt_nasc"
              name="dt_nasc"
              type="date"
              className="form-input"
              defaultValue={pet.dt_nasc}
              max={new Date().toISOString().split('T')[0]}
              required
            />
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label htmlFor="especie" className="form-label">Espécie</label>
            <select id="especie" name="especie" className="form-select" defaultValue={pet.especie ?? ''}>
              <option value="">Não informar</option>
              <option value="Cão">Cão</option>
              <option value="Gato">Gato</option>
            </select>
            <span className="form-hint">Usado para calcular preços por porte/raça, quando o petshop configura</span>
          </div>
          <div className="form-group">
            <label htmlFor="porte" className="form-label">Porte</label>
            <select id="porte" name="porte" className="form-select" defaultValue={pet.porte ?? ''}>
              <option value="">Não informar</option>
              <option value="Pequeno">Pequeno</option>
              <option value="Médio">Médio</option>
              <option value="Grande">Grande</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="peso" className="form-label">Peso (kg)</label>
          <input
            id="peso"
            name="peso"
            type="number"
            className="form-input"
            defaultValue={pet.peso ?? ''}
            step="0.1"
            min="0.1"
            max="199.9"
          />
        </div>

        <div className="form-group">
          <label htmlFor="obs" className="form-label">Observações</label>
          <textarea
            id="obs"
            name="obs"
            className="form-textarea"
            defaultValue={pet.obs ?? ''}
            placeholder="Informações importantes sobre o pet (alergias, comportamento, etc.)"
            rows={3}
          />
        </div>

        <div className="flex gap-3" style={{ marginTop: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={() => router.push('/cliente/pets')}
          >
            Voltar
          </button>
          <button
            type="submit"
            className={`btn btn-primary btn-lg ${isPending ? 'btn-loading' : ''}`}
            disabled={isPending}
            style={{ flex: 1 }}
          >
            {isPending ? 'Salvando...' : (<><IconSave style={{ width: 15, height: 15 }} /> Salvar alterações</>)}
          </button>
        </div>
      </form>
    </div>
  )
}
