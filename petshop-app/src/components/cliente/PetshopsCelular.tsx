'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { iniciais } from '@/lib/format'
import { IconCalendar, IconSearch, IconStore, IconWhatsapp } from '@/components/icons'

export interface LojaCelular {
  id: string
  nome: string
  logoUrl: string | null
  // "Mauá, SP"
  local: string
  descricao: string | null
  // Aberto / Abre às 09:00 / Fechado…
  status: { rotulo: string; aberto: boolean }
  // O cliente já agendou nesta loja.
  minha: boolean
  linkAgendar: string
  whatsapp: string | null
}

// Celular (até 768px): a mesma tela Petshops do app — busca por nome ou
// cidade, as lojas que o cliente já usa em cima.
export default function PetshopsCelular({ lojas }: { lojas: LojaCelular[] }) {
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return lojas
      .filter(l => !termo || l.nome.toLowerCase().includes(termo) || l.local.toLowerCase().includes(termo))
      .sort((a, b) => Number(b.minha) - Number(a.minha) || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [lojas, busca])

  return (
    <div className="so-celular tela-app">
      <h1 className="tela-app-h1">Petshops</h1>
      <p className="dash-app-sub">Encontre o petshop ideal para o seu pet</p>

      <div className="tela-app-busca" style={{ marginTop: 'var(--space-4)' }}>
        <IconSearch />
        <input placeholder="Buscar por nome ou cidade..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {visiveis.length === 0 ? (
        <div className="dash-app-vazio">
          <span className="dash-app-vazio-icone"><IconStore style={{ width: 26, height: 26 }} /></span>
          <strong>{lojas.length === 0 ? 'Nenhum petshop disponível' : 'Nenhum petshop encontrado'}</strong>
          <span>{lojas.length === 0 ? 'Ainda não há petshops aceitando agendamento online.' : 'Tente outro nome ou cidade.'}</span>
        </div>
      ) : (
        <div className="dash-app-lista">
          {visiveis.map(l => (
            <div key={l.id} className="tela-app-loja">
              <div className="tela-app-loja-topo">
                <span className="tela-app-avatar is-48" style={l.logoUrl ? { backgroundImage: `url(${l.logoUrl})` } : undefined}>
                  {!l.logoUrl && iniciais(l.nome)}
                </span>
                <div>
                  <strong>{l.nome}</strong>
                  {l.local && <span>{l.local}</span>}
                </div>
              </div>
              <div className="tela-app-selos">
                <span className={`tela-app-selo ${l.status.aberto ? 'is-aberto' : ''}`}>{l.status.rotulo}</span>
                {l.minha && <span className="tela-app-selo is-minha">Você já agendou aqui</span>}
              </div>
              {l.descricao && <p className="tela-app-loja-desc">{l.descricao}</p>}
              <div className="tela-app-acoes">
                <Link href={l.linkAgendar} className="tela-app-botao is-primario">
                  <IconCalendar style={{ width: 16, height: 16 }} /> Agendar
                </Link>
                {l.whatsapp && (
                  <a href={l.whatsapp} target="_blank" rel="noopener noreferrer" className="tela-app-botao">
                    <IconWhatsapp style={{ width: 16, height: 16 }} /> WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
