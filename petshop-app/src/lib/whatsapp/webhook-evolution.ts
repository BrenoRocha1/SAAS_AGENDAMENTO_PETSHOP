import type { Midia, TipoMensagem } from './tipos'

// O que a Evolution API manda para o webhook, lido e reduzido ao que o SAIP
// grava. O pacote tem { event, instance, data, ... }; os eventos usados são
// messages.upsert (mensagem nova, de quem for), messages.update (status) e
// connection.update (conectou, caiu).

export interface MensagemEvolution {
  telefone: string
  // true: a loja mandou (pelo SAIP ou direto pelo celular).
  daLoja: boolean
  nome: string | null
  idProvedor: string
  tipo: TipoMensagem
  texto: string | null
  midia: Midia | null
  dados: Record<string, unknown> | null
  quando: string
}

export interface StatusEvolution {
  idProvedor: string
  status: 'enviada' | 'entregue' | 'lida' | 'erro'
}

export interface ConexaoEvolution {
  estado: 'open' | 'connecting' | 'close'
  // Número e nome do perfil que conectou (vêm quando abre).
  telefone: string | null
  nome: string | null
}

export interface EventoEvolution {
  instancia: string | null
  mensagem: MensagemEvolution | null
  status: StatusEvolution | null
  conexao: ConexaoEvolution | null
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

// "5511999998888@s.whatsapp.net" → "5511999998888". Grupo, lista de
// transmissão, status e canal não são conversa com um cliente: null.
function telefoneDoJid(jid: unknown): string | null {
  const t = texto(jid)
  if (!t || !/@(s\.whatsapp\.net|c\.us)$/.test(t)) return null
  const digitos = t.split('@')[0].split(':')[0].replace(/\D/g, '')
  return /^\d{8,15}$/.test(digitos) ? digitos : null
}

function instante(timestamp: unknown): string {
  const segundos = Number(obj(timestamp)?.low ?? timestamp)
  return Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : new Date().toISOString()
}

// Mensagem temporária, de visualização única ou documento com legenda vêm
// embrulhadas: o conteúdo de verdade está um nível abaixo.
function desembrulhar(m: Obj | null): Obj | null {
  let atual = m
  for (let i = 0; i < 4 && atual; i++) {
    const dentro = obj(obj(atual.ephemeralMessage)?.message)
      ?? obj(obj(atual.viewOnceMessage)?.message)
      ?? obj(obj(atual.viewOnceMessageV2)?.message)
      ?? obj(obj(atual.documentWithCaptionMessage)?.message)
    if (!dentro) break
    atual = dentro
  }
  return atual
}

function lerConteudo(idProvedor: string, bruto: Obj | null): Pick<MensagemEvolution, 'tipo' | 'texto' | 'midia' | 'dados'> | null {
  const m = desembrulhar(bruto)
  if (!m) return null
  // Reação, apagar/editar e avisos internos do WhatsApp não viram mensagem.
  if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage && Object.keys(m).length === 1) return null

  // O arquivo é buscado depois pela própria mensagem: o id é o dela.
  const midia = (parte: Obj | null): Midia => ({ id: idProvedor, mime: texto(parte?.mimetype) ?? undefined, nome: texto(parte?.fileName) ?? undefined })

  if (texto(m.conversation)) return { tipo: 'texto', texto: texto(m.conversation), midia: null, dados: null }
  const estendido = obj(m.extendedTextMessage)
  if (estendido) return { tipo: 'texto', texto: texto(estendido.text), midia: null, dados: null }
  const imagem = obj(m.imageMessage)
  if (imagem) return { tipo: 'imagem', texto: texto(imagem.caption), midia: midia(imagem), dados: null }
  const video = obj(m.videoMessage)
  if (video) return { tipo: 'video', texto: texto(video.caption), midia: midia(video), dados: null }
  const audio = obj(m.audioMessage)
  if (audio) return { tipo: 'audio', texto: null, midia: midia(audio), dados: null }
  const documento = obj(m.documentMessage)
  if (documento) return { tipo: 'documento', texto: texto(documento.caption), midia: midia(documento), dados: null }
  const figurinha = obj(m.stickerMessage)
  if (figurinha) return { tipo: 'figurinha', texto: null, midia: midia(figurinha), dados: null }
  const local = obj(m.locationMessage) ?? obj(m.liveLocationMessage)
  if (local) {
    return {
      tipo: 'localizacao',
      texto: texto(local.name) ?? texto(local.address),
      midia: null,
      dados: { latitude: local.degreesLatitude ?? null, longitude: local.degreesLongitude ?? null, nome: local.name ?? null, endereco: local.address ?? null },
    }
  }
  const contato = obj(m.contactMessage)
  if (contato) return { tipo: 'contato', texto: texto(contato.displayName), midia: null, dados: null }
  const contatos = obj(m.contactsArrayMessage)
  if (contatos) return { tipo: 'contato', texto: texto(contatos.displayName), midia: null, dados: null }
  // Resposta a botão ou a lista: fica como texto, com o que a pessoa escolheu.
  const escolha = texto(obj(m.buttonsResponseMessage)?.selectedDisplayText)
    ?? texto(obj(m.templateButtonReplyMessage)?.selectedDisplayText)
    ?? texto(obj(m.listResponseMessage)?.title)
  if (escolha) return { tipo: 'texto', texto: escolha, midia: null, dados: null }

  return { tipo: 'outro', texto: null, midia: null, dados: { tipo_original: Object.keys(m)[0] ?? 'desconhecido' } }
}

const STATUS: Record<string, StatusEvolution['status']> = {
  SERVER_ACK: 'enviada',
  DELIVERY_ACK: 'entregue',
  READ: 'lida',
  PLAYED: 'lida',
  ERROR: 'erro',
}

export function lerWebhookEvolution(corpo: unknown): EventoEvolution {
  const raiz = obj(corpo)
  const evento: EventoEvolution = { instancia: texto(raiz?.instance), mensagem: null, status: null, conexao: null }
  // "messages.upsert" ou "MESSAGES_UPSERT", conforme a versão.
  const nome = (texto(raiz?.event) ?? '').toLowerCase().replace(/_/g, '.')
  const data = obj(raiz?.data)
  if (!data) return evento

  if (nome === 'messages.upsert') {
    const chave = obj(data.key)
    const idProvedor = texto(chave?.id)
    // Contato que chega com identificador interno (@lid) traz o número em
    // remoteJidAlt.
    const telefone = telefoneDoJid(chave?.remoteJid) ?? telefoneDoJid(chave?.remoteJidAlt) ?? telefoneDoJid(chave?.senderPn)
    if (!idProvedor || !telefone) return evento
    const conteudo = lerConteudo(idProvedor, obj(data.message))
    if (!conteudo) return evento
    const daLoja = chave?.fromMe === true
    evento.mensagem = {
      telefone,
      daLoja,
      nome: daLoja ? null : texto(data.pushName),
      idProvedor,
      quando: instante(data.messageTimestamp),
      ...conteudo,
    }
  } else if (nome === 'messages.update') {
    const idProvedor = texto(data.keyId) ?? texto(obj(data.key)?.id)
    const status = STATUS[texto(data.status) ?? '']
    // Só interessa o andamento do que a loja enviou.
    if (idProvedor && status && data.fromMe !== false) evento.status = { idProvedor, status }
  } else if (nome === 'connection.update') {
    const estado = texto(data.state)
    if (estado === 'open' || estado === 'connecting' || estado === 'close') {
      evento.conexao = { estado, telefone: telefoneDoJid(data.wuid), nome: texto(data.profileName) }
    }
  }
  return evento
}
