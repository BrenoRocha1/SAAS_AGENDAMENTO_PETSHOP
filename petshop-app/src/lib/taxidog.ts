// ============================================================
// TaxiDog — vocabulário compartilhado (migration 042)
// ============================================================
// O banco grava um status LINEAR por corrida (ver 042_taxidog.sql). Os
// rótulos que a tela mostra ("Pendente", "Aguardando TaxiDog", "Corrida
// atribuída", "Serviço finalizado"…) são DERIVADOS aqui a partir do
// status + modalidade + se já tem TaxiDog + status do agendamento. Nunca
// mostre `status` cru na interface.
// O app mobile (petshop-mobile/src/lib/taxidog.ts) espelha este arquivo.

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

export type ModoCobrancaTaxiDog = 'fixo' | 'distancia' | 'regiao' | 'personalizado'

export const MODALIDADES: ModalidadeTaxiDog[] = ['buscar', 'entregar', 'buscar_entregar']

export const ROTULO_MODALIDADE: Record<ModalidadeTaxiDog, string> = {
  buscar: 'Somente buscar',
  entregar: 'Somente entregar',
  buscar_entregar: 'Buscar e entregar',
}

export const DESCRICAO_MODALIDADE: Record<ModalidadeTaxiDog, string> = {
  buscar: 'Buscamos o pet no seu endereço. Você retira na loja depois.',
  entregar: 'Você leva o pet até a loja. Entregamos no seu endereço depois.',
  buscar_entregar: 'Buscamos o pet e levamos de volta quando o serviço terminar.',
}

export const ROTULO_MODO_COBRANCA: Record<ModoCobrancaTaxiDog, string> = {
  fixo: 'Valor fixo',
  distancia: 'Por distância',
  regiao: 'Por região',
  personalizado: 'Região + distância',
}

export interface InfoStatusCorrida {
  status: StatusCorrida | string
  modalidade: ModalidadeTaxiDog | string
  temTaxiDog: boolean
  statusAgendamento?: string | null
}

export function rotuloStatusCorrida({ status, modalidade, temTaxiDog, statusAgendamento }: InfoStatusCorrida): string {
  switch (status) {
    case 'agendada':
      if (modalidade === 'entregar') return temTaxiDog ? 'Aguardando serviço' : 'Aguardando serviço · sem TaxiDog'
      if (statusAgendamento === 'Pendente') return 'Pendente'
      return temTaxiDog ? 'Corrida atribuída' : 'Aguardando TaxiDog'
    case 'a_caminho_cliente': return 'A caminho do cliente'
    case 'no_endereco': return 'Chegou ao endereço'
    case 'pet_embarcado': return 'Pet embarcado'
    case 'entregue_loja': return 'Pet entregue na loja'
    case 'pronto_entrega': return temTaxiDog ? 'Serviço finalizado' : 'Pronto · aguardando TaxiDog'
    case 'a_caminho_entrega': return 'A caminho para entrega'
    case 'no_endereco_entrega': return 'Chegou ao endereço'
    case 'concluida': return 'Corrida concluída'
    case 'cancelada': return 'Cancelada'
    default: return String(status)
  }
}

export type GrupoCorrida = 'pendentes' | 'atribuidas' | 'andamento' | 'concluidas'

export const ROTULO_GRUPO: Record<GrupoCorrida, string> = {
  pendentes: 'Pendentes',
  atribuidas: 'Atribuídas',
  andamento: 'Em andamento',
  concluidas: 'Concluídas',
}

const EM_MOVIMENTO: string[] = ['a_caminho_cliente', 'no_endereco', 'pet_embarcado', 'a_caminho_entrega', 'no_endereco_entrega']

export function emMovimento(status: string): boolean {
  return EM_MOVIMENTO.includes(status)
}

// Cancelada não entra em coluna nenhuma do painel.
export function grupoCorrida(status: string, temTaxiDog: boolean): GrupoCorrida | null {
  if (status === 'cancelada') return null
  if (status === 'concluida') return 'concluidas'
  if (emMovimento(status)) return 'andamento'
  return temTaxiDog ? 'atribuidas' : 'pendentes'
}

// A próxima etapa possível e o texto do botão que leva até ela — mesma
// tabela de transições que fn_avancar_corrida aceita no banco.
export function proximaAcaoCorrida(
  status: string,
  modalidade: string
): { status: StatusCorrida; rotulo: string } | null {
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

// A corrida ainda admite troca de TaxiDog? (mesma regra de fn_atribuir_corrida)
export function podeReatribuir(status: string): boolean {
  return status === 'agendada' || status === 'entregue_loja' || status === 'pronto_entrega'
}

export function formatarReais(valor: number | string | null | undefined): string {
  return `R$ ${Number(valor ?? 0).toFixed(2).replace('.', ',')}`
}

export function formatarKm(km: number | string | null | undefined): string {
  return `${Number(km ?? 0).toFixed(1).replace('.', ',')} km`
}

export interface EnderecoTaxiDog {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const ENDERECO_VAZIO: EnderecoTaxiDog = {
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
}

export function enderecoEmUmaLinha(e: { [K in keyof EnderecoTaxiDog]?: string | null }): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const cidade = [e.cidade, e.uf].filter(Boolean).join(' - ')
  return [rua, e.complemento, e.bairro, cidade].filter(Boolean).join(' · ')
}

export function formatarCep(cep: string): string {
  const d = cep.replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep
}

// Cotação de UMA modalidade, como fn_cotar_taxidog devolve.
export interface CotacaoTaxiDog {
  disponivel: boolean
  valor: number | null
  distanciaKm: number | null
  criterio: string | null
  motivo: string | null
}

// Escolha feita no agendamento — `null` = "vou levar o pet".
export interface EscolhaTaxiDog {
  modalidade: ModalidadeTaxiDog
  endereco: EnderecoTaxiDog
  cotacao: CotacaoTaxiDog
}

// Linha de fn_listar_corridas (migration 042), já com números convertidos.
export interface CorridaDetalhe {
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

export function normalizarCorrida(row: Record<string, unknown>): CorridaDetalhe {
  const r = row as unknown as CorridaDetalhe
  return {
    ...r,
    valor: Number(r.valor ?? 0),
    distancia_km: r.distancia_km == null ? null : Number(r.distancia_km),
    eventos: Array.isArray(r.eventos) ? r.eventos : [],
  }
}

// Comportamentos sugeridos no perfil do pet — a loja pode digitar outros.
export const COMPORTAMENTOS_SUGERIDOS = [
  'Tranquilo',
  'Agitado',
  'Medo de secador',
  'Não gosta de outros animais',
  'Precisa de atenção especial',
  'Morde',
  'Idoso',
]
