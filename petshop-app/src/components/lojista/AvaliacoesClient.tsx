'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PRESETS, type PeriodoPreset, type Periodo } from '@/lib/relatorios'
import { hojeBrasilISO } from '@/lib/agenda'
import { IconChevronLeft, IconChevronRight, IconInbox, IconStar } from '@/components/icons'
import { Estrelas, formatarMedia } from '@/components/cliente/Estrelas'
import FiltroPeriodo from '@/components/lojista/FiltroPeriodo'
import { GradeIndicadores, Indicador } from '@/components/relatorio/Indicador'
import { DuasColunas, NotaDaSecao, Pilha, Secao, SecaoVazia } from '@/components/relatorio/Secao'
import { Ranking } from '@/components/relatorio/Ranking'

// Espelha o retorno de fn_avaliacoes_lojista (migration 034).
export interface LinhaAvaliacao {
  id_avaliacao: string
  nota: number
  comentario: string | null
  created_at: string
  id_agendamento: string
  dt_agendamento: string
  hr_agendamento: string
  nome_cliente: string
  id_cliente: string
  nome_pet: string
  nome_servico: string
  nome_funcionario: string | null
}

// "geral" nunca leva filtro; "periodo" leva todos os filtros da tela.
// Ficam separados de propósito pra não misturar as duas médias.
export interface ResumoAvaliacoes {
  geral: { media: number | null; total: number }
  periodo: { media: number | null; total: number; porNota: Record<1 | 2 | 3 | 4 | 5, number> }
}

interface Props {
  resumo: ResumoAvaliacoes
  avaliacoes: LinhaAvaliacao[]
  totalLista: number
  pagina: number
  pageSize: number
  preset: PeriodoPreset | null
  periodo: Periodo | null
  filtroNota: number | null
  filtroServico: string
  filtroFuncionario: string
  servicos: { id_servico: string; nome: string }[]
  funcionarios: { id_funcionario: string; nome: string }[]
}

const NOTAS = [5, 4, 3, 2, 1] as const

// Aqui o filtro de período começa vazio ("Todo o período"), antes das
// opções dos relatórios de vendas.
const TODO_O_PERIODO = 'todo'
const OPCOES_PERIODO: { value: PeriodoPreset | typeof TODO_O_PERIODO; label: string }[] = [
  { value: TODO_O_PERIODO, label: 'Todo o período' },
  ...PRESETS,
]

