// ============================================================
// TaxiDog — rotas (migration 052)
// ============================================================
// Uma SOLICITAÇÃO (taxidog_corrida) tem até dois trechos:
//   busca   = embarcar no cliente → deixar na loja
//   entrega = pegar na loja → entregar no cliente
// Uma ROTA é uma lista ordenada de PARADAS (cliente ou loja); cada parada
// tem os pets que se embarca/entrega/deixa/pega ali.
//
// O lojista só mexe nas paradas no cliente (e pode arrastar as da loja);
// as idas à loja se encaixam sozinhas (normalizarPlano): cada pet buscado
// é deixado na PRIMEIRA parada na loja depois dele, e cada pet a entregar
// é pego na ÚLTIMA parada na loja antes da entrega. O banco
// (fn_salvar_paradas) confere essas regras de novo.
// O app mobile (petshop-mobile/src/lib/taxidog-rotas.ts) espelha os tipos
// e rótulos deste arquivo.

import type { ModalidadeTaxiDog } from '@/lib/taxidog'

export type AcaoParada = 'embarcar' | 'deixar_loja' | 'pegar_loja' | 'entregar'
export type LocalParada = 'cliente' | 'loja'
export type StatusParada = 'pendente' | 'chegou' | 'concluida'
export type StatusRota = 'planejamento' | 'aguardando_aprovacao' | 'aguardando_saida' | 'em_andamento' | 'concluida' | 'cancelada'
export type Trecho = 'busca' | 'entrega'

