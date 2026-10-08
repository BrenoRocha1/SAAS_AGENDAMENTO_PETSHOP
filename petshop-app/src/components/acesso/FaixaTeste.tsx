// Aviso discreto no topo do painel enquanto faltam poucos dias.
export default function FaixaTeste({ dias }: { dias: number }) {
  return (
    <div className="alert alert-warning" role="status" style={{ marginBottom: 'var(--space-4)' }}>
      <span>
        {dias <= 1 ? 'Seu período de teste termina hoje.' : `Seu período de teste termina em ${dias} dias.`}
      </span>
    </div>
  )
}
