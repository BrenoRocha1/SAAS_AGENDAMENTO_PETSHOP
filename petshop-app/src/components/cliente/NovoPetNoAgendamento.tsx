'use client'

import { useState, useTransition } from 'react'
import { criarPetAction } from '@/lib/actions'
import { IconAlert } from '@/components/icons'

export interface PetCriado {
  id_pet: string
  nome: string
  raca: string
  especie: 'Cão' | 'Gato' | null
  porte: 'Pequeno' | 'Médio' | 'Grande' | null
  sexo: string
}

interface Props {
  onCriado: (pet: PetCriado) => void
  // Sem isto não há "Cancelar" (primeiro pet: o formulário é o único caminho).
  onCancelar?: () => void
}

// Cadastro de pet dentro do agendamento online: quem acabou de criar a
// conta pelo link da loja não tem pet nenhum, e mandar para "Meus Pets" e
// voltar fazia a pessoa perder o pedido. Só o que o agendamento precisa —
// espécie e porte entram aqui porque o preço do serviço depende deles; peso
// e observações ficam para depois, em Meus Pets.
export default function NovoPetNoAgendamento({ onCriado, onCancelar }: Props) {
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const form = e.currentTarget
    startTransition(async () => {
      const resultado = await criarPetAction(new FormData(form))
      if (resultado?.error || !resultado?.pet) {
        setErro(resultado?.error ?? 'Erro ao cadastrar pet.')
        return
      }
      onCriado(resultado.pet as PetCriado)
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
      {erro && (
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}

      <div className="form-grid-2">
        <div className="form-group">
          <label htmlFor="novo-pet-nome" className="form-label form-label-required">Nome do pet</label>
          <input id="novo-pet-nome" name="nome" type="text" className="form-input" placeholder="Rex" maxLength={80} required />
        </div>
        <div className="form-group">
          <label htmlFor="novo-pet-raca" className="form-label form-label-required">Raça</label>
          <input id="novo-pet-raca" name="raca" type="text" className="form-input" placeholder="Labrador, SRD..." maxLength={80} required />
        </div>
      </div>

      <div className="form-grid-2">
        <div className="form-group">
          <label htmlFor="novo-pet-especie" className="form-label form-label-required">Espécie</label>
          <select id="novo-pet-especie" name="especie" className="form-select" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            <option value="Cão">Cão</option>
            <option value="Gato">Gato</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="novo-pet-porte" className="form-label form-label-required">Porte</label>
          <select id="novo-pet-porte" name="porte" className="form-select" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            <option value="Pequeno">Pequeno</option>
            <option value="Médio">Médio</option>
            <option value="Grande">Grande</option>
          </select>
        </div>
      </div>

      <div className="form-grid-2">
        <div className="form-group">
          <label htmlFor="novo-pet-sexo" className="form-label form-label-required">Sexo</label>
          <select id="novo-pet-sexo" name="sexo" className="form-select" defaultValue="" required>
            <option value="" disabled>Selecione</option>
            <option value="Macho">Macho</option>
            <option value="Fêmea">Fêmea</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="novo-pet-nasc" className="form-label form-label-required">Data de nascimento</label>
          <input
            id="novo-pet-nasc"
            name="dt_nasc"
            type="date"
            className="form-input"
            max={new Date().toISOString().split('T')[0]}
            required
          />
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        {onCancelar && (
          <button type="button" className="btn btn-secondary" onClick={onCancelar} disabled={isPending}>
            Cancelar
          </button>
        )}
        <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending}>
          {isPending ? 'Salvando...' : 'Cadastrar pet'}
        </button>
      </div>
    </form>
  )
}
