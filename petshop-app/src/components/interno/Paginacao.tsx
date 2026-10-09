import Link from 'next/link'

// Paginação por links (?pagina=N), preservando os outros filtros.
export default function Paginacao({
  base, params, pagina, total, tamanho,
}: { base: string; params: Record<string, string>; pagina: number; total: number; tamanho: number }) {
  const paginas = Math.max(1, Math.ceil(total / tamanho))
  if (paginas <= 1) return null
  const href = (n: number) => {
    const q = new URLSearchParams({ ...params, pagina: String(n) })
    return `${base}?${q.toString()}`
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'center', marginTop: 'var(--space-5)' }}>
      {pagina > 1 ? <Link className="btn btn-secondary btn-sm" href={href(pagina - 1)}>Anterior</Link> : <span />}
      <span className="text-sm text-muted">Página {pagina} de {paginas} · {total} registros</span>
      {pagina < paginas ? <Link className="btn btn-secondary btn-sm" href={href(pagina + 1)}>Próxima</Link> : <span />}
    </div>
  )
}
