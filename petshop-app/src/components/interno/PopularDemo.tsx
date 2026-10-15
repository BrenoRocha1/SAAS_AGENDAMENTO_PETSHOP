'use client'

import { useState, useTransition } from 'react'
import { popularDemoAction } from '@/lib/actions-interno'
import type { ResultadoDemo } from '@/lib/demo-loja'

export default function PopularDemo({ idLojista }: { idLojista: string }) {
  const [demo, setDemo] = useState<ResultadoDemo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function rodar() {
    if (!window.confirm('Atualizar os dados de demonstração? Só cria o que estiver faltando (nada é apagado).')) return
    setErro(null)
    setDemo(null)
    iniciar(async () => {
      const r = await popularDemoAction(idLojista)
      if (r.error) setErro(r.error)
      else setDemo(r.demo ?? null)
    })
  }

  return (
    <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-8)' }}>
      <h2 className="page-title" style={{ fontSize: '1.125rem', marginBottom: 'var(--space-2)' }}>Conta de demonstração</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
        Esta é a loja de exemplo. Atualizar recria o que estiver faltando: logo, endereço, horários, formas de pagamento, serviços, produtos com foto, equipe, clientes, pets, agenda e vendas.
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={rodar} disabled={pendente}>
        {pendente ? 'Atualizando… (pode levar um minuto)' : 'Atualizar dados de demonstração'}
      </button>
      {erro && <div className="alert alert-error" role="alert" style={{ marginTop: 'var(--space-3)' }}><span>{erro}</span></div>}
      {demo && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <ul style={{ paddingLeft: '1.1rem' }}>{demo.feito.map(f => <li key={f} className="text-sm">{f}</li>)}</ul>
          {demo.avisos.length > 0 && (
            <div className="alert alert-warning" role="status" style={{ marginTop: 'var(--space-3)', display: 'block' }}>
              <strong>Alguns itens não entraram:</strong>
              <ul style={{ paddingLeft: '1.1rem' }}>{demo.avisos.map(a => <li key={a} className="text-sm">{a}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
