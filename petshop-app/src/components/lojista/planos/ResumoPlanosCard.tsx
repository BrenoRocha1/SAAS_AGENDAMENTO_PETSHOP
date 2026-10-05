import Link from 'next/link'
import { dataBR, type ResumoPlanos } from '@/lib/planos'
import { formatarReais } from '@/lib/taxidog'
import { IconArrowRight, IconRepeat } from '@/components/icons'
import { GrupoDaSecao, Secao } from '@/components/relatorio/Secao'
import { MiniIndicadores } from '@/components/relatorio/MiniIndicadores'

// Card do Dashboard: só o essencial dos planos, com link pros detalhes.
export default function ResumoPlanosCard({ resumo }: { resumo: ResumoPlanos }) {
  return (
    <Secao
      titulo="Planos"
      icone={<IconRepeat />}
      descricao="Assinaturas ativas e cobranças deste mês"
      acao={
        <Link href="/lojista/planos?aba=cobrancas" className="btn btn-ghost btn-sm">
          Ver detalhes <IconArrowRight style={{ width: 14, height: 14 }} />
        </Link>
      }
    >
      <MiniIndicadores
        itens={[
          { valor: resumo.ativas, rotulo: 'planos ativos' },
          { valor: formatarReais(resumo.receita_mensal), rotulo: 'receita recorrente/mês' },
          { valor: resumo.pendentes_qtd, rotulo: `a receber · ${formatarReais(resumo.pendentes_valor)}`, href: '/lojista/planos?aba=cobrancas&filtro=pendentes' },
          {
            valor: resumo.vencidas_qtd,
            rotulo: `vencida${resumo.vencidas_qtd !== 1 ? 's' : ''} · ${formatarReais(resumo.vencidas_valor)}`,
            tom: resumo.vencidas_qtd > 0 ? 'perigo' : 'padrao',
            href: '/lojista/planos?aba=cobrancas&filtro=vencidas',
          },
          { valor: resumo.utilizacoes_mes, rotulo: 'benefícios usados no mês' },
        ]}
      />
      {resumo.proximas.length > 0 && (
        <GrupoDaSecao titulo="Próximas cobranças (7 dias)">
          <div className="plano-resumo-proximas" style={{ marginTop: 0 }}>
            {resumo.proximas.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {dataBR(p.data)} · {p.id_cliente ? <Link href={`/lojista/clientes/${p.id_cliente}`}>{p.pet ?? p.cliente}</Link> : (p.pet ?? '—')} · {p.plano}
                </span>
                <strong>{formatarReais(p.valor)}</strong>
              </div>
            ))}
          </div>
        </GrupoDaSecao>
      )}
    </Secao>
  )
}
