// Espelha petshop-app/src/lib/taxidog.ts — mesmos rótulos, mesma tabela de
// etapas (a que fn_avancar_corrida aceita no banco, migration 042). Nunca
// mostre `status` cru: rótulos como "Aguardando TaxiDog" e "Serviço
// finalizado" são derivados de status + modalidade + atribuição.

export type ModalidadeTaxiDog = 'buscar' | 'entregar' | 'buscar_entregar'

export type StatusCorrida =
  | 'agendada'
  | 'a_caminho_cliente'
  | 'no_endereco'
  | 'pet_embarcado'
  | 'entregue_loja'
  | 'pronto_entrega'
  | 'a_caminho_entrega'
  | 'no_endereco_entrega'
  | 'concluida'
  | 'cancelada'

export const ROTULO_MODALIDADE: Record<ModalidadeTaxiDog, string> = {
  buscar: 'Somente buscar',
  entregar: 'Somente entregar',
  buscar_entregar: 'Buscar e entregar',
}

// Rótulos do ponto de vista do TaxiDog: corrida sem TaxiDog (migration
// 046) é "Disponível para atribuição" — ou "Aguardando aceite da loja"
// enquanto o agendamento está Pendente.
export function rotuloStatusCorrida(c: { status: string; modalidade: string; temTaxiDog: boolean; statusAgendamento?: string | null }): string {
  switch (c.status) {
    case 'agendada':
      if (c.statusAgendamento === 'Pendente') return 'Aguardando aceite da loja'
      if (!c.temTaxiDog) return 'Disponível para atribuição'
      return c.modalidade === 'entregar' ? 'Aguardando serviço' : 'Corrida atribuída'
    case 'a_caminho_cliente': return 'A caminho do cliente'
    case 'no_endereco': return 'Chegou ao endereço'
    case 'pet_embarcado': return 'Pet embarcado'
    case 'entregue_loja': return c.temTaxiDog ? 'Pet entregue na loja' : 'Disponível para atribuição'
    case 'pronto_entrega': return c.temTaxiDog ? 'Pronto para entrega' : 'Disponível para atribuição'
    case 'a_caminho_entrega': return 'A caminho para entrega'
    case 'no_endereco_entrega': return 'Chegou ao endereço'
    case 'concluida': return 'Corrida concluída'
    case 'cancelada': return 'Cancelada'
    default: return c.status
  }
}

export function proximaAcaoCorrida(status: string, modalidade: string): { status: StatusCorrida; rotulo: string } | null {
  switch (status) {
    case 'agendada': return modalidade === 'entregar' ? null : { status: 'a_caminho_cliente', rotulo: 'Iniciar corrida' }
    case 'a_caminho_cliente': return { status: 'no_endereco', rotulo: 'Cheguei' }
    case 'no_endereco': return { status: 'pet_embarcado', rotulo: 'Pet embarcado' }
    case 'pet_embarcado': return { status: 'entregue_loja', rotulo: 'Entregue na loja' }
    case 'pronto_entrega': return { status: 'a_caminho_entrega', rotulo: 'Aceitar entrega' }
    case 'a_caminho_entrega': return { status: 'no_endereco_entrega', rotulo: 'Cheguei ao endereço' }
    case 'no_endereco_entrega': return { status: 'concluida', rotulo: 'Pet entregue' }
    default: return null
  }
}

const EM_MOVIMENTO = ['a_caminho_cliente', 'no_endereco', 'pet_embarcado', 'a_caminho_entrega', 'no_endereco_entrega']
export const emMovimento = (status: string) => EM_MOVIMENTO.includes(status)
export const encerrada = (status: string) => status === 'concluida' || status === 'cancelada'
// Sem TaxiDog: aparece pra todo TaxiDog da loja pegar (migration 046).
export const disponivel = (c: { id_funcionario: string | null }) => !c.id_funcionario

// Em qual "perna" da corrida o TaxiDog está — decide o verbo ("Buscar
// Thor" / "Entregar Thor") e pra onde a rota aponta.
export function trechoAtual(c: { status: string; modalidade: string }): 'busca' | 'entrega' {
  if (c.modalidade === 'entregar') return 'entrega'
  if (['pronto_entrega', 'a_caminho_entrega', 'no_endereco_entrega'].includes(c.status)) return 'entrega'
  if (c.status === 'entregue_loja' || c.status === 'concluida') return c.modalidade === 'buscar' ? 'busca' : 'entrega'
  return 'busca'
}

export function formatarReais(valor: number | string | null | undefined): string {
  return `R$ ${Number(valor ?? 0).toFixed(2).replace('.', ',')}`
}

export function formatarKm(km: number | null | undefined): string {
  return `${Number(km ?? 0).toFixed(1).replace('.', ',')} km`
}

export function formatarCep(cep: string): string {
  const d = cep.replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep
}

// Linha de fn_listar_corridas (migration 042), números já convertidos.
export interface Corrida {
  id_corrida: string
  id_agendamento: string
  status: StatusCorrida
  modalidade: ModalidadeTaxiDog
  valor: number
  distancia_km: number | null
  criterio: string | null
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
  status_agendamento: string
  obs_agendamento: string | null
  servicos: string | null
  id_pet: string
  pet_nome: string
  pet_raca: string
  pet_especie: string | null
  pet_porte: string | null
  pet_foto_url: string | null
  pet_obs: string | null
  pet_comportamento: string[] | null
  pet_obs_comportamento: string | null
  id_cliente: string
  cliente_nome: string
  cliente_telefone: string
  id_funcionario: string | null
  funcionario_nome: string | null
  loja_nome: string
  loja_endereco: string | null
  loja_lat: number | null
  loja_lng: number | null
  eventos: { status: string; descricao: string; created_at: string }[]
  created_at: string
}

export function normalizarCorrida(row: Record<string, unknown>): Corrida {
  const r = row as unknown as Corrida
  return {
    ...r,
    valor: Number(r.valor ?? 0),
    distancia_km: r.distancia_km == null ? null : Number(r.distancia_km),
    eventos: Array.isArray(r.eventos) ? r.eventos : [],
  }
}

export function enderecoCliente(c: Corrida): string {
  const rua = `${c.logradouro}, ${c.numero}`
  return [rua, c.complemento, c.bairro, `${c.cidade} - ${c.uf}`].filter(Boolean).join(' · ')
}
