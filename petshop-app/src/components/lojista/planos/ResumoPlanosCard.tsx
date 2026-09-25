import Link from 'next/link'
import { dataBR, type ResumoPlanos } from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { IconArrowRight, IconRepeat } from '@/components/icons'

// Card do Dashboard: só o essencial dos planos, com link pros detalhes.
export default function ResumoPlanosCard({ resumo }: { resumo: ResumoPlanos }) {
  return (
    <div className="card plano-resumo" style={{ marginBottom: 'var(--space-8)' }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <h3 className="relatorio-secao-titulo" style={{ margin: 0 }}>
          <IconRepeat style={{ width: 15, height: 15 }} /> Planos
        </h3>
        <Link href="/lojista/planos?aba=cobrancas" className="btn btn-ghost btn-sm">
          Ver detalhes <IconArrowRight style={{ width: 14, height: 14 }} />
        </Link>
      </div>
      <div className="plano-resumo-numeros">
        <div><span>{resumo.ativas}</span>planos ativos</div>
        <div><span>{formatarReais(resumo.receita_mensal)}</span>receita recorrente/mês</div>
        <Link href="/lojista/planos?aba=cobrancas&filtro=pendentes">
          <span>{resumo.pendentes_qtd}</span>a receber · {formatarReais(resumo.pendentes_valor)}
        </Link>
        <Link href="/lojista/planos?aba=cobrancas&filtro=vencidas" className={resumo.vencidas_qtd > 0 ? 'is-alerta' : ''}>
          <span>{resumo.vencidas_qtd}</span>vencida{resumo.vencidas_qtd !== 1 ? 's' : ''} · {formatarReais(resumo.vencidas_valor)}
        </Link>
        <div><span>{resumo.utilizacoes_mes}</span>benefícios usados no mês</div>
      </div>
      {resumo.proximas.length > 0 && (
        <div className="plano-resumo-proximas">
          <span className="text-xs text-muted">Próximas cobranças (7 dias)</span>
          {resumo.proximas.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {dataBR(p.data)} · {p.id_cliente ? <Link href={`/lojista/clientes/${p.id_cliente}`}>{p.pet ?? p.cliente}</Link> : (p.pet ?? '—')} · {p.plano}
              </span>
              <strong>{formatarReais(p.valor)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
