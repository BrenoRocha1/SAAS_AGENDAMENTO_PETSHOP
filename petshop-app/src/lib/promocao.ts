// Promoções de serviços e produtos (migration 096): desconto em % com início
// e fim opcionais. O banco aplica o desconto na cobrança; aqui é só para
// mostrar na tela. Não é um arquivo 'use server'.

export interface Promocao {
  promo_percentual: number | null
  promo_inicio: string | null
  promo_fim: string | null
}

// Desconto que vale hoje (0 = sem promoção). `hojeISO` = data de Brasília.
export function promoVigente(p: Partial<Promocao> | null | undefined, hojeISO: string): number {
  const pct = Number(p?.promo_percentual ?? 0)
  if (!pct) return 0
  if (p?.promo_inicio && hojeISO < p.promo_inicio) return 0
  if (p?.promo_fim && hojeISO > p.promo_fim) return 0
  return pct
}

export function precoComDesconto(preco: number, percentual: number): number {
  if (!percentual) return preco
  return Math.round(preco * (100 - percentual)) / 100
}

// "Até 15/11" / "A partir de 01/11" / "Sem data para acabar".
export function periodoPromo(p: Partial<Promocao>): string {
  const br = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')
  if (p.promo_inicio && p.promo_fim) return `De ${br(p.promo_inicio)} a ${br(p.promo_fim)}`
  if (p.promo_fim) return `Até ${br(p.promo_fim)}`
  if (p.promo_inicio) return `A partir de ${br(p.promo_inicio)}`
  return 'Sem data para acabar'
}

// ------------------------------------------------------------------
// Promoção do SERVIÇO, completa (migration 096): preço promocional em R$,
// hora de início e de encerramento, liga/desliga e "oferecer no
// agendamento online". As contas daqui são as mesmas do banco
// (fn_calcular_preco_servico) — servem para mostrar e para validar antes
// de gravar; quem cobra é sempre o banco.
// ------------------------------------------------------------------

export interface PromocaoServico extends Partial<Promocao> {
  // Preço promocional do preço base. Promoção antiga (só %) vem sem ele.
  promo_preco?: number | string | null
  promo_hora_inicio?: string | null
  promo_hora_fim?: string | null
  promo_ativa?: boolean | null
  promo_exibir_online?: boolean | null
}

export const COLUNAS_PROMOCAO_SERVICO =
  'promo_percentual, promo_inicio, promo_fim, promo_preco, promo_hora_inicio, promo_hora_fim, promo_ativa, promo_exibir_online'

// Data ('AAAA-MM-DD') e hora ('HH:MM') de agora em Brasília.
export interface AgoraBrasil { data: string; hora: string }

export type StatusPromocao = 'sem' | 'ativa' | 'programada' | 'encerrada' | 'pausada'

export const ROTULO_STATUS_PROMOCAO: Record<StatusPromocao, string> = {
  sem: 'Sem promoção',
  ativa: 'Promoção ativa',
  programada: 'Promoção programada',
  encerrada: 'Promoção encerrada',
  pausada: 'Promoção desativada',
}

const hhmm = (h: string | null | undefined) => (h ? h.slice(0, 5) : null)

export function temPromocao(p: PromocaoServico | null | undefined): boolean {
  return !!p && (p.promo_percentual != null || p.promo_preco != null)
}

export function statusPromocaoServico(p: PromocaoServico | null | undefined, agora: AgoraBrasil): StatusPromocao {
  if (!p || !temPromocao(p)) return 'sem'
  if (p.promo_ativa === false) return 'pausada'
  const instante = `${agora.data}T${agora.hora}`
  if (p.promo_inicio && instante < `${p.promo_inicio}T${hhmm(p.promo_hora_inicio) ?? '00:00'}`) return 'programada'
  if (p.promo_fim) {
    const hora = hhmm(p.promo_hora_fim)
    if (hora ? instante >= `${p.promo_fim}T${hora}` : agora.data > p.promo_fim) return 'encerrada'
  }
  return 'ativa'
}

// Vale agora? `online`: para quem agenda como cliente — promoção que a loja
// não oferece no agendamento online não vale (nem aparece) para ele.
export function promoServicoVigente(p: PromocaoServico | null | undefined, agora: AgoraBrasil, opcoes?: { online?: boolean }): boolean {
  if (statusPromocaoServico(p, agora) !== 'ativa') return false
  return !(opcoes?.online && p?.promo_exibir_online === false)
}

// Preço com a promoção para um preço cheio qualquer (o base ou o de um
// porte/raça). Com preço promocional, o base vira exatamente ele e os
// outros levam o mesmo desconto proporcional; sem ele, vale o percentual.
export function precoPromocionalServico(precoCheio: number, precoBase: number, p: PromocaoServico | null | undefined): number {
  if (!p) return precoCheio
  const promo = p.promo_preco == null ? null : Number(p.promo_preco)
  if (promo != null && precoBase > 0) {
    if (precoCheio === precoBase) return promo
    return Math.round((precoCheio * promo * 100) / precoBase) / 100
  }
  return precoComDesconto(precoCheio, Number(p.promo_percentual ?? 0))
}

// Desconto em % com uma casa ("20,1"), sem ",0" sobrando.
export function percentualDesconto(precoCheio: number, precoFinal: number): string {
  if (!(precoCheio > 0) || precoFinal >= precoCheio) return '0'
  const pct = Math.round(((precoCheio - precoFinal) * 1000) / precoCheio) / 10
  return (Number.isInteger(pct) ? String(pct) : pct.toFixed(1)).replace('.', ',')
}

