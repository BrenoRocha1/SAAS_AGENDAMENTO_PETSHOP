// "Banho 3/4 · Tosa 1/1" — usados de cada benefício no período, com barra.
export default function BeneficiosBarra({ beneficios }: {
  beneficios: { servico: string; quantidade: number; usados: number }[]
}) {
  if (beneficios.length === 0) return null
  return (
    <ul className="plano-beneficios">
      {beneficios.map(b => {
        const usados = Number(b.usados)
        const esgotado = usados >= b.quantidade
        return (
          <li key={b.servico} className={esgotado ? 'is-esgotado' : ''}>
            <div className="flex items-center justify-between gap-2">
              <span>{b.servico}</span>
              <span className="text-xs">
                <strong>{usados}</strong> de {b.quantidade} usado{b.quantidade !== 1 ? 's' : ''}
                {!esgotado && <span className="text-muted"> · {b.quantidade - usados} restante{b.quantidade - usados !== 1 ? 's' : ''}</span>}
              </span>
            </div>
            <div className="plano-beneficio-barra" aria-hidden>
              <span style={{ width: `${Math.min(100, (usados / b.quantidade) * 100)}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
