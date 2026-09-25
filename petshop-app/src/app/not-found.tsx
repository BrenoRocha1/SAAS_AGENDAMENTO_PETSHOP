import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Página não encontrada' }

// 404 do app inteiro (endereço digitado errado, link antigo, loja que não
// existe mais) — em português, com um caminho de volta.
export default function NaoEncontrado() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-6)' }}>
      <div className="card empty-state" style={{ maxWidth: 420, width: '100%' }}>
        <div className="empty-state-title">Página não encontrada</div>
        <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
          O endereço pode estar errado ou a página não existe mais.
        </p>
        <Link href="/" className="btn btn-primary btn-sm">Ir para o início</Link>
      </div>
    </main>
  )
}
