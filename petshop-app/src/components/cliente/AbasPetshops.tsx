'use client'

import { useState } from 'react'

// Tela Petshops: "Petshops" (a lista de sempre) e "Produtos" (busca de
// produtos do marketplace). As duas partes chegam prontas do servidor.
export default function AbasPetshops({ petshops, produtos }: { petshops: React.ReactNode; produtos: React.ReactNode }) {
  const [aba, setAba] = useState<'petshops' | 'produtos'>('petshops')
  return (
    <>
      <div className="segmentos-app" role="tablist" style={{ marginBottom: 'var(--space-5)' }}>
        <button type="button" role="tab" aria-selected={aba === 'petshops'} className={`segmento-app ${aba === 'petshops' ? 'is-ativo' : ''}`} onClick={() => setAba('petshops')}>
          Petshops
        </button>
        <button type="button" role="tab" aria-selected={aba === 'produtos'} className={`segmento-app ${aba === 'produtos' ? 'is-ativo' : ''}`} onClick={() => setAba('produtos')}>
          Produtos
        </button>
      </div>
      {aba === 'petshops' ? petshops : produtos}
    </>
  )
}
