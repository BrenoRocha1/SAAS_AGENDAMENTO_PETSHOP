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

// A situação do TaxiDog de um agendamento, do ponto de vista da LOJA — a
// etiqueta do card no Gestor de Agendamentos: o pet já chegou? está a
// caminho? ainda falta alguém pegar a corrida? `tom` é a cor (as mesmas das
// etapas: amarelo = esperando, azul = combinado, roxo = na rua, verde = feito).
export type TomTaxiDog = 'aguardando' | 'aceito' | 'andamento' | 'concluido'
export function situacaoDoTaxiDog(t: { status: string; modalidade: string; temTaxiDog?: boolean; naRota?: boolean }): { texto: string; tom: TomTaxiDog } {
  const comQuem = !!t.temTaxiDog || !!t.naRota
  switch (t.status) {
    case 'agendada':
      // "Só entregar": o cliente traz o pet; o TaxiDog entra depois do serviço.
      if (t.modalidade === 'entregar') return { texto: 'Entrega depois do serviço', tom: 'aceito' }
      return comQuem ? { texto: 'Busca agendada', tom: 'aceito' } : { texto: 'Aguardando TaxiDog', tom: 'aguardando' }
    case 'a_caminho_cliente': return { texto: 'Indo buscar o pet', tom: 'andamento' }
    case 'no_endereco': return { texto: 'No endereço do cliente', tom: 'andamento' }
    case 'pet_embarcado': return { texto: 'Pet a caminho da loja', tom: 'andamento' }
    case 'entregue_loja': return { texto: 'Pet chegou à loja', tom: 'concluido' }
    case 'pronto_entrega':
      return comQuem ? { texto: 'Entrega agendada', tom: 'aceito' } : { texto: 'Aguardando TaxiDog para entrega', tom: 'aguardando' }
    case 'a_caminho_entrega': return { texto: 'Levando o pet para casa', tom: 'andamento' }
    case 'no_endereco_entrega': return { texto: 'No endereço da entrega', tom: 'andamento' }
    // Corrida de "só buscar" termina com o pet na loja.
    case 'concluida': return { texto: t.modalidade === 'buscar' ? 'Pet chegou à loja' : 'Pet entregue em casa', tom: 'concluido' }
    default: return { texto: 'TaxiDog', tom: 'aceito' }
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
// Busca do TaxiDog que ainda não chegou à loja — o aviso de quem vai iniciar
// ou finalizar o atendimento. `corridas`: as buscas ("buscar" e "buscar e
// entregar") não canceladas da VISITA (mesmo pet, mesmo dia). Vale a corrida
// do próprio agendamento; sem ela, as da visita. E, se alguma das que valem
// já chegou à loja, o pet está lá: não há o que avisar. (Antes bastava haver
// uma busca pendente em QUALQUER agendamento do pet no dia — o pet chegava
// pela corrida das 09:00 e o aviso aparecia por causa da corrida das 15:00.)
const BUSCA_A_CAMINHO: string[] = ['agendada', 'a_caminho_cliente', 'no_endereco', 'pet_embarcado']
export function buscaQueNaoChegou<T extends { id_agendamento: string; status: string }>(corridas: T[], idAgendamento: string): T | null {
  const proprias = corridas.filter(c => c.id_agendamento === idAgendamento)
  const valem = proprias.length > 0 ? proprias : corridas
  if (valem.some(c => !BUSCA_A_CAMINHO.includes(c.status))) return null
  return valem[0] ?? null
}

export function podeReatribuir(status: string): boolean {
  return status === 'agendada' || status === 'entregue_loja' || status === 'pronto_entrega'
}

// "R$ 2.680,00" — com o ponto de milhar, igual ao app (formatarMoeda).
export function formatarReais(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0)
  const [inteiro, centavos] = Math.abs(n).toFixed(2).split('.')
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}R$ ${comPontos},${centavos}`
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
  // TaxiDog escolhido por quem agenda (migration 047); null = sem preferência.
  idTaxidog: string | null
  nomeTaxidog: string | null
}

// Opção da lista "quem faz a corrida" (fn_taxidogs_publicos).
export interface TaxiDogOpcao {
  id_funcionario: string
  nome: string
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