// Selo do cartão ("-20%"): o percentual inteiro, nunca "-0%".
export function seloDesconto(precoCheio: number, precoFinal: number): number {
  if (!(precoCheio > 0) || precoFinal >= precoCheio) return 0
  return Math.min(99, Math.max(1, Math.round(((precoCheio - precoFinal) * 100) / precoCheio)))
}

export function economia(precoCheio: number, precoFinal: number): number {
  return Math.max(0, Math.round((precoCheio - precoFinal) * 100) / 100)
}

// "De 12/10 às 08:00 até 20/10 às 18:00" / "Até 20/10" / "Sem data para acabar".
export function periodoPromoServico(p: PromocaoServico): string {
  const br = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')
  const ponta = (data: string, hora: string | null | undefined) => (hhmm(hora) ? `${br(data)} às ${hhmm(hora)}` : br(data))
  if (p.promo_inicio && p.promo_fim) return `De ${ponta(p.promo_inicio, p.promo_hora_inicio)} até ${ponta(p.promo_fim, p.promo_hora_fim)}`
  if (p.promo_fim) return `Até ${ponta(p.promo_fim, p.promo_hora_fim)}`
  if (p.promo_inicio) return `A partir de ${ponta(p.promo_inicio, p.promo_hora_inicio)}`
  return 'Sem data para acabar'
}

// O que a tela manda para gravar. `null` = tirar a promoção do serviço.
export interface DadosPromocaoServico {
  ativa: boolean
  preco: number
  inicio: string | null
  horaInicio: string | null
  fim: string | null
  horaFim: string | null
  exibirOnline: boolean
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// Confere a promoção contra o preço do serviço. Devolve a mensagem do
// primeiro problema, ou null. O banco confere de novo (trigger da 096).
export function validarPromocaoServico(d: DadosPromocaoServico, precoServico: number): string | null {
  if (typeof d.preco !== 'number' || !Number.isFinite(d.preco)) return 'Informe o preço promocional.'
  if (d.preco <= 0) return 'O preço promocional precisa ser maior que zero.'
  if (Math.abs(d.preco * 100 - Math.round(d.preco * 100)) > 1e-6) return 'Use no máximo duas casas no preço promocional.'
  if (!(precoServico > 0)) return 'Informe o preço do serviço antes de criar a promoção.'
  if (d.preco >= precoServico) return 'O preço promocional precisa ser menor que o preço do serviço.'
  if ((d.inicio && !DATA_RE.test(d.inicio)) || (d.fim && !DATA_RE.test(d.fim))) return 'Data inválida.'
  if ((d.horaInicio && !HORA_RE.test(d.horaInicio)) || (d.horaFim && !HORA_RE.test(d.horaFim))) return 'Hora inválida.'
  if (d.horaInicio && !d.inicio) return 'Informe a data de início para usar a hora de início.'
  if (d.horaFim && !d.fim) return 'Informe a data de encerramento para usar a hora de encerramento.'
  if (d.inicio && d.fim) {
    const ini = `${d.inicio}T${d.horaInicio ?? '00:00'}`
    const fim = `${d.fim}T${d.horaFim ?? '23:59'}`
    if (fim <= ini) return 'O encerramento precisa ser depois do início.'
  }
  return null
}

// As colunas do serviço para gravar a promoção (ou tirar, com null).
export function colunasPromocaoServico(d: DadosPromocaoServico | null) {
  if (!d) {
    return {
      promo_preco: null, promo_percentual: null, promo_inicio: null, promo_fim: null,
      promo_hora_inicio: null, promo_hora_fim: null, promo_ativa: true, promo_exibir_online: true,
    }
  }
  return {
    promo_preco: Math.round(d.preco * 100) / 100,
    promo_inicio: d.inicio,
    promo_hora_inicio: d.inicio ? d.horaInicio : null,
    promo_fim: d.fim,
    promo_hora_fim: d.fim ? d.horaFim : null,
    promo_ativa: d.ativa,
    promo_exibir_online: d.exibirOnline,
  }
}

// Lê o que veio da tela (JSON do formulário ou argumento da action) sem
// confiar no formato. `undefined` = veio algo que não é uma promoção.
export function lerDadosPromocaoServico(bruto: unknown): DadosPromocaoServico | null | undefined {
  if (bruto === null) return null
  if (typeof bruto !== 'object' || Array.isArray(bruto)) return undefined
  const o = bruto as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  const preco = typeof o.preco === 'number' ? o.preco : typeof o.preco === 'string' ? Number(o.preco.replace(',', '.')) : NaN
  return {
    ativa: o.ativa !== false,
    preco,
    inicio: texto(o.inicio),
    horaInicio: texto(o.horaInicio)?.slice(0, 5) ?? null,
    fim: texto(o.fim),
    horaFim: texto(o.horaFim)?.slice(0, 5) ?? null,
    exibirOnline: o.exibirOnline !== false,
  }
}

export function faltaMigrationPromocaoCompleta(mensagem: string | null | undefined): boolean {
  return /promo_preco|promo_hora|promo_ativa|promo_exibir_online|fn_preco_servico_cheio/i.test(mensagem ?? '')
}