export default function AvaliacoesClient({
  resumo, avaliacoes, totalLista, pagina, pageSize, preset, periodo,
  filtroNota, filtroServico, filtroFuncionario, servicos, funcionarios,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Filtros moram na URL (mesmo padrão dos Relatórios de Vendas): o
  // servidor faz a agregação e a paginação, o navegador só re-renderiza.
  function navegar(overrides: Record<string, string | undefined>) {
    const atual: Record<string, string | undefined> = {
      periodo: preset ?? undefined,
      ini: preset === 'personalizado' ? periodo?.ini : undefined,
      fim: preset === 'personalizado' ? periodo?.fim : undefined,
      nota: filtroNota ? String(filtroNota) : undefined,
      servico: filtroServico || undefined,
      funcionario: filtroFuncionario || undefined,
      pagina: pagina !== 1 ? String(pagina) : undefined,
      ...overrides,
    }
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(atual)) if (v) qs.set(k, v)
    const query = qs.toString()
    startTransition(() => router.push(`/lojista/configuracoes/avaliacoes${query ? `?${query}` : ''}`))
  }

  function mudarPreset(novo: PeriodoPreset | null) {
    navegar({ periodo: novo ?? undefined, ini: undefined, fim: undefined, pagina: undefined })
  }

  const totalPaginas = Math.max(1, Math.ceil(totalLista / pageSize))
  const temFiltro = !!(preset || filtroNota || filtroServico || filtroFuncionario)
  const maiorContagem = Math.max(1, ...NOTAS.map(n => resumo.periodo.porNota[n]))

  return (
    <div style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 150ms', pointerEvents: isPending ? 'none' : 'auto' }}>
      {/* Só no computador: no celular a barra do topo já tem a seta de voltar. */}
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm so-desktop" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">Avaliações</h1>
        <p className="page-subtitle">
          Avaliações dos clientes da sua loja.
          {isPending && ' · Atualizando...'}
        </p>
      </div>

      {resumo.geral.total === 0 ? (
        <div className="empty-state card">
          <IconStar style={{ width: 36, height: 36, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
          <div className="empty-state-title">Ainda não há avaliações para esta loja.</div>
          <p>Assim que um cliente avaliar um atendimento finalizado, ela aparece aqui.</p>
        </div>
      ) : (
        <Pilha>
          {/* ── Visão geral da loja (sem filtro nenhum) ── */}
          <GradeIndicadores colunas={2}>
            <Indicador
              rotulo="Média geral da loja"
              valor={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {formatarMedia(resumo.geral.media ?? 0)}
                  <Estrelas nota={resumo.geral.media ?? 0} tamanho={18} />
                </span>
              }
              icone={<IconStar />}
              detalhe="todas as avaliações, sem filtro"
            />
            <Indicador
              rotulo="Total de avaliações"
              valor={resumo.geral.total}
              icone={<IconInbox />}
              detalhe="desde a primeira avaliação recebida"
            />
          </GradeIndicadores>

          {/* ── Filtros ── */}
          <div className="relatorio-filtros card" style={{ marginBottom: 0 }}>
            {/* Sem período escolhido vale "Todo o período". Ao entrar em
                "Personalizado" sem datas, o servidor usa os últimos 30 dias. */}
            <FiltroPeriodo
              opcoes={OPCOES_PERIODO}
              valor={preset ?? TODO_O_PERIODO}
              onMudar={novo => mudarPreset(novo === TODO_O_PERIODO ? null : novo)}
              ini={periodo?.ini ?? hojeBrasilISO()}
              fim={periodo?.fim ?? hojeBrasilISO()}
              onPersonalizado={(ini, fim) => navegar({ periodo: 'personalizado', ini, fim, pagina: undefined })}
              dataMax={hojeBrasilISO()}
            />

            <div className="relatorio-tabela-filtros" style={{ marginTop: 'var(--space-4)', marginBottom: 0 }}>
              <select className="form-select" value={filtroNota ?? ''} onChange={e => navegar({ nota: e.target.value || undefined, pagina: undefined })}>
                <option value="">Todas as notas</option>
                {NOTAS.map(n => <option key={n} value={n}>{n} {n === 1 ? 'estrela' : 'estrelas'}</option>)}
              </select>
              <select className="form-select" value={filtroServico} onChange={e => navegar({ servico: e.target.value || undefined, pagina: undefined })}>
                <option value="">Todos os serviços</option>
                {servicos.map(s => <option key={s.id_servico} value={s.id_servico}>{s.nome}</option>)}
              </select>
              {funcionarios.length > 0 && (
                <select className="form-select" value={filtroFuncionario} onChange={e => navegar({ funcionario: e.target.value || undefined, pagina: undefined })}>
                  <option value="">Todos os profissionais</option>
                  {funcionarios.map(f => <option key={f.id_funcionario} value={f.id_funcionario}>{f.nome}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* ── Recorte filtrado: média e distribuição ── */}
          <DuasColunas>
            <Secao
              titulo={temFiltro ? 'Média no período / filtro selecionado' : 'Média de todas as avaliações'}
              icone={<IconStar />}
            >
              {resumo.periodo.total === 0 || resumo.periodo.media == null ? (
                <SecaoVazia>Nenhuma avaliação com esses filtros.</SecaoVazia>
              ) : (
                <>
                  <div className="avaliacao-media">
                    <span className="avaliacao-media-valor" style={{ fontSize: '2rem' }}>{formatarMedia(resumo.periodo.media)}</span>
                    <Estrelas nota={resumo.periodo.media} tamanho={20} />
                  </div>
                  <NotaDaSecao>
                    {resumo.periodo.total} {resumo.periodo.total === 1 ? 'avaliação' : 'avaliações'}
                    {periodo && ` entre ${format(parseISO(periodo.ini), 'dd/MM/yyyy')} e ${format(parseISO(periodo.fim), 'dd/MM/yyyy')}`}
                  </NotaDaSecao>
                </>
              )}
            </Secao>

            <Secao titulo="Distribuição das notas" descricao="Quantas avaliações de cada nota, com esses filtros">
              <Ranking
                itens={NOTAS.map(n => ({
                  chave: String(n),
                  titulo: `${n} ${n === 1 ? 'estrela' : 'estrelas'}`,
                  valor: resumo.periodo.porNota[n],
                  parte: resumo.periodo.porNota[n] / maiorContagem,
                }))}
              />
            </Secao>
          </DuasColunas>

          {/* ── Lista ── */}
          <Secao titulo="Avaliações recebidas">
            {avaliacoes.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
                <IconInbox style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-3)' }} />
                <p className="text-sm text-muted">Nenhuma avaliação com esses filtros.</p>
              </div>
            ) : (
              <>
                {avaliacoes.map(a => (
                  <div key={a.id_avaliacao} className="avaliacao-item">
                    <div className="avaliacao-item-topo">
                      <Estrelas nota={a.nota} />
                      <span className="text-xs text-muted">{format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    </div>
                    <p className={`avaliacao-item-comentario ${a.comentario ? '' : 'is-vazio'}`}>
                      {a.comentario ? <>&ldquo;{a.comentario}&rdquo;</> : 'Sem comentário'}
                    </p>
                    <div className="avaliacao-item-meta">
                      <span>Cliente: <Link href={`/lojista/clientes/${a.id_cliente}`}><strong>{a.nome_cliente}</strong></Link></span>
                      <span>Pet: <strong>{a.nome_pet}</strong></span>
                      <span>Serviço: <strong>{a.nome_servico}</strong></span>
                      {a.nome_funcionario && <span>Profissional: <strong>{a.nome_funcionario}</strong></span>}
                      <span>Atendimento: <strong>{format(parseISO(a.dt_agendamento), 'dd/MM/yyyy')}</strong></span>
                    </div>
                  </div>
                ))}

                <div className="relatorio-paginacao">
                  <span className="text-sm text-muted">
                    {totalLista} avaliaç{totalLista !== 1 ? 'ões' : 'ão'} · página {pagina} de {totalPaginas}
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => navegar({ pagina: String(pagina - 1) })} disabled={pagina <= 1}>
                      <IconChevronLeft style={{ width: 14, height: 14 }} /> Anterior
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => navegar({ pagina: String(pagina + 1) })} disabled={pagina >= totalPaginas}>
                      Próxima <IconChevronRight style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </Secao>
        </Pilha>
      )}
    </div>
  )
}
