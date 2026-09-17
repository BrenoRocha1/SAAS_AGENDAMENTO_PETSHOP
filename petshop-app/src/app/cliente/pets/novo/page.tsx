'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarPetAction } from '@/lib/actions'
import { IconAlert } from '@/components/icons'

export default function NovoPetPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    startTransition(async () => {
      const result = await criarPetAction(new FormData(form))
      if (result?.error) setError(result.error)
      else router.push('/cliente/pets')
    })
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Cadastrar Pet</h1>
        <p className="page-subtitle">Adicione um novo pet ao seu perfil</p>
      </div>

      <div className="card" style={{ maxWidth: 580 }}>
        {error && (
          <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
            <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="nome" className="form-label form-label-required">Nome do Pet</label>
              <input id="nome" name="nome" type="text" className="form-input" placeholder="Rex" required />
            </div>
            <div className="form-group">
              <label htmlFor="raca" className="form-label form-label-required">Raça</label>
              <input id="raca" name="raca" type="text" className="form-input" placeholder="Labrador" required />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="sexo" className="form-label form-label-required">Sexo</label>
              <select id="sexo" name="sexo" className="form-select" required>
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
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="especie" className="form-label">Espécie</label>
              <select id="especie" name="especie" className="form-select">
                <option value="">Não informar</option>
                <option value="Cão">Cão</option>
                <option value="Gato">Gato</option>
              </select>
              <span className="form-hint">Usado para calcular preços por porte/raça, quando o petshop configura</span>
            </div>
            <div className="form-group">
              <label htmlFor="porte" className="form-label">Porte</label>
              <select id="porte" name="porte" className="form-select">
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
              placeholder="8.5"
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
              placeholder="Informações importantes sobre o pet (alergias, comportamento, etc.)"
              rows={3}
            />
          </div>

          <div className="flex gap-3" style={{ marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => router.back()}
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-salvar-pet"
              className={`btn btn-primary btn-lg ${isPending ? 'btn-loading' : ''}`}
              disabled={isPending}
              style={{ flex: 1 }}
            >
              {isPending ? 'Salvando...' : 'Cadastrar Pet'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
