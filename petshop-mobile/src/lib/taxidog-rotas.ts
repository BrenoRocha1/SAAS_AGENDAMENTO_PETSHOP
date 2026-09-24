// ============================================================
// TaxiDog — rotas (migration 052)
// ============================================================
// Espelho dos tipos, textos e da montagem de rota de
// petshop-app/src/lib/taxidog-rotas.ts. No app o TaxiDog monta rotas pra
// si (migration 053) e executa; reordenar paradas fica no painel web.
//
// Rota = lista ordenada de PARADAS (cliente ou loja); cada parada tem os
// pets que se embarca/entrega/deixa/pega ali.

import type { ModalidadeTaxiDog } from '@/lib/taxidog'

export type AcaoParada = 'embarcar' | 'deixar_loja' | 'pegar_loja' | 'entregar'
export type LocalParada = 'cliente' | 'loja'
export type StatusParada = 'pendente' | 'chegou' | 'concluida'
export type StatusRota = 'planejamento' | 'aguardando_aprovacao' | 'aguardando_saida' | 'em_andamento' | 'concluida' | 'cancelada'

export const ROTULO_STATUS_ROTA: Record<StatusRota, string> = {
  planejamento: 'Planejamento',
  aguardando_aprovacao: 'Aguardando aprovação',
  aguardando_saida: 'Aguardando saída',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
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

// Linhas da parada na loja: "Deixar Mel + Luna" / "Pegar Rex para entrega"
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
  return buscar ? buscar.hr_agendamento.slice(0, 5) : null
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

// "12,4 km · ~38 min" — só quando o cálculo vale pra versão atual.
export function trajetoDaRota(r: Pick<Rota, 'distancia_m' | 'duracao_s' | 'calculo_versao' | 'versao'>): string | null {
  const d = formatarDistancia(r.distancia_m)
  if (!d || r.calculo_versao !== r.versao) return null
  return `${d} · ~${formatarDuracao(r.duracao_s)}`
}

export function contarPets(r: Pick<Rota, 'paradas'>): number {
  return new Set(r.paradas.flatMap(p => p.itens.map(i => i.id_corrida))).size
}

export function proximaParada(r: Pick<Rota, 'paradas'>): Parada | null {
  return r.paradas.find(p => p.status !== 'concluida') ?? null
}

// Destino do "Abrir no Google Maps".
export function linkMaps(p: Parada, enderecoLoja: string): string {
  let destino: string
  if (p.local === 'loja') {
    destino = enderecoLoja.replace(/ · /g, ', ')
  } else {
    const i = p.itens[0]
    destino = i ? `${i.logradouro}, ${i.numero} - ${i.bairro}, ${i.cidade} - ${i.uf}, ${i.cep}` : ''
  }
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destino)}`
}

// Rótulo do botão de confirmar conforme o que se faz na parada.
export function rotuloConfirmar(p: Parada): string {
  const aFazer = p.itens.filter(i => !i.feito)
  const acoes = new Set(aFazer.map(i => i.acao))
  const varios = aFazer.length > 1
  if (acoes.size !== 1) return 'Confirmar'
  if (acoes.has('embarcar')) return varios ? 'Pets embarcados' : 'Pet embarcado'
  if (acoes.has('entregar')) return varios ? 'Pets entregues' : 'Pet entregue'
  if (acoes.has('deixar_loja')) return 'Entregar pets na loja'
  return varios ? 'Pegar pets' : 'Pegar pet'
}

export function rotuloAcao(acao: AcaoParada): string {
  switch (acao) {
    case 'embarcar': return 'Buscar'
    case 'deixar_loja': return 'Deixar na loja'
    case 'pegar_loja': return 'Pegar na loja'
    default: return 'Entregar'
  }
}

// Buscar no cliente / pegar na loja podem falhar (cliente não estava, pet
// não ficou pronto) — esses dá pra desmarcar e o pet sai da rota.
export const acaoOpcional = (acao: AcaoParada) => acao === 'embarcar' || acao === 'pegar_loja'

// ============================================================
// Montagem de rota (mesma lógica do painel web)
// ============================================================
export type Trecho = 'busca' | 'entrega'

// Linha de fn_trechos_pendentes — corrida que ainda pode entrar em rota.
export interface TrechoPendente {
  id_corrida: string
  trecho: Trecho
  modalidade: ModalidadeTaxiDog
  status_corrida: string
  valor: number
  logradouro: string
  numero: string
  bairro: string
  hr_agendamento: string
  hr_fim_visita: string | null
  status_agendamento: string
  pet_nome: string
  pet_foto_url: string | null
  cliente_nome: string
  id_funcionario: string | null
}

export function normalizarTrecho(row: Record<string, unknown>): TrechoPendente {
  const t = row as unknown as TrechoPendente
  return { ...t, valor: Number(t.valor ?? 0) }
}

export interface ItemPlano {
  id_corrida: string
  acao: AcaoParada
}

export interface ParadaPlano {
  local: LocalParada
  itens: ItemPlano[]
}

// Encaixa as idas à loja: cada pet buscado é deixado na primeira parada na
// loja depois dele; cada entrega pega o pet na última parada na loja antes.
function normalizarPlano(pendentes: ParadaPlano[]): ParadaPlano[] {
  const plano: ParadaPlano[] = pendentes
    .map(p => ({ ...p, itens: p.local === 'loja' ? [] : p.itens.map(i => ({ ...i })) }))
    .filter(p => p.local === 'loja' || p.itens.length > 0)
  const indiceDe = (id: string, acao: AcaoParada) => plano.findIndex(p => p.itens.some(i => i.id_corrida === id && i.acao === acao))

  const embarcados = plano.flatMap(p => p.itens.filter(i => i.acao === 'embarcar').map(i => i.id_corrida))
  for (const id of embarcados) {
    const e = indiceDe(id, 'embarcar')
    let destino = plano.findIndex((p, idx) => idx > e && p.local === 'loja')
    if (destino < 0) {
      plano.push({ local: 'loja', itens: [] })
      destino = plano.length - 1
    }
    plano[destino].itens.push({ id_corrida: id, acao: 'deixar_loja' })
  }

  const entregas = plano.flatMap(p => p.itens.filter(i => i.acao === 'entregar').map(i => i.id_corrida))
  for (const id of entregas) {
    const d = indiceDe(id, 'entregar')
    let origem = -1
    for (let idx = d - 1; idx >= 0; idx--) {
      if (plano[idx].local === 'loja') { origem = idx; break }
    }
    if (origem < 0) {
      plano.unshift({ local: 'loja', itens: [] })
      origem = 0
    }
    plano[origem].itens.push({ id_corrida: id, acao: 'pegar_loja' })
  }

  const limpo: ParadaPlano[] = []
  for (const p of plano) {
    if (p.itens.length === 0) continue
    const anterior = limpo[limpo.length - 1]
    if (anterior && anterior.local === 'loja' && p.local === 'loja') {
      anterior.itens.push(...p.itens)
      continue
    }
    limpo.push(p)
  }
  return limpo
}

const minutos = (hhmm: string | null | undefined) => {
  if (!hhmm) return 0
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function referencia(t: Pick<TrechoPendente, 'trecho' | 'hr_agendamento' | 'hr_fim_visita'>): number {
  return t.trecho === 'busca' ? minutos(t.hr_agendamento) : minutos(t.hr_fim_visita ?? t.hr_agendamento) || minutos(t.hr_agendamento) + 60
}

// Plano inicial: em ordem de horário, passando na loja quando as buscas se
// afastam mais de 40 min ou quando a rota passa de buscas pra entregas.
export function montarPlanoInicial(trechos: Pick<TrechoPendente, 'id_corrida' | 'trecho' | 'hr_agendamento' | 'hr_fim_visita'>[]): ParadaPlano[] {
  const ordenados = [...trechos].sort((a, b) => referencia(a) - referencia(b))
  const plano: ParadaPlano[] = []
  let inicioLote: number | null = null
  let ultimo: Trecho | null = null

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
  return normalizarPlano(plano)
}
