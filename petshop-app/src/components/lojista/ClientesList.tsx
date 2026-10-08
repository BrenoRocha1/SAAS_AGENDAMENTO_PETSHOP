'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatarTelefone, iniciais } from '@/lib/format'
import ClienteFormModal, { type ClienteParaEditar } from './ClienteFormModal'
import {
  IconChevronLeft,
  IconChevronRight,
  IconPaw,
  IconPencil,
  IconPlus,
  IconSearch,
  IconUsers,
} from '@/components/icons'
import Ilustracao from '@/components/Ilustracao'
import './clientes-lista.css'

// Quantos nomes de pet cabem na linha antes do "+N".
const PETS_NA_LINHA = 3

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

  // A lista (a mesma na tela grande e no celular; o CSS esconde no celular o
  // que só cabe na tela grande): um bloco só, a linha inteira abre o cliente
  // e o lápis de editar aparece ao passar o mouse.
  const lista = (
    <div className="cli-lista">
      <div className="cli-cabecalho" aria-hidden="true">
        <span>Cliente</span>
        <span>Telefone</span>
        <span>Pets</span>
        <span>Agendamentos</span>
        <span />
      </div>
      {clientes.map(c => (
        <div key={c.id_cliente} className="cli-linha">
          <Link href={`/lojista/clientes/${c.id_cliente}`} className="cli-link" aria-label={`Abrir ${c.nome}`}>
            <span className="cli-quem">
              <span className="cli-avatar">{iniciais(c.nome)}</span>
              <span className="cli-nome">
                <strong>{c.nome}</strong>
                {c.email && <small className="cli-email">{c.email}</small>}
                <small className="cli-fone-celular">{formatarTelefone(c.telefone)}</small>
              </span>
            </span>
            <span className="cli-telefone">{formatarTelefone(c.telefone)}</span>
            <span className="cli-pets">
              {c.qtdPets === 0 ? (
                <span className="cli-sem">Sem pet cadastrado</span>
              ) : (
                <>
                  {/* O resumo vem como "Nome (Raça)": na linha vai só o nome, a raça fica na dica. */}
                  {c.petsResumo.slice(0, PETS_NA_LINHA).map(p => <span key={p} className="cli-pet" title={p}>{p.replace(/\s*\([^)]*\)\s*$/, '')}</span>)}
                  {c.qtdPets > Math.min(c.petsResumo.length, PETS_NA_LINHA) && (
                    <span className="cli-pet is-mais">+{c.qtdPets - Math.min(c.petsResumo.length, PETS_NA_LINHA)}</span>
                  )}
                </>
              )}
            </span>
            <span className="cli-agend">
              <strong>{c.qtdAgendamentos}</strong>
              <small>{c.qtdAgendamentos === 1 ? 'agendamento' : 'agendamentos'}</small>
            </span>
            <span className="cli-fim">
              <span className="cli-qtd-pets"><IconPaw /> {c.qtdPets}</span>
              <IconChevronRight className="cli-seta" />
            </span>
          </Link>
          {podeEditar && (
            <button
              type="button"
              className="cli-editar"
              title="Editar"
              aria-label={`Editar ${c.nome}`}
              onClick={() => abrirEdicao({ id_cliente: c.id_cliente, nome: c.nome, telefone: c.telefone })}
            >
              <IconPencil />
            </button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms' }}>
      {/* Celular (até 768px): a mesma tela Clientes do app. */}
      <div className="so-celular tela-app">
        <div className="tela-app-titulo">
          <h1>Clientes</h1>
          {podeEditar && (
            <button type="button" className="tela-app-novo" onClick={abrirNovo}>
              <IconPlus style={{ width: 18, height: 18 }} /> Novo
            </button>
          )}
        </div>
        <div className="tela-app-busca">
          <IconSearch />
          <input
            placeholder="Buscar por nome ou telefone..."
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
          />
        </div>

        {clientes.length === 0 ? (
          <div className="dash-app-vazio">
            {busca
              ? <span className="dash-app-vazio-icone"><IconUsers style={{ width: 26, height: 26 }} /></span>
              : <Ilustracao nome="clientes" altura={110} style={{ marginBottom: 0 }} />}
            <strong>{busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</strong>
            <span>{busca ? 'Tente outro nome ou telefone.' : 'Os clientes da sua loja aparecem aqui.'}</span>
          </div>
        ) : (
          lista
        )}

        {totalPaginas > 1 && (
          <div className="tela-app-paginas">
            <button type="button" onClick={() => navegar({ pagina: pagina - 1 > 1 ? String(pagina - 1) : undefined })} disabled={pagina <= 1 || isPending}>
              <IconChevronLeft style={{ width: 14, height: 14 }} /> Anterior
            </button>
            <span>{pagina} de {totalPaginas}</span>
            <button type="button" onClick={() => navegar({ pagina: String(pagina + 1) })} disabled={pagina >= totalPaginas || isPending}>
              Próxima <IconChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}
      </div>

      <div className="so-desktop">
      <div className="cli-barra">
        <div className="cli-busca">
          <IconSearch />
          <input
            placeholder="Buscar por nome, telefone ou e-mail"
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
            aria-label="Buscar cliente por nome, telefone ou e-mail"
          />
        </div>
        {total > 0 && (
          <span className="cli-total"><strong>{total}</strong> cliente{total !== 1 ? 's' : ''}</span>
        )}
        {podeEditar && (
          <button onClick={abrirNovo} className="btn btn-primary" id="btn-novo-cliente">
            <IconPlus style={{ width: 16, height: 16 }} /> Novo Cliente
          </button>
        )}
      </div>

      {clientes.length === 0 ? (
        <div className="empty-state card">
          {busca ? <IconUsers style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} /> : <Ilustracao nome="clientes" />}
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
          {lista}

          {totalPaginas > 1 && (
            <div className="cli-rodape">
              <span className="text-sm text-muted">Página {pagina} de {totalPaginas}</span>
              <div className="cli-paginas">
                <button type="button" onClick={() => navegar({ pagina: pagina - 1 > 1 ? String(pagina - 1) : undefined })} disabled={pagina <= 1 || isPending} aria-label="Página anterior">
                  <IconChevronLeft />
                </button>
                <button type="button" onClick={() => navegar({ pagina: String(pagina + 1) })} disabled={pagina >= totalPaginas || isPending} aria-label="Próxima página">
                  <IconChevronRight />
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </div>

      {showModal && (
        <ClienteFormModal cliente={clienteEditando} onClose={fecharModal} onSaved={handleSalvo} />
      )}
    </div>
  )
}
