import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { hojeBrasilISO } from '@/lib/agenda'
import { obterContextoLojista } from '@/lib/lojista-context'
import {
  ROTULO_MODALIDADE,
  emMovimento,
  formatarReais,
  normalizarCorrida,
  rotuloStatusCorrida,
  type CorridaDetalhe,
} from '@/lib/taxidog'
import { IconAlert, IconCar, IconChartBar, IconCheck, IconChevronLeft, IconClose, IconMoney, IconUserBadge } from '@/components/icons'

export const metadata: Metadata = { title: 'Relatório de corridas — TaxiDog' }

interface Props {
  searchParams: Promise<{ de?: string; ate?: string; taxidog?: string }>
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
// Um período muito longo vira uma consulta pesada à toa — o relatório é
// pra acompanhar semana/mês.
const MAX_DIAS = 186

function classeBadge(c: CorridaDetalhe): string {
  if (c.status === 'cancelada') return 'badge-cancelado'
  if (c.status === 'concluida') return 'badge-concluido'
  if (emMovimento(c.status)) return 'badge-em-andamento'
  return c.id_funcionario ? 'badge-aceito' : 'badge-pendente'
}

export default async function RelatorioCorridasPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null

  // Quem gerencia a agenda vê todas as corridas da loja; o TaxiDog, só as
  // dele (fn_listar_corridas ainda devolve as sem TaxiDog pra ele poder
  // pegar — aqui elas não contam, não são dele).
  const gestor = contexto.podeGerenciarAgenda
  const modoMotorista = !gestor && contexto.podeTaxidog

  const cabecalho = (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      <div>
        <h1 className="page-title">Relatório de corridas</h1>
        <p className="page-subtitle">{modoMotorista ? 'As corridas que você fez no período' : 'Corridas do TaxiDog da loja no período'}</p>
      </div>
      <Link href={modoMotorista ? '/lojista/taxidog' : '/lojista/kanban?visao=taxidog'} className="btn btn-ghost btn-sm">
        <IconChevronLeft style={{ width: 14, height: 14 }} /> {modoMotorista ? 'Minhas rotas' : 'Rotas do TaxiDog'}
      </Link>
    </div>
  )

  if (!gestor && !contexto.podeTaxidog) {
    return (
      <>
        {cabecalho}
        <div className="empty-state card">
          <IconCar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Sem permissão para ver as corridas</div>
          <p>Fale com o responsável pelo petshop para liberar o acesso.</p>
        </div>
      </>
    )
  }

  // ── Período ───────────────────────────────────────────────
  const hoje = hojeBrasilISO()
  const hojeObj = parseISO(hoje)
  const inicioMes = format(startOfMonth(hojeObj), 'yyyy-MM-dd')
  let de = params.de && DATA_RE.test(params.de) ? params.de : inicioMes
  let ate = params.ate && DATA_RE.test(params.ate) ? params.ate : hoje
  if (de > ate) [de, ate] = [ate, de]
  if (differenceInCalendarDays(parseISO(ate), parseISO(de)) > MAX_DIAS) {
    de = format(addDays(parseISO(ate), -MAX_DIAS), 'yyyy-MM-dd')
  }

  const mesPassado = subMonths(hojeObj, 1)
  const presets = [
    { rotulo: 'Hoje', de: hoje, ate: hoje },
    { rotulo: 'Últimos 7 dias', de: format(addDays(hojeObj, -6), 'yyyy-MM-dd'), ate: hoje },
    { rotulo: 'Este mês', de: inicioMes, ate: hoje },
    { rotulo: 'Mês passado', de: format(startOfMonth(mesPassado), 'yyyy-MM-dd'), ate: format(endOfMonth(mesPassado), 'yyyy-MM-dd') },
  ]
  const filtroTaxidog = gestor ? (params.taxidog ?? '') : ''
  const hrefPeriodo = (d: string, a: string) =>
    `/lojista/taxidog/relatorio?de=${d}&ate=${a}${filtroTaxidog ? `&taxidog=${filtroTaxidog}` : ''}`

  // ── Dados ─────────────────────────────────────────────────
  const { data: linhas, error } = await supabase.rpc('fn_listar_corridas', { p_data_ini: de, p_data_fim: ate })
  if (error) {
    return (
      <>
        {cabecalho}
        <div className="alert alert-error">
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar as corridas. Execute a migration 042_taxidog.sql se ainda não rodou.
            {process.env.NODE_ENV !== 'production' && ` [DEV: ${error.message}]`}
          </span>
        </div>
      </>
    )
  }

  const todas = ((linhas ?? []) as Record<string, unknown>[]).map(normalizarCorrida)
  // Opções do filtro por TaxiDog saem das próprias corridas do período.
  const taxidogsDoPeriodo = [...new Map(
    todas.filter(c => c.id_funcionario).map(c => [c.id_funcionario!, c.funcionario_nome ?? 'TaxiDog'])
  ).entries()].sort((x, y) => x[1].localeCompare(y[1]))

