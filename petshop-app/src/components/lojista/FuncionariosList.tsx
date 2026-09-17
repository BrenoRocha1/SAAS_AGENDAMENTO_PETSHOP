'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  cadastrarFuncionarioAction,
  editarFuncionarioAction,
  toggleFuncionarioAction,
} from '@/lib/actions'
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconClose,
  IconDog,
  IconPencil,
  IconPlus,
  IconScissors,
  IconShield,
  IconUserBadge,
} from '@/components/icons'

interface Funcionario {
  id_funcionario: string
  nome: string
  email: string
  telefone: string
  cargo: string | null
  pode_gerenciar_agenda: boolean
  pode_gerenciar_servicos: boolean
  pode_gerenciar_clientes_pets: boolean
  acesso_total: boolean
  ativo: boolean
  created_at: string
}

interface Props {
  funcionarios: Funcionario[]
  // Só o responsável pela conta (o lojista de verdade) pode conceder
  // "Acesso total" — um administrador (funcionário com acesso_total)
  // gerencia a equipe normalmente, mas nunca vê essa opção pra si mesmo
  // nem pra ninguém (migration 029 garante isso de novo no banco).
  podeConcederAcessoTotal: boolean
}

export default function FuncionariosList({ funcionarios: initial, podeConcederAcessoTotal }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const editFunc = editId
    ? initial.find(f => f.id_funcionario === editId) ?? null
    : null

  function openNew() {
    setEditId(null)
    setError(null)
    setSuccess(null)
    setShowModal(true)
  }

  function openEdit(func: Funcionario) {
    setEditId(func.id_funcionario)
    setError(null)
    setSuccess(null)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditId(null)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const form = e.currentTarget

    startTransition(async () => {
      if (editId) {
        const result = await editarFuncionarioAction(editId, new FormData(form))
        if (result?.error) {
          setError(result.error)
        } else {
          setSuccess('Membro atualizado com sucesso!')
          closeModal()
        }
      } else {
        const result = await cadastrarFuncionarioAction(new FormData(form))
        if (result?.error) {
          setError(result.error)
        } else {
          setSuccess('Convite enviado! A pessoa vai receber um e-mail para definir a própria senha e acessar o sistema.')
          closeModal()
          formRef.current?.reset()
        }
      }
    })
  }

  function handleToggle(id: string, ativo: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await toggleFuncionarioAction(id, ativo)
      if (result?.error) setError(result.error)
    })
  }

  const ativos = initial.filter(f => f.ativo)
  const inativos = initial.filter(f => !f.ativo)

  return (
    <>
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-4)' }}>
          <IconCheck style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Botão de adicionar */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <button
          onClick={openNew}
          className="btn btn-primary"
          id="btn-novo-funcionario"
        >
          <IconPlus style={{ width: 16, height: 16 }} /> Cadastrar Membro
        </button>
      </div>

      {/* Lista de membros ativos */}
      {ativos.length === 0 && inativos.length === 0 ? (
        <div className="empty-state card">
          <IconUserBadge style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Nenhum membro cadastrado</div>
          <p style={{ marginBottom: 'var(--space-5)' }}>
            Cadastre membros da equipe para ajudar na gestão do seu petshop
          </p>
          <button onClick={openNew} className="btn btn-primary">
            Cadastrar primeiro membro
          </button>
        </div>
      ) : (
        <>
          {ativos.length > 0 && (
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <h2 style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--gray-300)',
                marginBottom: 'var(--space-4)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Ativos ({ativos.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {ativos.map(func => (
                  <FuncCard key={func.id_funcionario} func={func} onEdit={openEdit} onToggle={handleToggle} isPending={isPending} />
                ))}
              </div>
            </div>
          )}

          {inativos.length > 0 && (
            <div>
              <h2 style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--gray-500)',
                marginBottom: 'var(--space-4)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Inativos ({inativos.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {inativos.map(func => (
                  <FuncCard key={func.id_funcionario} func={func} onEdit={openEdit} onToggle={handleToggle} isPending={isPending} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Criação / Edição */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            className="card animate-slide-up"
            style={{
              width: '100%',
              maxWidth: 560,
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--gray-100)',
                fontFamily: 'var(--font-heading)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}>
                {editId ? <IconPencil style={{ width: 18, height: 18 }} /> : <IconUserBadge style={{ width: 18, height: 18 }} />}
                {editId ? 'Editar Membro' : 'Novo Membro'}
              </h2>
              <button
                onClick={closeModal}
                className="btn btn-ghost btn-sm"
                aria-label="Fechar"
              >
                <IconClose style={{ width: 15, height: 15 }} />
              </button>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="func-nome" className="form-label form-label-required">Nome completo</label>
                <input
                  id="func-nome"
                  name="nome"
                  type="text"
                  className="form-input"
                  placeholder="Maria Silva"
                  defaultValue={editFunc?.nome ?? ''}
                  required
                />
              </div>

              {!editId && (
                <div className="form-group">
                  <label htmlFor="func-email" className="form-label form-label-required">E-mail (será usado para login)</label>
                  <input
                    id="func-email"
                    name="email"
                    type="email"
                    className="form-input"
                    placeholder="membro@email.com"
                    required
                  />
                  <span className="form-hint">
                    A pessoa vai receber um e-mail nesse endereço para definir a própria senha
                  </span>
                </div>
              )}

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="func-telefone" className="form-label form-label-required">Telefone</label>
                  <input
                    id="func-telefone"
                    name="telefone"
                    type="tel"
                    className="form-input"
                    placeholder="(11) 99999-9999"
                    defaultValue={editFunc?.telefone ?? ''}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="func-cargo" className="form-label">Cargo</label>
                  <input
                    id="func-cargo"
                    name="cargo"
                    type="text"
                    className="form-input"
                    placeholder="Tosador(a), Banhista..."
                    defaultValue={editFunc?.cargo ?? ''}
                  />
                </div>
              </div>


              <div className="separator" />

              {/* Permissões */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <h3 style={{
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: 'var(--gray-200)',
                  marginBottom: 'var(--space-3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}>
                  <IconShield style={{ width: 16, height: 16 }} /> Permissões
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--gray-800)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      name="pode_gerenciar_agenda_check"
                      defaultChecked={editFunc?.pode_gerenciar_agenda ?? true}
                      onChange={(e) => {
                        const hidden = e.target.form?.querySelector('#func-pode-agenda') as HTMLInputElement
                        if (hidden) hidden.value = String(e.target.checked)
                      }}
                      style={{ width: 20, height: 20, accentColor: 'var(--primary-500)' }}
                    />
                    <input type="hidden" id="func-pode-agenda" name="pode_gerenciar_agenda" defaultValue={String(editFunc?.pode_gerenciar_agenda ?? true)} />
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--gray-100)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <IconCalendar style={{ width: 15, height: 15, color: 'var(--gray-400)' }} /> Gerenciar Agenda
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                        Visualizar e alterar status de agendamentos
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--gray-800)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      name="pode_gerenciar_servicos_check"
                      defaultChecked={editFunc?.pode_gerenciar_servicos ?? false}
                      onChange={(e) => {
                        const hidden = e.target.form?.querySelector('#func-pode-servicos') as HTMLInputElement
                        if (hidden) hidden.value = String(e.target.checked)
                      }}
                      style={{ width: 20, height: 20, accentColor: 'var(--primary-500)' }}
                    />
                    <input type="hidden" id="func-pode-servicos" name="pode_gerenciar_servicos" defaultValue={String(editFunc?.pode_gerenciar_servicos ?? false)} />
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--gray-100)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <IconScissors style={{ width: 15, height: 15, color: 'var(--gray-400)' }} /> Gerenciar Serviços
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                        Cadastrar e editar serviços do petshop
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--gray-800)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      name="pode_gerenciar_clientes_pets_check"
                      defaultChecked={editFunc?.pode_gerenciar_clientes_pets ?? false}
                      onChange={(e) => {
                        const hidden = e.target.form?.querySelector('#func-pode-clientes-pets') as HTMLInputElement
                        if (hidden) hidden.value = String(e.target.checked)
                      }}
                      style={{ width: 20, height: 20, accentColor: 'var(--primary-500)' }}
                    />
                    <input type="hidden" id="func-pode-clientes-pets" name="pode_gerenciar_clientes_pets" defaultValue={String(editFunc?.pode_gerenciar_clientes_pets ?? false)} />
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--gray-100)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <IconDog style={{ width: 15, height: 15, color: 'var(--gray-400)' }} /> Gerenciar Pets e Clientes
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                        Visualizar os pets e clientes cadastrados no sistema
                      </div>
                    </div>
                  </label>

                  {(podeConcederAcessoTotal || editFunc?.acesso_total) && (
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      background: 'var(--gray-800)',
                      borderRadius: 'var(--radius-md)',
                      cursor: podeConcederAcessoTotal ? 'pointer' : 'not-allowed',
                      opacity: podeConcederAcessoTotal ? 1 : 0.6,
                    }}>
                      <input
                        type="checkbox"
                        name="acesso_total_check"
                        defaultChecked={editFunc?.acesso_total ?? false}
                        disabled={!podeConcederAcessoTotal}
                        onChange={(e) => {
                          const hidden = e.target.form?.querySelector('#func-acesso-total') as HTMLInputElement
                          if (hidden) hidden.value = String(e.target.checked)
                        }}
                        style={{ width: 20, height: 20, accentColor: 'var(--primary-500)' }}
                      />
                      <input type="hidden" id="func-acesso-total" name="acesso_total" defaultValue={String(editFunc?.acesso_total ?? false)} />
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--gray-100)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <IconShield style={{ width: 15, height: 15, color: 'var(--gray-400)' }} /> Acesso Total (Administrador)
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                          {podeConcederAcessoTotal
                            ? 'Mesmo acesso que você tem, em todas as telas — só você pode conceder isso'
                            : 'Só o responsável pela conta pode conceder ou remover acesso total'}
                        </div>
                      </div>
                    </label>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary ${isPending ? 'btn-loading' : ''}`}
                  disabled={isPending}
                  id="btn-salvar-funcionario"
                >
                  {isPending
                    ? (editId ? 'Salvando...' : 'Convidando...')
                    : (editId ? 'Salvar Alterações' : 'Convidar Membro')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================
// Sub-componente: Card de funcionário
// ============================================================
function FuncCard({
  func,
  onEdit,
  onToggle,
  isPending,
}: {
  func: Funcionario
  onEdit: (f: Funcionario) => void
  onToggle: (id: string, ativo: boolean) => void
  isPending: boolean
}) {
  const initials = func.nome
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()

  const router = useRouter()

  return (
    <div
      className="card"
      onClick={() => router.push(`/lojista/equipe/${func.id_funcionario}`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        opacity: func.ativo ? 1 : 0.6,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: func.ativo ? 'var(--primary-600)' : 'var(--gray-700)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        color: 'white',
        fontSize: '0.9rem',
        flexShrink: 0,
      }}>
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--gray-100)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {func.nome}
          {!func.ativo && (
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-900)',
              color: 'var(--danger-400)',
            }}>
              INATIVO
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--gray-400)' }}>
          {func.cargo && <span>{func.cargo} • </span>}
          {func.email}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)', flexWrap: 'wrap' }}>
          {func.pode_gerenciar_agenda && (
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--info-900)',
              color: 'var(--info-400)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <IconCalendar style={{ width: 11, height: 11 }} /> Agenda
            </span>
          )}
          {func.pode_gerenciar_servicos && (
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--success-900)',
              color: 'var(--success-400)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <IconScissors style={{ width: 11, height: 11 }} /> Serviços
            </span>
          )}
          {func.pode_gerenciar_clientes_pets && (
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--warning-900)',
              color: 'var(--warning-400)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <IconDog style={{ width: 11, height: 11 }} /> Clientes/Pets
            </span>
          )}
          {func.acesso_total && (
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--primary-900)',
              color: 'var(--primary-400)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <IconShield style={{ width: 11, height: 11 }} /> Administrador
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
        <button
          onClick={e => { e.stopPropagation(); onEdit(func) }}
          className="btn btn-ghost btn-sm"
          title="Editar"
        >
          <IconPencil style={{ width: 14, height: 14 }} />
        </button>
        <button
          type="button"
          className={`switch ${func.ativo ? 'switch-on' : ''}`}
          onClick={e => { e.stopPropagation(); onToggle(func.id_funcionario, !func.ativo) }}
          disabled={isPending}
          role="switch"
          aria-checked={func.ativo}
          title={func.ativo ? 'Desativar acesso' : 'Reativar acesso'}
        >
          <span className="switch-thumb" />
        </button>
      </div>
    </div>
  )
}
