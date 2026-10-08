'use client'

import { useState, useTransition } from 'react'
import { gerarCodigoInternoAction, revogarCodigoInternoAction } from '@/lib/actions-interno'

// Mostra o código UMA vez, logo depois de gerar. Depois só o hash existe.
export default function CodigoAcesso({ geradoEm }: { geradoEm: string | null }) {
  const [codigo, setCodigo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pendente, iniciar] = useTransition()

  function gerar() {
    if (geradoEm && !window.confirm('Gerar um novo código invalida o anterior. Continuar?')) return
    setErro(null)
    setCopiado(false)
    iniciar(async () => {
      const r = await gerarCodigoInternoAction()
      if (r.error) setErro(r.error)
      else setCodigo(r.codigo ?? null)
    })
  }

  function revogar() {
    if (!window.confirm('Revogar seu código de acesso?')) return
    setErro(null)
    iniciar(async () => {
      const r = await revogarCodigoInternoAction()
      if (r.error) setErro(r.error)
      else setCodigo(null)
    })
  }

  async function copiar() {
    if (!codigo) return
    try { await navigator.clipboard.writeText(codigo); setCopiado(true) } catch { /* sem permissão: copie na mão */ }
  }

  return (
    <div className="card" style={{ padding: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
      <h2 className="page-title" style={{ fontSize: '1.125rem', marginBottom: 'var(--space-2)' }}>Meu código de acesso</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-3)' }}>
        Entra no painel só com o código, sem Google. Funciona como uma senha: não compartilhe. {geradoEm ? 'Você já tem um código ativo.' : 'Você ainda não gerou um.'}
      </p>
      {codigo && (
        <div className="alert alert-warning" role="status" style={{ marginBottom: 'var(--space-3)', display: 'block' }}>
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.25rem', letterSpacing: '0.08em', fontWeight: 700, wordBreak: 'break-all' }}>{codigo}</div>
          <div className="text-sm" style={{ marginTop: 6 }}>Guarde agora — ele não aparece de novo.</div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={gerar} disabled={pendente}>{geradoEm || codigo ? 'Gerar novo código' : 'Gerar código'}</button>
        {(geradoEm || codigo) && <button type="button" className="btn btn-danger btn-sm" onClick={revogar} disabled={pendente}>Revogar</button>}
      </div>
      {erro && <span className="form-error">{erro}</span>}
    </div>
  )
}
