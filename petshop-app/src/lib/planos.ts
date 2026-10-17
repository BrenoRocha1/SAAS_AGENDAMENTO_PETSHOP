// ============================================================
// Planos e cobranças recorrentes (migration 060) — tipos e rótulos
// ============================================================
// Os dados vêm das funções fn_* do banco já em JSON; aqui ficam só os
// formatos, os nomes que aparecem na tela e as regras de exibição.

export type Periodicidade = 'mensal' | 'quinzenal' | 'trimestral' | 'semestral' | 'anual' | 'personalizado'
export type StatusCobrancaPlano = 'pendente' | 'pago' | 'cancelado'
// "vencido" não é gravado: é a cobrança pendente com vencimento passado.
export type StatusCobrancaExibido = StatusCobrancaPlano | 'vencido'

export const PERIODICIDADES: { value: Periodicidade; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'quinzenal', label: 'A cada 15 dias' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'personalizado', label: 'Personalizado' },
]

export function rotuloPeriodicidade(p: string, intervaloDias?: number | null): string {
  if (p === 'personalizado') return intervaloDias ? `A cada ${intervaloDias} dias` : 'Personalizado'
  return PERIODICIDADES.find(x => x.value === p)?.label ?? p
}

// "/mês", "/15 dias"… pra ficar ao lado do valor.
export function sufixoPeriodo(p: string, intervaloDias?: number | null): string {
  switch (p) {
    case 'mensal': return '/mês'
    case 'quinzenal': return '/15 dias'
    case 'trimestral': return '/trimestre'
    case 'semestral': return '/semestre'
    case 'anual': return '/ano'
    default: return intervaloDias ? `/${intervaloDias} dias` : ''
  }
}

