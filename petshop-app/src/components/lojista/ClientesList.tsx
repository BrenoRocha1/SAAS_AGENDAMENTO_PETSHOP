'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatarTelefone } from '@/lib/format'
import ClienteFormModal, { type ClienteParaEditar } from './ClienteFormModal'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconSearch,
  IconUsers,
} from '@/components/icons'

export interface ClienteLinha {
  id_cliente: string
  nome: string
  telefone: string
  email: string
  qtdPets: number
  petsResumo: string[]
  qtdAgendamentos: number
}

interface Props {
  clientes: ClienteLinha[]
  total: number
  pagina: number
  pageSize: number
  busca: string
  clienteParaEditarInicial: ClienteParaEditar | null
  // Quem só tem "gerenciar clientes e pets" apenas visualiza — sem criar,
  // editar ou excluir. Lojista e administrador (acesso_total) sempre true.
  podeEditar: boolean
}

export default function ClientesList({ clientes, total, pagina, pageSize, busca, clienteParaEditarInicial, podeEditar }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [buscaInput, setBuscaInput] = useState(busca)
  const [showModal, setShowModal] = useState(!!clienteParaEditarInicial)
  const [clienteEditando, setClienteEditando] = useState<ClienteParaEditar | null>(clienteParaEditarInicial)

  function navegar(overrides: Record<string, string | undefined>) {
    const params: Record<string, string | undefined> = {
      busca: busca || undefined,
      pagina: pagina !== 1 ? String(pagina) : undefined,
      ...overrides,
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v)
    }
    const query = qs.toString()
    startTransition(() => router.push(`/lojista/clientes${query ? `?${query}` : ''}`))
  }

  // Busca com debounce — mesma ideia da tela de Pets: cada letra digitada
  // não dispara uma navegação, só depois de meio segundo parado.
  useEffect(() => {
    if (buscaInput === busca) return
    const t = setTimeout(() => navegar({ busca: buscaInput || undefined, pagina: undefined }), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput])

  function abrirNovo() {
    setClienteEditando(null)
    setShowModal(true)
  }

  function abrirEdicao(cliente: ClienteParaEditar) {
    setClienteEditando(cliente)
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false)
    setClienteEditando(null)
    if (clienteParaEditarInicial) navegar({})
  }

  function handleSalvo() {
    setShowModal(false)
    setClienteEditando(null)
    router.refresh()
  }

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="dash-search" style={{ maxWidth: 360 }}>
          <IconSearch />
          <input
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
          />
        </div>
        {podeEditar && (
          <button onClick={abrirNovo} className="btn btn-primary" id="btn-novo-cliente">
            <IconPlus style={{ width: 16, height: 16 }} /> Novo Cliente
          </button>
        )}
      </div>

      {clientes.length === 0 ? (
        <div className="empty-state card">
          <IconUsers style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">
            {busca ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente ainda'}
          </div>
          {!busca && podeEditar && (
            <>
              <p style={{ marginBottom: 'var(--space-5)' }}>
                Cadastre um cliente ou espere o primeiro agendamento
              </p>
              <button onClick={abrirNovo} className="btn btn-primary">
                Cadastrar primeiro cliente
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>Pets</th>
                  <th>Agendamentos</th>
                  {podeEditar && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr
                    key={c.id_cliente}
                    onClick={() => router.push(`/lojista/clientes/${c.id_cliente}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: 'var(--primary-600)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            color: 'white',
                            flexShrink: 0,
                          }}
                        >
                          {c.nome?.[0]?.toUpperCase()}
                        </div>
                        <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{c.nome}</span>
                      </div>
                    </td>
                    <td>
                      <div>{formatarTelefone(c.telefone)}</div>
                      <div className="text-sm text-muted">{c.email}</div>
                    </td>
                    <td>
                      {c.qtdPets === 0 ? (
                        <span className="text-sm text-muted">Sem pet cadastrado</span>
                      ) : (
                        <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                          {c.petsResumo.map(p => (
                            <span key={p} className="badge badge-ativo" style={{ fontSize: '0.7rem' }}>{p}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="font-semibold" style={{ color: 'var(--primary-400)' }}>
                        {c.qtdAgendamentos}
                      </span>
                    </td>
                    {podeEditar && (
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Editar"
                          onClick={e => {
                            e.stopPropagation()
                            abrirEdicao({ id_cliente: c.id_cliente, nome: c.nome, telefone: c.telefone })
                          }}
                        >
                          <IconPencil style={{ width: 14, height: 14 }} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <span className="text-sm text-muted">
              {total} cliente{total !== 1 ? 's' : ''} · página {pagina} de {totalPaginas}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => navegar({ pagina: pagina - 1 > 1 ? String(pagina - 1) : undefined })} disabled={pagina <= 1 || isPending}>
                <IconChevronLeft style={{ width: 14, height: 14 }} /> Anterior
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => navegar({ pagina: String(pagina + 1) })} disabled={pagina >= totalPaginas || isPending}>
                Próxima <IconChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        </>
      )}

      {showModal && (
        <ClienteFormModal cliente={clienteEditando} onClose={fecharModal} onSaved={handleSalvo} />
      )}
    </div>
  )
}
