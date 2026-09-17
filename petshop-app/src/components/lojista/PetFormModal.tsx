'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { criarPetLojistaAction, editarPetLojistaAction } from '@/lib/actions'
import { IconAlert, IconCheck, IconClose, IconDog, IconSearch } from '@/components/icons'
import PetFotoUpload from '@/components/cliente/PetFotoUpload'

export interface ClienteBasico {
  id_cliente: string
  nome: string
  telefone: string
}

// Formato de PetLinha (fn_buscar_pets_lojista, migration 018) — já traz
// tudo que o formulário de edição precisa, sem consulta extra.
export interface PetParaEditar {
  id_pet: string
  nome: string
  raca: string
  sexo: 'Macho' | 'Fêmea'
  especie: 'Cão' | 'Gato' | null
  porte: 'Pequeno' | 'Médio' | 'Grande' | null
  dt_nasc: string
  peso: number | null
  obs: string | null
  id_cliente: string
  nome_cliente: string
  foto_url?: string | null
}

interface Props {
  pet: PetParaEditar | null // null = cadastro novo; preenchido = edição
  clientes: ClienteBasico[]
  // Vem do perfil do cliente ("Adicionar Pet") — tutor já sai fixado e
  // travado, sem precisar buscar de novo quem já está na tela de origem.
  clienteFixo?: ClienteBasico | null
  onClose: () => void
  onSaved: () => void
}