export const ROTULO_STATUS_COBRANCA: Record<StatusCobrancaExibido, string> = {
  pendente: 'Pendente',
  pago: 'Pago',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

export const CLASSE_STATUS_COBRANCA: Record<StatusCobrancaExibido, string> = {
  pendente: 'badge-pendente',
  pago: 'badge-concluido',
  vencido: 'badge-cancelado',
  cancelado: 'badge-inativo',
}

export function statusCobrancaExibido(status: string, vencimento: string, hojeISO: string): StatusCobrancaExibido {
  if (status === 'pendente' && vencimento < hojeISO) return 'vencido'
  if (status === 'pago' || status === 'cancelado') return status
  return 'pendente'
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// ── Formatos que as funções do banco devolvem ──
export interface ServicoDoPlano { id_servico: string; servico: string; quantidade: number }

export interface Plano {
  id_plano: string
  nome: string
  descricao: string | null
  valor: number
  periodicidade: Periodicidade
  intervalo_dias: number | null
  ativo: boolean
  servicos: ServicoDoPlano[]
  assinaturas_ativas: number
}

export interface BeneficioPeriodo { servico: string; quantidade: number; usados: number }

export interface CobrancaPlano {
  id_cobranca: string
  numero: number
  valor: number
  vencimento: string
  forma_pagamento: string | null
  status: StatusCobrancaPlano
  pago_em: string | null
  periodo_inicio: string
  periodo_fim: string
}

export interface UtilizacaoPlano {
  servico: string
  data: string | null
  hora: string | null
  periodo: number
  funcionario: string | null
  estornada_em: string | null
  motivo_estorno: string | null
  registrado_em: string
  // Status do agendamento (migration 069) — saber se o uso ainda vai acontecer.
  status_agendamento?: string | null
}

export interface HistoricoPlano { tipo: string; descricao: string; em: string }
// fn_historico_planos: o evento já com quem e (migration 104) o plano.
export interface ItemHistoricoPlano extends HistoricoPlano {
  cliente?: string | null
  pet?: string | null
  id_cliente?: string | null
  plano?: string | null
}

// ── Histórico legível ──
// Cada evento do banco (assinatura_historico.tipo) vira um título curto, um
// grupo (para o filtro), uma cor e um detalhe — tirado da frase que o banco
// grava; quando o formato não bate, vai a frase inteira.
export type GrupoHistorico = 'assinaturas' | 'cobrancas' | 'usos' | 'planos'
export type TomHistorico = 'sucesso' | 'perigo' | 'aviso' | 'primario' | 'neutro'
export interface EventoLegivel { titulo: string; grupo: GrupoHistorico; tom: TomHistorico; detalhe: string }

export const GRUPOS_HISTORICO: { valor: GrupoHistorico | 'todos'; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Tudo' },
  { valor: 'assinaturas', rotulo: 'Assinaturas' },
  { valor: 'cobrancas', rotulo: 'Cobranças' },
  { valor: 'usos', rotulo: 'Usos' },
  { valor: 'planos', rotulo: 'Planos' },
]

// "1 cobrança(s) … cancelada(s)" → "1 cobrança … cancelada"; 2+ → plural.
const plural = (t: string) => t.replace(/(\d+) ([^()]*?)\(s\)([^()]*?)\(s\)/, (_m, n, a, b) => (n === '1' ? `${n} ${a}${b}` : `${n} ${a}s${b}s`)).replace(/\(s\)/g, '')

const curta = (d: string) => d.replace(/(\d{2})\/(\d{2})\/\d{4}/g, '$1/$2')

export function descreverEvento(tipo: string, descricao: string): EventoLegivel {
  const d = descricao ?? ''
  const depoisDoTraco = (t: string) => (t.includes(' — ') ? t.split(' — ').slice(1).join(' — ') : t)
  switch (tipo) {
    case 'assinatura_criada':
      return { titulo: 'Plano atribuído', grupo: 'assinaturas', tom: 'sucesso', detalhe: curta(depoisDoTraco(d)) }
    case 'assinatura_cancelada':
      return { titulo: 'Assinatura cancelada', grupo: 'assinaturas', tom: 'perigo', detalhe: d.replace(/^Assinatura cancelada\.?\s*/i, '').replace(/^—\s*/, '') || 'Nenhuma cobrança nova será gerada.' }
    case 'periodo_iniciado':
    case 'renovada': {
      const m = d.match(/^Período (\d+) \(([\d/]+) a ([\d/]+)\).*R\$ ([\d.,]+).*vencimento ([\d/]+)/)
      return {
        titulo: tipo === 'renovada' ? 'Assinatura renovada' : '1º período começou',
        grupo: 'assinaturas',
        tom: 'primario',
        detalhe: m ? `Período ${m[1]}: ${curta(m[2])} a ${curta(m[3])} · cobrança de R$ ${m[4]} vence ${curta(m[5])}` : curta(d),
      }
    }
    case 'pagamento_registrado':
    case 'cobranca_alterada': {
      const m = d.match(/^Cobrança de R\$ ([\d.,]+) \(vencimento ([\d/]+)\): (\S+) → (\S+), forma (.+)$/)
      if (d.startsWith('Cancelamento:')) {
        return { titulo: 'Cobranças canceladas', grupo: 'cobrancas', tom: 'neutro', detalhe: plural(d.replace(/^Cancelamento:\s*/, '')) }
      }
      const pago = tipo === 'pagamento_registrado'
      return {
        titulo: pago ? 'Pagamento registrado' : 'Cobrança alterada',
        grupo: 'cobrancas',
        tom: pago ? 'sucesso' : 'aviso',
        detalhe: m ? `R$ ${m[1]} · vencimento ${curta(m[2])}${pago ? '' : ` · ${m[3]} → ${m[4]}`}${/não definida|^-$/i.test(m[5]) ? '' : ` · ${m[5]}`}` : curta(d),
      }
    }
    case 'beneficio_utilizado':
      return { titulo: 'Serviço do plano usado', grupo: 'usos', tom: 'primario', detalhe: curta(d.split(' — ')[0]) }
    case 'beneficio_estornado':
      return { titulo: 'Uso devolvido ao saldo', grupo: 'usos', tom: 'neutro', detalhe: curta(d.split(' — ')[0]) }
    case 'plano_criado':
      return { titulo: 'Plano criado', grupo: 'planos', tom: 'sucesso', detalhe: curta(d.replace(/^Plano (criado )?"[^"]+":\s*/, '')) }
    case 'plano_alterado':
      return { titulo: 'Plano alterado', grupo: 'planos', tom: 'primario', detalhe: curta(d.replace(/^Plano (alterado )?"[^"]+":\s*/, '')) }
    case 'plano_ativado':
      return { titulo: 'Plano ativado', grupo: 'planos', tom: 'sucesso', detalhe: 'Volta a poder ser atribuído.' }
    case 'plano_desativado':
      return { titulo: 'Plano desativado', grupo: 'planos', tom: 'neutro', detalhe: 'Quem já assinou continua; novas atribuições ficam bloqueadas.' }
    case 'plano_excluido':
      return { titulo: 'Plano excluído', grupo: 'planos', tom: 'perigo', detalhe: d.includes('—') ? 'As assinaturas antigas e as cobranças continuam no histórico.' : 'Removido da lista.' }
    default:
      if (d.startsWith('Cancelamento:')) return { titulo: 'Cobranças canceladas', grupo: 'cobrancas', tom: 'neutro', detalhe: plural(d.replace(/^Cancelamento:\s*/, '')) }
      if (/benefício voltou ao saldo|voltou ao preço normal/i.test(d)) return { titulo: 'Uso devolvido ao saldo', grupo: 'usos', tom: 'neutro', detalhe: curta(d) }
      return { titulo: 'Atualização', grupo: 'assinaturas', tom: 'neutro', detalhe: curta(d) }
  }
}

// "Hoje", "Ontem" ou "qui., 12 de out." — título de cada dia do histórico.
export function rotuloDia(iso: string, hojeISO: string): string {
  const dia = new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  if (dia === hojeISO) return 'Hoje'
  const [a, m, dd] = hojeISO.split('-').map(Number)
  const ontem = new Date(Date.UTC(a, m - 1, dd - 1)).toISOString().slice(0, 10)
  if (dia === ontem) return 'Ontem'
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export function horaBR(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

// Quanto o plano rende por mês (fn_plano_fator_mensal no banco).
export function fatorMensal(periodicidade: string, intervaloDias: number | null): number {
  switch (periodicidade) {
    case 'mensal': return 1
    case 'quinzenal': return 2
    case 'trimestral': return 1 / 3
    case 'semestral': return 1 / 6
    case 'anual': return 1 / 12
    default: return 30 / Math.max(intervaloDias || 30, 1)
  }
}

export interface Assinatura {
  id_assinatura: string
  id_plano: string
  plano: string
  id_cliente: string | null
  cliente: string | null
  id_pet: string | null
  pet: string | null
  valor: number
  periodicidade: Periodicidade
  intervalo_dias: number | null
  data_inicio: string
  forma_pagamento: string | null
  status: 'ativa' | 'cancelada'
  cancelada_em: string | null
  motivo_cancelamento: string | null
  periodo_atual: { numero: number; inicio: string; fim: string; beneficios: BeneficioPeriodo[] } | null
  proxima_cobranca: string | null
  cobrancas_em_aberto: number
  cobrancas_vencidas: number
  // Só com detalhes (tela do cliente).
  cobrancas?: CobrancaPlano[] | null
  utilizacoes?: UtilizacaoPlano[] | null
  historico?: HistoricoPlano[] | null
}

// fn_meus_planos (migration 068) — o que o cliente vê das assinaturas dele.
export interface AssinaturaDoCliente {
  id_assinatura: string
  plano: string
  descricao: string | null
  id_lojista: string
  loja: string
  loja_telefone: string | null
  id_pet: string | null
  pet: string | null
  valor: number
  periodicidade: Periodicidade
  intervalo_dias: number | null
  data_inicio: string
  forma_pagamento: string | null
  status: 'ativa' | 'cancelada'
  cancelada_em: string | null
  periodo_atual: { numero: number; inicio: string; fim: string; beneficios: BeneficioPeriodo[] } | null
  proxima_cobranca: string | null
  cobrancas: CobrancaPlano[]
  utilizacoes: Omit<UtilizacaoPlano, 'funcionario'>[]
  formas_loja: unknown
}

export interface CobrancaDaLoja extends CobrancaPlano {
  id_assinatura: string
  plano: string
  id_cliente: string | null
  cliente: string | null
  pet: string | null
  assinatura_status: 'ativa' | 'cancelada'
}

// fn_beneficios_do_pet
export interface PlanoDoPet {
  id_assinatura: string
  plano: string
  id_periodo: string | null
  periodo_inicio: string | null
  periodo_fim: string | null
  proxima_cobranca: string | null
  beneficios: { id_servico: string; servico: string; quantidade: number; usados: number }[]
}

// O que o plano cobre num pedido (um ou mais serviços na mesma data).
export interface CoberturaServico { id_servico: string; plano: string; quantidade: number; usados: number }
export interface CoberturaPlano {
  // Serviços com saldo no período da data — o plano paga.
  cobertos: CoberturaServico[]
  // Estão no plano, mas os usos do período acabaram.
  esgotados: CoberturaServico[]
  // Planos ativos sem período aberto para a data (ela cai depois do atual).
  semPeriodo: PlanoDoPet[]
}

export function coberturaDoPlano(planos: PlanoDoPet[] | null | undefined, idsServicos: string[]): CoberturaPlano {
  const cobertos: CoberturaServico[] = []
  const esgotados: CoberturaServico[] = []
  const lista = planos ?? []
  for (const id of idsServicos) {
    // Mesmo critério do banco (fn_usar_beneficio): o plano com mais saldo.
    const melhor = lista
      .filter(p => p.id_periodo)
      .flatMap(p => p.beneficios.filter(b => b.id_servico === id).map(b => ({
        id_servico: id, plano: p.plano, quantidade: Number(b.quantidade), usados: Number(b.usados),
      })))
      .sort((x, y) => (y.quantidade - y.usados) - (x.quantidade - x.usados))[0]
    if (!melhor) continue
    if (melhor.quantidade > melhor.usados) cobertos.push(melhor)
    else esgotados.push(melhor)
  }
  return { cobertos, esgotados, semPeriodo: lista.filter(p => !p.id_periodo) }
}

// fn_beneficio_do_agendamento
export interface BeneficioDoAgendamento {
  usado: { id_utilizacao: string; plano: string; valor_abatido: number; em: string } | null
  disponivel: { id_assinatura: string; plano: string; quantidade: number; usados: number } | null
}

// Resumo do Dashboard (fn_resumo_planos)
export interface ResumoPlanos {
  tem_planos: boolean
  ativas: number
  receita_mensal: number
  pendentes_qtd: number
  pendentes_valor: number
  vencidas_qtd: number
  vencidas_valor: number
  utilizacoes_mes: number
  proximas: { data: string; cliente: string | null; id_cliente: string | null; pet: string | null; plano: string; valor: number }[]
}

// Relatório de Vendas (fn_relatorio_planos)
export interface RelatorioPlanos {
  tem_planos: boolean
  ativas: number
  receita_mensal: number
  receita_periodo: number
  pagas_qtd: number
  pagas_valor: number
  pendentes_qtd: number
  pendentes_valor: number
  vencidas_qtd: number
  vencidas_valor: number
  planos: { plano: string; ativas: number; novas: number; receita: number }[]
  servicos: { servico: string; usos: number }[]
}

// Mensagem do banco sem o prefixo técnico.
// ── Atribuir plano pela tela de Planos ──

// Cliente achado na busca e os pets dele, com os planos que cada um já tem.
export interface ClienteParaPlano { id_cliente: string; nome: string; telefone: string | null }
export interface PetParaPlano {
  id_pet: string
  nome: string
  raca: string | null
  especie: string | null
  foto_url: string | null
  // id dos planos que o pet já tem ativos (o mesmo plano não pode repetir).
  planos_ativos: string[]
}

// Início do período n (0 = o primeiro): a mesma conta de
// fn_plano_inicio_periodo no banco. Mês somado como no Postgres — 31/01
// + 1 mês = 28/02 (ou 29/02).
export function inicioPeriodoPlano(inicioISO: string, periodicidade: string, intervaloDias: number | null, n: number): string {
  const [a, m, d] = inicioISO.slice(0, 10).split('-').map(Number)
  const somarMeses = (meses: number) => {
    const total = (m - 1) + meses
    const ano = a + Math.floor(total / 12)
    const mes = ((total % 12) + 12) % 12
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
    return new Date(Date.UTC(ano, mes, Math.min(d, ultimo)))
  }
  const somarDias = (dias: number) => new Date(Date.UTC(a, m - 1, d + dias))
  const data = periodicidade === 'mensal' ? somarMeses(n)
    : periodicidade === 'trimestral' ? somarMeses(3 * n)
    : periodicidade === 'semestral' ? somarMeses(6 * n)
    : periodicidade === 'anual' ? somarMeses(12 * n)
    : periodicidade === 'quinzenal' ? somarDias(15 * n)
    : somarDias((intervaloDias || 30) * n)
  return data.toISOString().slice(0, 10)
}

function diaAnterior(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10)
}

// O que acontece ao confirmar uma assinatura, pelas regras de
// fn_gerar_periodos_assinatura: o 1º período começa no início; uma cobrança
// pendente nasce no início de cada período; com início no passado, os
// períodos até hoje (e as cobranças deles) já são criados na hora.
export function previaAssinatura(inicioISO: string, periodicidade: string, intervaloDias: number | null, hojeISO: string) {
  const periodo = (n: number) => ({
    inicio: inicioPeriodoPlano(inicioISO, periodicidade, intervaloDias, n),
    fim: diaAnterior(inicioPeriodoPlano(inicioISO, periodicidade, intervaloDias, n + 1)),
  })
  let n = 0
  while (periodo(n).fim < hojeISO && n < 240) n++
  return {
    primeiro: periodo(0),
    atual: periodo(n),
    // Cobranças criadas na hora (todas pendentes).
    cobrancasCriadas: n + 1,
    proximaCobranca: periodo(n + 1).inicio,
  }
}

export function mensagemErroPlano(msg: string | undefined, padrao: string): string {
  if (!msg) return padrao
  // Duas confirmações ao mesmo tempo: o índice único (migration 103) segura a segunda.
  if (/uq_assinatura_ativa_pet_plano|duplicate key/i.test(msg)) return 'Este pet já tem este plano ativo.'
  if (/fn_\w+|does not exist|schema cache/i.test(msg)) return 'Para usar planos, execute a migration 060_planos_assinaturas.sql.'
  return msg
}
