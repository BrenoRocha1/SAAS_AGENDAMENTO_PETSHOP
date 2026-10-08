'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatarTelefone } from '@/lib/format'
import PetFormModal, { type ClienteBasico, type PetParaEditar } from './PetFormModal'
import {
  IconAlert,
  IconChevronLeft,
  IconChevronRight,
  IconDog,
  IconPaw,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSearch,
  IconUser,
} from '@/components/icons'
import Ilustracao from '@/components/Ilustracao'
import './pets-lista.css'

export interface PetLinha extends PetParaEditar {
  telefone_cliente: string
  created_at: string
}

interface Props {
  pets: PetLinha[]
  total: number
  pagina: number
  pageSize: number
  busca: string
  filtroEspecie: string
  filtroPorte: string
  clientes: ClienteBasico[]
  petParaEditarInicial: PetParaEditar | null
  // ?novoPetTutor=<id> (vem de "Adicionar Pet" no perfil do cliente) —
  // abre o cadastro já com o tutor fixado, sem precisar buscar de novo.
  clienteFixoInicial?: ClienteBasico | null
  // Quem só tem "gerenciar clientes e pets" apenas visualiza — sem criar,
  // editar ou excluir. Lojista e administrador (acesso_total) sempre true.
  podeEditar: boolean
}