export const ROTULO_STATUS_ROTA: Record<StatusRota, string> = {
  planejamento: 'Planejamento',
  aguardando_aprovacao: 'Aguardando aprovação',
  aguardando_saida: 'Aguardando saída',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

export const CLASSE_STATUS_ROTA: Record<StatusRota, string> = {
  planejamento: 'badge-inativo',
  aguardando_aprovacao: 'badge-pendente',
  aguardando_saida: 'badge-aceito',
  em_andamento: 'badge-em-andamento',
  concluida: 'badge-concluido',
  cancelada: 'badge-cancelado',
}

export interface ItemParada {
  id_item: string
  id_corrida: string
  acao: AcaoParada
  feito: boolean
  pet_nome: string
  pet_raca: string | null
  pet_foto_url: string | null
  pet_obs: string | null
  pet_comportamento: string[] | null
  pet_obs_comportamento: string | null
  cliente_nome: string
  cliente_telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  uf: string
  lat: number | null
  lng: number | null
  modalidade: ModalidadeTaxiDog
  status_corrida: string
  valor: number
  hr_agendamento: string
  status_agendamento: string
  obs_agendamento: string | null
}

export interface Parada {
  id_parada: string
  ordem: number
  local: LocalParada
  status: StatusParada
  chegou_em: string | null
  concluida_em: string | null
  itens: ItemParada[]
}

export interface Rota {
  id_rota: string
  numero: number
  data: string
  status: StatusRota
  id_funcionario: string | null
  funcionario_nome: string | null
  distancia_m: number | null
  duracao_s: number | null
  calculo_versao: number | null
  versao: number
  ultima_alteracao: string | null
  iniciada_em: string | null
  concluida_em: string | null
  created_at: string
  paradas: Parada[]
}

// Linha de fn_trechos_pendentes — um trecho ainda fora de rota.
export interface TrechoPendente {
  id_corrida: string
  trecho: Trecho
  modalidade: ModalidadeTaxiDog
  status_corrida: string
  valor: number
  cep: string
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  uf: string
  lat: number | null
  lng: number | null
  dt_agendamento: string
  hr_agendamento: string
  hr_fim_visita: string | null
  status_agendamento: string
  obs_agendamento: string | null
  servicos: string | null
  pet_nome: string
  pet_foto_url: string | null
  cliente_nome: string
  cliente_telefone: string
  // TaxiDog da corrida pelo Kanban (migration 053) — null = sem ninguém.
  id_funcionario: string | null
  funcionario_nome: string | null
}

export function normalizarRota(row: Record<string, unknown>): Rota {
  const r = row as unknown as Rota
  const paradas = (Array.isArray(r.paradas) ? r.paradas : []).map(p => ({
    ...p,
    itens: (Array.isArray(p.itens) ? p.itens : []).map(i => ({ ...i, valor: Number(i.valor ?? 0) })),
  }))
  return {
    ...r,
    distancia_m: r.distancia_m == null ? null : Number(r.distancia_m),
    duracao_s: r.duracao_s == null ? null : Number(r.duracao_s),
    paradas,
  }
}

export function normalizarTrecho(row: Record<string, unknown>): TrechoPendente {
  const t = row as unknown as TrechoPendente
  return { ...t, valor: Number(t.valor ?? 0) }
}

// ── Textos ─────────────────────────────────────────────────────
const nomes = (itens: { pet_nome: string }[]) => itens.map(i => i.pet_nome).join(' + ')

// "Buscar Mel" / "Entregar Rex" / "Pet Shop"
export function tituloParada(p: Pick<Parada, 'local' | 'itens'>): string {
  if (p.local === 'loja') return 'Pet Shop'
  const buscar = p.itens.filter(i => i.acao === 'embarcar')
  const entregar = p.itens.filter(i => i.acao === 'entregar')
  return [buscar.length ? `Buscar ${nomes(buscar)}` : null, entregar.length ? `Entregar ${nomes(entregar)}` : null]
    .filter(Boolean)
    .join(' · ')
}

// Linhas da parada na loja: "Deixar Mel + Luna" / "Pegar Rex"
export function linhasLoja(p: Pick<Parada, 'itens'>): string[] {
  const deixar = p.itens.filter(i => i.acao === 'deixar_loja')
  const pegar = p.itens.filter(i => i.acao === 'pegar_loja')
  return [deixar.length ? `Deixar ${nomes(deixar)}` : null, pegar.length ? `Pegar ${nomes(pegar)} para entrega` : null]
    .filter((x): x is string => !!x)
}

export function enderecoParada(p: Pick<Parada, 'local' | 'itens'>, enderecoLoja: string): string {
  if (p.local === 'loja') return enderecoLoja
  const i = p.itens[0]
  if (!i) return ''
  return [`${i.logradouro}, ${i.numero}`, i.complemento, i.bairro, `${i.cidade} - ${i.uf}`].filter(Boolean).join(' · ')
}

export function horarioParada(p: Pick<Parada, 'local' | 'itens'>): string | null {
  if (p.local === 'loja') return null
  const buscar = p.itens.find(i => i.acao === 'embarcar')
  if (buscar) return buscar.hr_agendamento.slice(0, 5)
  return null
}

export function formatarDistancia(m: number | null): string | null {
  if (m == null) return null
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

export function formatarDuracao(s: number | null): string | null {
  if (s == null) return null
  const min = Math.max(1, Math.round(s / 60))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h} h ${resto} min` : `${h} h`
}

export function contarPets(r: Pick<Rota, 'paradas'>): number {
  return new Set(r.paradas.flatMap(p => p.itens.map(i => i.id_corrida))).size
}

export function proximaParada(r: Pick<Rota, 'paradas'>): Parada | null {
  return r.paradas.find(p => p.status !== 'concluida') ?? null
}

// Status simples da solicitação pro lojista (item 17 do pedido).
export type StatusSolicitacao = 'Pendente' | 'Na rota' | 'Em andamento' | 'Concluída' | 'Cancelada'

export function statusSolicitacao(statusCorrida: string, naRota: boolean): StatusSolicitacao {
  if (statusCorrida === 'cancelada') return 'Cancelada'
  if (statusCorrida === 'concluida') return 'Concluída'
  if (['a_caminho_cliente', 'no_endereco', 'pet_embarcado', 'a_caminho_entrega', 'no_endereco_entrega'].includes(statusCorrida)) return 'Em andamento'
  return naRota ? 'Na rota' : 'Pendente'
}

// ============================================================
// Montagem e normalização do plano (a parte ainda não iniciada)
// ============================================================
export interface ItemPlano {
  id_corrida: string
  acao: AcaoParada
  feito?: boolean
}

export interface ParadaPlano {
  // id da parada já gravada (reordenação) — paradas novas não têm.
  id?: string
  local: LocalParada
  itens: ItemPlano[]
}

const noDaLoja = (acao: AcaoParada) => acao === 'deixar_loja' || acao === 'pegar_loja'

// Encaixa as idas à loja no plano pendente. `fixas` são as paradas já
// feitas / a atual — não mudam, mas contam pra saber o que cada pet já fez.
export function normalizarPlano(fixas: ParadaPlano[], pendentes: ParadaPlano[]): ParadaPlano[] {
  // 1) Tira deixar/pegar das paradas na loja pendentes (serão refeitos) e
  //    joga fora paradas no cliente vazias. Paradas na loja ficam como
  //    "âncora" — é assim que o lojista escolhe quando passar na loja.
  const plano: ParadaPlano[] = pendentes
    .map(p => ({ ...p, itens: p.local === 'loja' ? [] : p.itens.map(i => ({ ...i })) }))
    .filter(p => p.local === 'loja' || p.itens.length > 0)

  const nasFixas = (id: string, acao: AcaoParada) => fixas.some(p => p.itens.some(i => i.id_corrida === id && i.acao === acao))
  const indiceDe = (id: string, acao: AcaoParada) => plano.findIndex(p => p.itens.some(i => i.id_corrida === id && i.acao === acao))

  // 2) Cada pet embarcado (antes ou no plano) é deixado na primeira
  //    parada na loja depois dele.
  const embarcados = new Set<string>()
  for (const p of [...fixas, ...plano]) for (const i of p.itens) if (i.acao === 'embarcar') embarcados.add(i.id_corrida)
  for (const id of embarcados) {
    if (nasFixas(id, 'deixar_loja')) continue
    const e = indiceDe(id, 'embarcar') // -1 = embarcou numa parada fixa
    let destino = plano.findIndex((p, idx) => idx > e && p.local === 'loja')
    if (destino < 0) {
      plano.push({ local: 'loja', itens: [] })
      destino = plano.length - 1
    }
    plano[destino].itens.push({ id_corrida: id, acao: 'deixar_loja' })
  }

  // 3) Cada entrega pega o pet na última parada na loja antes dela — e,
  //    se o pet foi deixado nesta mesma rota, depois da parada em que foi
  //    deixado (o serviço acontece entre as duas). Sem parada assim, entra
  //    uma ida à loja logo antes da entrega.
  const entregas = plano.flatMap(p => p.itens.filter(i => i.acao === 'entregar').map(i => i.id_corrida))
  for (const id of entregas) {
    if (nasFixas(id, 'pegar_loja')) continue
    const d = indiceDe(id, 'entregar')
    const deixado = indiceDe(id, 'deixar_loja') // -1 = já estava na loja
    let origem = -1
    for (let idx = d - 1; idx > deixado; idx--) {
      if (plano[idx].local === 'loja') { origem = idx; break }
    }
    if (origem < 0) {
      if (deixado < 0) {
        plano.unshift({ local: 'loja', itens: [] })
        origem = 0
      } else {
        plano.splice(d, 0, { local: 'loja', itens: [] })
        origem = d
      }
    }
    plano[origem].itens.push({ id_corrida: id, acao: 'pegar_loja' })
  }

  // 4) Paradas na loja vazias somem; duas seguidas viram uma — menos
  //    quando juntar poria "deixar" e "pegar" do mesmo pet na mesma parada.
  const limpo: ParadaPlano[] = []
  for (const p of plano) {
    if (p.itens.length === 0) continue
    const anterior = limpo[limpo.length - 1]
    if (anterior && anterior.local === 'loja' && p.local === 'loja' && !deixaEPega(anterior, p)) {
      anterior.itens.push(...p.itens)
      continue
    }
    limpo.push(p)
  }
  return limpo
}

// A parada `a` deixa na loja um pet que a parada `b` pega de volta?
function deixaEPega(a: ParadaPlano, b: ParadaPlano): boolean {
  const deixados = new Set(a.itens.filter(i => i.acao === 'deixar_loja').map(i => i.id_corrida))
  return b.itens.some(i => i.acao === 'pegar_loja' && deixados.has(i.id_corrida))
}

const minutos = (hhmm: string | null | undefined) => {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Plano inicial de uma rota nova a partir dos trechos escolhidos: em ordem
// de horário (busca = horário do agendamento; entrega = fim do serviço),
// passando na loja quando as buscas "se afastam" mais de 40 min ou quando
// a rota passa de buscas pra entregas.
export function montarPlanoInicial(trechos: Pick<TrechoPendente, 'id_corrida' | 'trecho' | 'hr_agendamento' | 'hr_fim_visita'>[]): ParadaPlano[] {
  const ordenados = [...trechos].sort((a, b) => referencia(a) - referencia(b))
  const plano: ParadaPlano[] = []
  let inicioLote: number | null = null
  let ultimo: 'busca' | 'entrega' | null = null

  for (const t of ordenados) {
    const ref = referencia(t)
    if (t.trecho === 'busca') {
      if (ultimo === 'entrega' || (inicioLote != null && ref - inicioLote > 40)) {
        plano.push({ local: 'loja', itens: [] })
        inicioLote = null
      }
      if (inicioLote == null) inicioLote = ref
      plano.push({ local: 'cliente', itens: [{ id_corrida: t.id_corrida, acao: 'embarcar' }] })
    } else {
      if (ultimo === 'busca') plano.push({ local: 'loja', itens: [] })
      inicioLote = null
      plano.push({ local: 'cliente', itens: [{ id_corrida: t.id_corrida, acao: 'entregar' }] })
    }
    ultimo = t.trecho
  }
  return normalizarPlano([], plano)
}

function referencia(t: Pick<TrechoPendente, 'trecho' | 'hr_agendamento' | 'hr_fim_visita'>): number {
  return t.trecho === 'busca' ? minutos(t.hr_agendamento) : minutos(t.hr_fim_visita ?? t.hr_agendamento) || minutos(t.hr_agendamento) + 60
}

// Rota gravada → (fixas, pendentes) no formato do plano.
export function planoDaRota(r: Pick<Rota, 'paradas'>): { fixas: ParadaPlano[]; pendentes: ParadaPlano[] } {
  const paraPlano = (p: Parada): ParadaPlano => ({
    id: p.id_parada,
    local: p.local,
    itens: p.itens.map(i => ({ id_corrida: i.id_corrida, acao: i.acao, feito: i.feito })),
  })
  return {
    fixas: r.paradas.filter(p => p.status !== 'pendente').map(paraPlano),
    pendentes: r.paradas.filter(p => p.status === 'pendente').map(paraPlano),
  }
}

// O que vai pra fn_salvar_paradas.
export function planoParaBanco(plano: ParadaPlano[]) {
  return plano.map(p => ({
    local: p.local,
    itens: p.itens.filter(i => !noDaLoja(i.acao) || p.local === 'loja').map(i => ({ id_corrida: i.id_corrida, acao: i.acao })),
  }))
}

// Mudança que o próprio TaxiDog fez na rota (ex.: pet não embarcou e saiu
// dela): o "Rota atualizada" que chega logo depois pelo Realtime não é
// novidade pra ele. BroadcastChannel cobre outra aba do mesmo navegador.
export const EVENTO_ROTA_PROPRIA = 'saip:rota-propria'

export function avisarMudancaPropria(idRota: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_ROTA_PROPRIA, { detail: idRota }))
  try {
    const canal = new BroadcastChannel(EVENTO_ROTA_PROPRIA)
    canal.postMessage(idRota)
    canal.close()
  } catch {
    // Sem BroadcastChannel — só esta aba fica sabendo.
  }
}

// Situação do transporte de uma visita, nos status simples da loja
// (Pendente / Na rota / Em andamento / Concluída / Cancelada).
export function rotuloTransporte(t: { status: string; naRota: boolean; temTaxiDog?: boolean }): string {
  switch (t.status) {
    case 'cancelada': return 'Cancelada'
    case 'concluida': return 'Concluída'
    case 'entregue_loja': return 'Em andamento · pet na loja'
    case 'pronto_entrega':
      return t.naRota ? 'Na rota · pronto para entrega' : t.temTaxiDog ? 'Com TaxiDog · pronto para entrega' : 'Pendente · pronto para entrega'
    case 'agendada': return t.naRota ? 'Na rota' : t.temTaxiDog ? 'Com TaxiDog' : 'Pendente'
    default: return 'Em andamento'
  }
}

// O próprio TaxiDog pegou a corrida pelo Kanban ("Atribuir para mim"): o
// "Nova corrida para você" que chega logo depois não é pra ele.
export const EVENTO_CORRIDA_ASSUMIDA = 'saip:corrida-assumida'

export function avisarCorridaAssumida(idCorrida: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_CORRIDA_ASSUMIDA, { detail: idCorrida }))
  try {
    const canal = new BroadcastChannel(EVENTO_CORRIDA_ASSUMIDA)
    canal.postMessage(idCorrida)
    canal.close()
  } catch {
    // Sem BroadcastChannel — só esta aba fica sabendo.
  }
}
