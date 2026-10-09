// Espelha petshop-app/src/lib/taxidog.ts — mesmos rótulos, mesma tabela de
// etapas (a que fn_avancar_corrida aceita no banco, migration 042). Nunca
// mostre `status` cru: rótulos como "Aguardando TaxiDog" e "Serviço
// finalizado" são derivados de status + modalidade + atribuição.

export type ModalidadeTaxiDog = 'buscar' | 'entregar' | 'buscar_entregar'

// Etiquetas de comportamento do perfil do pet (as mesmas do site).
export const COMPORTAMENTOS_SUGERIDOS = [
  'Tranquilo',
  'Agitado',
  'Medo de secador',
  'Não gosta de outros animais',
  'Precisa de atenção especial',
  'Morde',
  'Idoso',
]

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

// Situação do transporte como a LOJA vê no detalhe do agendamento — o
// mesmo texto do site (rotuloTransporte, lib/taxidog-rotas).
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

// ── Quadro de corridas (o Kanban do site, lib/taxidog) ──

// Situação da corrida como o quadro mostra — os mesmos textos do site
// (rotuloStatusCorrida de lá; o daqui em cima é o da área do TaxiDog).
export function rotuloDaCorridaNoQuadro(c: { status: string; modalidade: string; temTaxiDog: boolean; statusAgendamento?: string | null }): string {
  switch (c.status) {
    case 'agendada':
      if (c.modalidade === 'entregar') return c.temTaxiDog ? 'Aguardando serviço' : 'Aguardando serviço · sem TaxiDog'
      if (c.statusAgendamento === 'Pendente') return 'Pendente'
      return c.temTaxiDog ? 'Corrida atribuída' : 'Aguardando TaxiDog'
    case 'a_caminho_cliente': return 'A caminho do cliente'
    case 'no_endereco': return 'Chegou ao endereço'
    case 'pet_embarcado': return 'Pet embarcado'
    case 'entregue_loja': return 'Pet entregue na loja'
    case 'pronto_entrega': return c.temTaxiDog ? 'Serviço finalizado' : 'Pronto · aguardando TaxiDog'
    case 'a_caminho_entrega': return 'A caminho para entrega'
    case 'no_endereco_entrega': return 'Chegou ao endereço'
    case 'concluida': return 'Corrida concluída'
    case 'cancelada': return 'Cancelada'
    default: return c.status
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

// Cancelada não entra em coluna nenhuma do quadro.
export function grupoCorrida(status: string, temTaxiDog: boolean): GrupoCorrida | null {
  if (status === 'cancelada') return null
  if (status === 'concluida') return 'concluidas'
  if (emMovimento(status)) return 'andamento'
  return temTaxiDog ? 'atribuidas' : 'pendentes'
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

// "R$ 1.234,50" — com o ponto de milhar, como no site.
export function formatarReais(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0)
  const [inteiro, centavos] = Math.abs(n).toFixed(2).split('.')
  const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}R$ ${comPontos},${centavos}`
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

// ── Tempo limite de espera na retirada (migration 093) ─────────────────────
export interface RetiradaCancelada {
  cliente_nome: string
  cliente_telefone: string
  pet: string
  loja: string
  minutos: number
}

// Aviso ao cliente quando a retirada é cancelada por tempo de espera: link
// do WhatsApp com a mensagem pronta (é só tocar em enviar).
export function whatsappRetiradaCancelada(r: RetiradaCancelada): string | null {
  const telefone = (r.cliente_telefone ?? '').replace(/\D/g, '')
  if (!telefone) return null
  const primeiroNome = (r.cliente_nome ?? '').split(' ')[0] || 'tudo bem'
  const texto =
    `Olá, ${primeiroNome}! Aqui é da ${r.loja}. ` +
    `Nosso TaxiDog esperou ${r.minutos} minutos no endereço combinado para buscar ${r.pet}, ` +
    `mas o pet não foi entregue nesse tempo. Por isso a retirada e o agendamento de hoje foram cancelados. ` +
    `Se quiser remarcar, é só responder esta mensagem.`
  return `https://wa.me/55${telefone}?text=${encodeURIComponent(texto)}`
}