export default function PetsList({
  pets,
  total,
  pagina,
  pageSize,
  busca,
  filtroEspecie,
  filtroPorte,
  clientes,
  petParaEditarInicial,
  clienteFixoInicial,
  podeEditar,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [buscaInput, setBuscaInput] = useState(busca)
  const [showModal, setShowModal] = useState(!!petParaEditarInicial || !!clienteFixoInicial)
  const [petEditando, setPetEditando] = useState<PetParaEditar | null>(petParaEditarInicial)
  const [clienteFixo, setClienteFixo] = useState<ClienteBasico | null>(clienteFixoInicial ?? null)

  function navegar(overrides: Record<string, string | undefined>) {
    const params: Record<string, string | undefined> = {
      busca: busca || undefined,
      especie: filtroEspecie || undefined,
      porte: filtroPorte || undefined,
      pagina: pagina !== 1 ? String(pagina) : undefined,
      ...overrides,
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.set(k, v)
    }
    const query = qs.toString()
    startTransition(() => router.push(`/lojista/pets${query ? `?${query}` : ''}`))
  }

  // Busca com debounce: cada letra digitada não dispara uma navegação —
  // só depois de meio segundo sem o usuário teclar. É a mesma ideia dos
  // filtros por URL já usados no Kanban/Relatórios, só que pra texto
  // livre (que não pode disparar uma requisição por tecla).
  useEffect(() => {
    if (buscaInput === busca) return
    const t = setTimeout(() => navegar({ busca: buscaInput || undefined, pagina: undefined }), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput])

  function abrirNovo() {
    setPetEditando(null)
    setClienteFixo(null)
    setShowModal(true)
  }

  function abrirEdicao(pet: PetLinha) {
    setPetEditando(pet)
    setClienteFixo(null)
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false)
    setPetEditando(null)
    setClienteFixo(null)
    // Se veio de ?editar= ou ?novoPetTutor=, some com o parâmetro da URL
    // ao fechar sem salvar (senão reabriria o modal a cada refresh).
    if (petParaEditarInicial || clienteFixoInicial) navegar({})
  }

  function handleSalvo() {
    setShowModal(false)
    setPetEditando(null)
    setClienteFixo(null)
    router.refresh()
  }

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize))
  const temFiltroAtivo = !!(busca || filtroEspecie || filtroPorte)

  // Os pets em cards (a mesma grade na tela grande e no celular): a foto em
  // cima, e o card inteiro abre a ficha. O lápis de editar só existe na tela
  // grande — no celular edita-se pela ficha, como no app.
  const grade = (
    <div className="pets-grade">
      {pets.map(p => (
        <div key={p.id_pet} className="pet-card">
          <Link href={`/lojista/pets/${p.id_pet}`} className="pet-card-link" aria-label={`Abrir a ficha de ${p.nome}`}>
            <span className="pet-card-foto">
              {p.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                <img src={p.foto_url} alt="" loading="lazy" />
              ) : p.especie === 'Gato' ? <IconPaw /> : <IconDog />}
              {p.especie && <span className="pet-card-selo">{p.especie}</span>}
            </span>
            <span className="pet-card-info">
              <span className="pet-card-nome">{p.nome}</span>
              <span className="pet-card-sub">{[p.raca, p.porte].filter(Boolean).join(' · ') || 'Pet'}</span>
              <span className="pet-card-linha"><IconUser /><span>{p.nome_cliente}</span></span>
              <span className="pet-card-linha pet-card-telefone"><IconPhone /><span>{formatarTelefone(p.telefone_cliente)}</span></span>
            </span>
          </Link>
          {podeEditar && (
            <button type="button" className="pet-card-editar" title="Editar" aria-label={`Editar ${p.nome}`} onClick={() => abrirEdicao(p)}>
              <IconPencil />
            </button>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms' }}>
      {/* Celular (até 768px): a mesma tela Pets do app. */}
      <div className="so-celular tela-app">
        <div className="tela-app-titulo">
          <h1>Pets</h1>
          {podeEditar && (
            <button type="button" className="tela-app-novo" onClick={abrirNovo}>
              <IconPlus style={{ width: 18, height: 18 }} /> Novo
            </button>
          )}
        </div>
        <div className="tela-app-busca">
          <IconSearch />
          <input
            placeholder="Buscar pet, raça ou tutor..."
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
          />
        </div>

        {pets.length === 0 ? (
          <div className="dash-app-vazio">
            {busca
              ? <span className="dash-app-vazio-icone"><IconPaw style={{ width: 26, height: 26 }} /></span>
              : <Ilustracao nome="pets" altura={110} style={{ marginBottom: 0 }} />}
            <strong>{busca ? 'Nenhum pet encontrado' : 'Nenhum pet cadastrado'}</strong>
            <span>{busca ? 'Tente outro nome, raça ou tutor.' : 'Os pets da sua loja aparecem aqui.'}</span>
          </div>
        ) : grade}

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="dash-search" style={{ maxWidth: 360 }}>
          <IconSearch />
          <input
            placeholder="Buscar por pet, tutor ou raça..."
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
          />
        </div>
        {podeEditar && (
          <button className="btn btn-primary" onClick={abrirNovo} id="btn-novo-pet">
            <IconPlus style={{ width: 16, height: 16 }} /> Novo Pet
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
        <select className="form-select" value={filtroEspecie} onChange={e => navegar({ especie: e.target.value || undefined, pagina: undefined })} style={{ minWidth: 160, width: 'auto' }}>
          <option value="">Todas as espécies</option>
          <option value="Cão">Cão</option>
          <option value="Gato">Gato</option>
        </select>
        <select className="form-select" value={filtroPorte} onChange={e => navegar({ porte: e.target.value || undefined, pagina: undefined })} style={{ minWidth: 160, width: 'auto' }}>
          <option value="">Todos os portes</option>
          <option value="Pequeno">Pequeno</option>
          <option value="Médio">Médio</option>
          <option value="Grande">Grande</option>
        </select>
      </div>

      {pets.length === 0 ? (
        <div className="empty-state card">
          {temFiltroAtivo ? <IconDog style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} /> : <Ilustracao nome="pets" />}
          <div className="empty-state-title">
            {temFiltroAtivo ? 'Nenhum pet encontrado para essa busca.' : 'Nenhum pet cadastrado.'}
          </div>
          {!temFiltroAtivo && podeEditar && (
            <>
              <p style={{ marginBottom: 'var(--space-5)' }}>Cadastre o primeiro pet da sua loja.</p>
              <button className="btn btn-primary" onClick={abrirNovo}>Cadastrar primeiro pet</button>
            </>
          )}
        </div>
      ) : (
        <>
          {grade}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <span className="text-sm text-muted">
              {total} pet{total !== 1 ? 's' : ''} · página {pagina} de {totalPaginas}
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
      </div>

      {clientes.length === 0 && (
        <div className="alert alert-warning" style={{ marginTop: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>Cadastre um cliente em Clientes → Novo Cliente antes de cadastrar um pet — todo pet precisa de um tutor.</span>
        </div>
      )}

      {showModal && (
        <PetFormModal pet={petEditando} clientes={clientes} clienteFixo={clienteFixo} onClose={fecharModal} onSaved={handleSalvo} />
      )}
    </div>
  )
}
