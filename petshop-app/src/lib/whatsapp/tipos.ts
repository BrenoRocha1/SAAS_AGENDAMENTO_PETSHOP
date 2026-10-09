// Tipos da central de WhatsApp (migration 088) — os mesmos nomes das
// colunas e das funções do banco. Sem nada de servidor aqui: este arquivo
// é usado também pela tela.

export type StatusConversa = 'espera' | 'ativa' | 'encerrada'
export type DirecaoMensagem = 'entrada' | 'saida'
export type TipoMensagem =
  | 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha'
  | 'localizacao' | 'contato' | 'sistema' | 'outro'
export type StatusMensagem = 'recebida' | 'enviando' | 'enviada' | 'entregue' | 'lida' | 'erro'

// Abas e filtros da lista (fn_whatsapp_conversas).
export type FiltroConversas = 'abertas' | 'espera' | 'ativas' | 'minhas' | 'nao_lidas' | 'encerradas'

// Uma linha da lista de conversas.
export interface Conversa {
  id_conversa: string
  numero: number
  telefone: string
  // Nome do cadastro do cliente, ou o do perfil do WhatsApp; pode faltar.
  nome: string | null
  id_cliente: string | null
  foto_url: string | null
  id_pet: string | null
  // "Thor • Golden Retriever" (pet da conversa) ou "Thor, Luna" (pets do cliente).
  pets: string | null
  status: StatusConversa
  id_responsavel: string | null
  nome_responsavel: string | null
  nao_lidas: number
  ultima_mensagem_em: string | null
  ultima_mensagem_texto: string | null
  ultima_mensagem_direcao: DirecaoMensagem | null
  // Última mensagem do contato: abre a janela de 24 horas para responder.
  ultima_entrada_em: string | null
  // Data que ordena a lista (última mensagem ou a criação da conversa).
  ordem: string
}

export interface Midia {
  // Identificador do arquivo na Meta.
  id: string
  mime?: string
  nome?: string
}

export interface Mensagem {
  id_mensagem: string
  id_conversa: string
  direcao: DirecaoMensagem
  tipo: TipoMensagem
  texto: string | null
  midia: Midia | null
  dados: Record<string, unknown> | null
  status: StatusMensagem
  erro: string | null
  nome_autor: string | null
  enviada_em: string
}

export const COLUNAS_MENSAGEM = 'id_mensagem, id_conversa, direcao, tipo, texto, midia, dados, status, erro, nome_autor, enviada_em'

// cloud_api: a API oficial da Meta · evolution: QR code (não oficial).
export type Provedor = 'cloud_api' | 'evolution'

export interface IntegracaoResumo {
  // pendente: QR code gerado, ainda não escaneado.
  status: 'conectado' | 'erro' | 'desconectado' | 'pendente'
  // Antes da migration 089 não vem: vale a API oficial.
  provedor?: Provedor
  numero: string | null
  nome: string | null
  ultimo_erro: string | null
  webhook_em: string | null
}

export interface Contadores {
  abertas: number
  espera: number
  ativas: number
  minhas: number
  encerradas: number
  nao_lidas: number
  mensagens_nao_lidas: number
}

export interface ResumoWhatsApp {
  integracao: IntegracaoResumo | null
  contadores: Contadores
}

export interface AgendamentoResumido {
  data: string
  hora: string
  servico: string
  pet?: string | null
  status?: string
}

export interface PetDoContato {
  id_pet: string
  nome: string
  raca: string
  foto_url: string | null
  proximo: AgendamentoResumido | null
}

// fn_whatsapp_contato: o cliente da conversa e a situação dele na loja.
export interface ContatoDaConversa {
  cliente: { id_cliente: string; nome: string; telefone: string; foto_url: string | null; ativo: boolean } | null
  total_gasto?: number
  atendimentos?: number
  ultimo?: AgendamentoResumido | null
  proximo?: AgendamentoResumido | null
  pets: PetDoContato[]
}

export interface ClienteParaConversa {
  id_cliente: string
  nome: string
  telefone: string
  foto_url: string | null
  pets: string | null
}

// A Meta só deixa mandar mensagem livre até 24 horas depois da última
// mensagem do contato; fora disso, só modelo aprovado por ela.
export const JANELA_RESPOSTA_MS = 24 * 60 * 60 * 1000

export function janelaAberta(ultimaEntradaEm: string | null, agora = Date.now()): boolean {
  if (!ultimaEntradaEm) return false
  return agora - new Date(ultimaEntradaEm).getTime() < JANELA_RESPOSTA_MS
}

// A regra das 24 horas é da API oficial; pelo QR code a loja escreve quando
// quiser, como no celular.
export function temJanelaDeResposta(integracao: IntegracaoResumo | null | undefined): boolean {
  return integracao?.provedor !== 'evolution'
}

// A integração está pronta para enviar e receber?
export function conectado(integracao: IntegracaoResumo | null | undefined): boolean {
  return integracao?.status === 'conectado'
}

// "5511999998888" → "(11) 99999-8888"; número de outro país sai com "+".
export function formatarTelefoneWhatsApp(telefone: string): string {
  const d = telefone.replace(/\D/g, '')
  const local = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : null
  if (!local) return `+${d}`
  const ddd = local.slice(0, 2)
  const resto = local.slice(2)
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`
}

export const ROTULO_STATUS_CONVERSA: Record<StatusConversa, string> = {
  espera: 'Aguardando atendimento',
  ativa: 'Em atendimento',
  encerrada: 'Encerrada',
}

// Mensagens do banco ("WhatsApp: ...") já vêm prontas para mostrar.
export function mensagemDoWhatsApp(error: { message?: string; code?: string } | null | undefined, padrao: string): string {
  const msg = error?.message ?? ''
  if (error?.code === 'PGRST202' || error?.code === '42P01' || /Could not find the function|does not exist|schema cache/i.test(msg)) {
    return 'Execute a migration 088_whatsapp.sql para usar o WhatsApp.'
  }
  const m = msg.match(/WhatsApp: ([^\n]+)/)
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + (/[.!?]$/.test(m[1]) ? '' : '.')
  return padrao
}
