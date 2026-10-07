import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
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
import PeriodoRelatorioTaxiDog from '@/components/lojista/PeriodoRelatorioTaxiDog'
import { GradeIndicadores, Indicador } from '@/components/relatorio/Indicador'
import { Pilha, Secao } from '@/components/relatorio/Secao'
import { Ranking } from '@/components/relatorio/Ranking'
import Ilustracao from '@/components/Ilustracao'

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
  const user = await obterUsuario()
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
        <IconChevronLeft style={{ width: 14, height: 14 }} /> {modoMotorista ? 'Minhas corridas' : 'Corridas do TaxiDog'}
      </Link>
    </div>
  )

  if (!gestor && !contexto.podeTaxidog) {
    return (
      <>
        {cabecalho}
        <div className="empty-state card">
          <Ilustracao nome="sem-permissao" />
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
  // O TaxiDog não vê corrida de dia que ainda não chegou.
  if (modoMotorista && ate > hoje) ate = hoje
  if (modoMotorista && de > hoje) de = hoje
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

      {/* Período: opções prontas e, em "Personalizado", o calendário. */}
      <div className="relatorio-filtros card" style={{ marginBottom: 'var(--space-6)' }}>
        <PeriodoRelatorioTaxiDog
          presets={presets}
          de={de}
          ate={ate}
          filtroTaxidog={filtroTaxidog}
          dataMax={modoMotorista ? hoje : undefined}
        />
        {/* Filtro por TaxiDog (formulário GET), mantendo o período. */}
        {gestor && taxidogsDoPeriodo.length > 0 && (
          <form method="get" action="/lojista/taxidog/relatorio" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <input type="hidden" name="de" value={de} />
            <input type="hidden" name="ate" value={ate} />
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="taxidog">TaxiDog</label>
              <select id="taxidog" name="taxidog" className="form-select" defaultValue={filtroTaxidog}>
                <option value="">Todos</option>
                {taxidogsDoPeriodo.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                <option value="sem">Sem TaxiDog</option>
              </select>
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">Filtrar</button>
          </form>
        )}
      </div>

      {/* Período sem corrida nenhuma: o desenho no lugar dos números zerados,
          como no Relatório de Vendas. */}
      {corridas.length === 0 ? (
        <div className="empty-state card">
          <Ilustracao nome="relatorios" />
          <div className="empty-state-title">Nenhuma corrida neste período</div>
          <p>
            {filtroTaxidog
              ? 'Tente escolher outro período ou outro TaxiDog.'
              : modoMotorista
                ? 'Suas corridas aparecem aqui conforme você atende. Tente escolher outro período.'
                : 'Tente escolher outro período ou confira se há corridas de TaxiDog agendadas.'}
          </p>
        </div>
      ) : (
        <Pilha>
          {/* Indicadores */}
          <GradeIndicadores colunas={4}>
            <Indicador
              rotulo={concluidas.length === 1 ? 'Corrida concluída' : 'Corridas concluídas'}
              valor={concluidas.length}
              icone={<IconCheck />}
            />
            <Indicador rotulo="Valor das concluídas" valor={formatarReais(valorConcluidas)} icone={<IconMoney />} />
            <Indicador rotulo="Em aberto" valor={emAberto} icone={<IconCar />} />
            <Indicador rotulo={canceladas.length === 1 ? 'Cancelada' : 'Canceladas'} valor={canceladas.length} icone={<IconClose />} />
          </GradeIndicadores>

          {gestor && porTaxidog.length > 0 && (
            <Secao titulo="Por TaxiDog" icone={<IconUserBadge />} descricao="Corridas concluídas de cada um no período">
              <Ranking
                comIniciais
                itens={porTaxidog.map(t => ({
                  chave: t.nome,
                  titulo: t.nome,
                  // Corridas sem TaxiDog atribuído não são uma pessoa: sem iniciais.
                  sigla: t.nome === 'Sem TaxiDog' ? '—' : undefined,
                  valor: formatarReais(t.valor),
                  detalhe: `${t.qtd} ${t.qtd === 1 ? 'corrida' : 'corridas'}`,
                  parte: valorConcluidas > 0 ? t.valor / valorConcluidas : undefined,
                }))}
              />
            </Secao>
          )}

          <Secao titulo="Corridas do período" icone={<IconChartBar />}>
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
                      <td style={{ whiteSpace: 'nowrap' }}>{formatarReais(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        </Pilha>
      )}
    </>
  )
}
