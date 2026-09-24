// ============================================================
// TaxiDog — rotas (migration 052)
// ============================================================
// Espelho dos tipos e textos de petshop-app/src/lib/taxidog-rotas.ts.
// Aqui fica só o que o TaxiDog usa pra executar a rota: a organização
// (montar/reordenar) é feita pela loja no painel web.
//
// Rota = lista ordenada de PARADAS (cliente ou loja); cada parada tem os
// pets que se embarca/entrega/deixa/pega ali.

import type { ModalidadeTaxiDog } from '@/lib/taxidog'

export type AcaoParada = 'embarcar' | 'deixar_loja' | 'pegar_loja' | 'entregar'
export type LocalParada = 'cliente' | 'loja'
export type StatusParada = 'pendente' | 'chegou' | 'concluida'
export type StatusRota = 'planejamento' | 'aguardando_saida' | 'em_andamento' | 'concluida' | 'cancelada'

export const ROTULO_STATUS_ROTA: Record<StatusRota, string> = {
  planejamento: 'Planejamento',
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