export default function PetFormModal({ pet, clientes, clienteFixo, onClose, onSaved }: Props) {
  const isEdicao = !!pet
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteId, setClienteId] = useState(pet?.id_cliente ?? clienteFixo?.id_cliente ?? '')
  // Editando OU vindo com tutor fixo, o tutor já vem selecionado — mostra
  // ele "fechado" (resumo, não a lista inteira). Editando ainda dá pra
  // trocar; com tutor fixo (veio do perfil do cliente) não tem nem opção
  // de trocar, já que a intenção é clara: "adicionar pet DESTE cliente".
  const [trocandoTutor, setTrocandoTutor] = useState(!pet && !clienteFixo)

  const clienteSel = clientes.find(c => c.id_cliente === clienteId)
  const clientesFiltrados = buscaCliente.trim()
    ? clientes.filter(c => c.nome.toLowerCase().includes(buscaCliente.trim().toLowerCase()))
    : clientes

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!clienteId) {
      setError('Selecione o tutor do pet.')
      return
    }
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set('id_cliente', clienteId)

    startTransition(async () => {
      const result = isEdicao
        ? await editarPetLojistaAction(pet!.id_pet, formData)
        : await criarPetLojistaAction(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <IconDog style={{ width: 17, height: 17, marginRight: 'var(--space-2)', verticalAlign: -3 }} />
            {isEdicao ? `Editar ${pet!.nome}` : 'Novo Pet'}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-error">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {isEdicao && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <PetFotoUpload idPet={pet!.id_pet} fotoUrlInicial={pet!.foto_url ?? null} />
              </div>
            )}

            {/* Tutor — cliente já cadastrado, nunca criado aqui dentro */}
            <div className="form-group">
              <label className="form-label form-label-required">Tutor</label>
              {clientes.length === 0 ? (
                <div className="alert alert-warning">
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>Você ainda não tem nenhum cliente cadastrado. Cadastre um em Clientes → Novo Cliente antes de cadastrar um pet.</span>
                </div>
              ) : !trocandoTutor && clienteSel ? (
                <button
                  type="button"
                  className="picker-item is-selected"
                  onClick={clienteFixo ? undefined : () => setTrocandoTutor(true)}
                  style={{ width: '100%', cursor: clienteFixo ? 'default' : 'pointer' }}
                  disabled={isPending || !!clienteFixo}
                >
                  <div className="picker-item-main">
                    <div className="picker-item-title">{clienteSel.nome}</div>
                    <div className="picker-item-sub">{clienteSel.telefone}{clienteFixo ? '' : ' · toque para trocar'}</div>
                  </div>
                  <IconCheck className="picker-check" />
                </button>
              ) : (
                <>
                  <div className="dash-search" style={{ maxWidth: 'none', marginBottom: 'var(--space-2)' }}>
                    <IconSearch />
                    <input
                      placeholder="Buscar tutor pelo nome..."
                      value={buscaCliente}
                      onChange={e => setBuscaCliente(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="picker-list" style={{ maxHeight: 160 }}>
                    {clientesFiltrados.map(c => (
                      <button
                        type="button"
                        key={c.id_cliente}
                        className={`picker-item ${clienteId === c.id_cliente ? 'is-selected' : ''}`}
                        onClick={() => { setClienteId(c.id_cliente); setBuscaCliente(''); setTrocandoTutor(false) }}
                        disabled={isPending}
                      >
                        <div className="picker-item-main">
                          <div className="picker-item-title">{c.nome}</div>
                          <div className="picker-item-sub">{c.telefone}</div>
                        </div>
                        {clienteId === c.id_cliente && <IconCheck className="picker-check" />}
                      </button>
                    ))}
                    {clientesFiltrados.length === 0 && (
                      <p className="text-sm text-muted">Nenhum tutor encontrado para &quot;{buscaCliente}&quot;.</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="separator" />

            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="pet-nome" className="form-label form-label-required">Nome do pet</label>
                <input
                  id="pet-nome"
                  name="nome"
                  type="text"
                  className="form-input"
                  placeholder="Rex"
                  defaultValue={pet?.nome ?? ''}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="form-group">
                <label htmlFor="pet-raca" className="form-label form-label-required">Raça</label>
                <input
                  id="pet-raca"
                  name="raca"
                  type="text"
                  className="form-input"
                  placeholder="SRD, Poodle..."
                  defaultValue={pet?.raca ?? ''}
                  required
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="pet-especie" className="form-label">Espécie</label>
                <select id="pet-especie" name="especie" className="form-select" defaultValue={pet?.especie ?? ''} disabled={isPending}>
                  <option value="">Não informado</option>
                  <option value="Cão">Cão</option>
                  <option value="Gato">Gato</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pet-porte" className="form-label">Porte</label>
                <select id="pet-porte" name="porte" className="form-select" defaultValue={pet?.porte ?? ''} disabled={isPending}>
                  <option value="">Não informado</option>
                  <option value="Pequeno">Pequeno</option>
                  <option value="Médio">Médio</option>
                  <option value="Grande">Grande</option>
                </select>
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="pet-sexo" className="form-label form-label-required">Sexo</label>
                <select id="pet-sexo" name="sexo" className="form-select" defaultValue={pet?.sexo ?? 'Macho'} disabled={isPending}>
                  <option value="Macho">Macho</option>
                  <option value="Fêmea">Fêmea</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="pet-dtnasc" className="form-label form-label-required">Data de nascimento</label>
                <input
                  id="pet-dtnasc"
                  name="dt_nasc"
                  type="date"
                  className="form-input"
                  max={format(new Date(), 'yyyy-MM-dd')}
                  defaultValue={pet?.dt_nasc ?? ''}
                  required
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="pet-peso" className="form-label">Peso (kg)</label>
              <input
                id="pet-peso"
                name="peso"
                type="number"
                step="0.1"
                min="0.1"
                max="199.9"
                className="form-input"
                style={{ maxWidth: 160 }}
                placeholder="Opcional"
                defaultValue={pet?.peso ?? ''}
                disabled={isPending}
              />
            </div>

            <div className="form-group">
              <label htmlFor="pet-obs" className="form-label">Observações</label>
              <textarea
                id="pet-obs"
                name="obs"
                className="form-textarea"
                rows={2}
                maxLength={500}
                placeholder="Alergias, temperamento, cuidados especiais..."
                defaultValue={pet?.obs ?? ''}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isPending}>
              Cancelar
            </button>
            <button type="submit" className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`} disabled={isPending}>
              {isPending ? 'Salvando...' : isEdicao ? 'Salvar Alterações' : 'Cadastrar Pet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