  const corridas = todas
    .filter(c => (modoMotorista ? c.id_funcionario === user!.id : true))
    .filter(c => !filtroTaxidog || (filtroTaxidog === 'sem' ? !c.id_funcionario : c.id_funcionario === filtroTaxidog))
    .sort((x, y) => (y.dt_agendamento + y.hr_agendamento).localeCompare(x.dt_agendamento + x.hr_agendamento))

  const concluidas = corridas.filter(c => c.status === 'concluida')
  const canceladas = corridas.filter(c => c.status === 'cancelada')
  const emAberto = corridas.length - concluidas.length - canceladas.length
  const valorConcluidas = concluidas.reduce((soma, c) => soma + c.valor, 0)

  // Por TaxiDog (só pra quem vê a loja inteira): concluídas e valor.
  const porTaxidog = gestor
    ? [...concluidas.reduce((mapa, c) => {
        const chave = c.id_funcionario ?? 'sem'
        const atual = mapa.get(chave) ?? { nome: c.funcionario_nome ?? 'Sem TaxiDog', qtd: 0, valor: 0 }
        mapa.set(chave, { ...atual, qtd: atual.qtd + 1, valor: atual.valor + c.valor })
        return mapa
      }, new Map<string, { nome: string; qtd: number; valor: number }>()).values()].sort((x, y) => y.valor - x.valor)
    : []

  return (
    <>
      {cabecalho}

      {/* Período (formulário GET — funciona sem JavaScript) */}
      <div className="relatorio-filtros card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="relatorio-presets">
          {presets.map(p => (
            <Link key={p.rotulo} href={hrefPeriodo(p.de, p.ate)} className={`btn btn-sm ${p.de === de && p.ate === ate ? 'btn-primary' : 'btn-secondary'}`}>
              {p.rotulo}
            </Link>
          ))}
        </div>
        <form method="get" action="/lojista/taxidog/relatorio" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="de">De</label>
            <input id="de" name="de" type="date" className="form-input" defaultValue={de} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="ate">Até</label>
            <input id="ate" name="ate" type="date" className="form-input" defaultValue={ate} />
          </div>
          {gestor && taxidogsDoPeriodo.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="taxidog">TaxiDog</label>
              <select id="taxidog" name="taxidog" className="form-select" defaultValue={filtroTaxidog}>
                <option value="">Todos</option>
                {taxidogsDoPeriodo.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                <option value="sem">Sem TaxiDog</option>
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-secondary btn-sm">Filtrar</button>
        </form>
      </div>

      {/* Indicadores */}
      <div className="grid-4" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-card-icon tone-success"><IconCheck style={{ width: 20, height: 20 }} /></div>
          <div className="stat-card-value">{concluidas.length}</div>
          <div className="stat-card-label">{concluidas.length === 1 ? 'Corrida concluída' : 'Corridas concluídas'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon tone-warning"><IconMoney style={{ width: 20, height: 20 }} /></div>
          <div className="stat-card-value">{formatarReais(valorConcluidas)}</div>
          <div className="stat-card-label">Valor das concluídas</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon tone-info"><IconCar style={{ width: 20, height: 20 }} /></div>
          <div className="stat-card-value">{emAberto}</div>
          <div className="stat-card-label">Em aberto</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon tone-danger"><IconClose style={{ width: 20, height: 20 }} /></div>
          <div className="stat-card-value">{canceladas.length}</div>
          <div className="stat-card-label">{canceladas.length === 1 ? 'Cancelada' : 'Canceladas'}</div>
        </div>
      </div>

      {gestor && porTaxidog.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 className="relatorio-secao-titulo">
            <IconUserBadge style={{ width: 15, height: 15 }} /> Por TaxiDog (concluídas)
          </h3>
          <div className="relatorio-lista">
            {porTaxidog.map(t => (
              <div key={t.nome} className="relatorio-lista-item">
                <div className="relatorio-lista-info">
                  <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{t.nome}</div>
                  <div className="text-xs text-muted">{t.qtd} {t.qtd === 1 ? 'corrida' : 'corridas'}</div>
                </div>
                <div className="font-semibold text-success">{formatarReais(t.valor)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="relatorio-secao-titulo">
          <IconChartBar style={{ width: 15, height: 15 }} /> Corridas do período
        </h3>
        {corridas.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma corrida neste período.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Pet</th>
                  <th>Cliente</th>
                  <th>Transporte</th>
                  {gestor && <th>TaxiDog</th>}
                  <th>Status</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {corridas.map(c => (
                  <tr key={c.id_corrida}>
                    <td>{format(parseISO(c.dt_agendamento), 'dd/MM/yyyy')}</td>
                    <td>{c.hr_agendamento.slice(0, 5)}</td>
                    <td>{c.pet_nome}</td>
                    <td>{c.cliente_nome}</td>
                    <td>{ROTULO_MODALIDADE[c.modalidade]}</td>
                    {gestor && <td>{c.funcionario_nome ?? '—'}</td>}
                    <td>
                      <span className={`badge ${classeBadge(c)}`} style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {rotuloStatusCorrida({ status: c.status, modalidade: c.modalidade, temTaxiDog: !!c.id_funcionario, statusAgendamento: c.status_agendamento })}
                      </span>
                    </td>
                    <td>{formatarReais(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
