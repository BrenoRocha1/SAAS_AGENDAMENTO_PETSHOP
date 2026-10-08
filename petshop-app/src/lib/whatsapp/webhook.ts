import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Midia, TipoMensagem } from './tipos'

// O que a Meta manda para o webhook (WhatsApp Business Account), lido e
// reduzido ao que o SAIP grava. Só o servidor usa.

export interface MensagemRecebida {
  phoneNumberId: string
  de: string
  nome: string | null
  idProvedor: string
  tipo: TipoMensagem
  texto: string | null
  midia: Midia | null
  dados: Record<string, unknown> | null
  quando: string
}

export interface StatusRecebido {
  phoneNumberId: string
  idProvedor: string
  status: 'enviada' | 'entregue' | 'lida' | 'erro'
  erro: string | null
}

export interface EventosDoWebhook {
  mensagens: MensagemRecebida[]
  status: StatusRecebido[]
  // Números (da loja) citados no pacote — para achar as lojas.
  numeros: string[]
}

// Confere a assinatura que a Meta põe em X-Hub-Signature-256: HMAC-SHA256
// do corpo cru com o segredo do app.
export function assinaturaValida(corpoCru: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho || !segredo) return false
  const recebida = cabecalho.startsWith('sha256=') ? cabecalho.slice(7) : cabecalho
  const esperada = createHmac('sha256', segredo).update(corpoCru, 'utf8').digest('hex')
  const a = Buffer.from(recebida, 'utf8')
  const b = Buffer.from(esperada, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function instante(timestamp: unknown): string {
  const segundos = Number(timestamp)
  return Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : new Date().toISOString()
}

function midiaDe(parte: Obj | null): Midia | null {
  const id = texto(parte?.id)
  if (!id) return null
  return { id, mime: texto(parte?.mime_type) ?? undefined, nome: texto(parte?.filename) ?? undefined }
}

// Uma mensagem da Meta → tipo, texto e arquivo do SAIP. Devolve null para o
// que não vira mensagem na conversa (reação a outra mensagem, por exemplo).
function lerMensagem(m: Obj): Pick<MensagemRecebida, 'tipo' | 'texto' | 'midia' | 'dados'> | null {
  const tipo = texto(m.type) ?? 'unknown'
  switch (tipo) {
    case 'text':
      return { tipo: 'texto', texto: texto(obj(m.text)?.body), midia: null, dados: null }
    case 'image':
      return { tipo: 'imagem', texto: texto(obj(m.image)?.caption), midia: midiaDe(obj(m.image)), dados: null }
    case 'video':
      return { tipo: 'video', texto: texto(obj(m.video)?.caption), midia: midiaDe(obj(m.video)), dados: null }
    case 'audio':
      return { tipo: 'audio', texto: null, midia: midiaDe(obj(m.audio)), dados: null }
    case 'document':
      return { tipo: 'documento', texto: texto(obj(m.document)?.caption), midia: midiaDe(obj(m.document)), dados: null }
    case 'sticker':
      return { tipo: 'figurinha', texto: null, midia: midiaDe(obj(m.sticker)), dados: null }
    case 'location': {
      const l = obj(m.location)
      return {
        tipo: 'localizacao',
        texto: texto(l?.name) ?? texto(l?.address),
        midia: null,
        dados: { latitude: l?.latitude ?? null, longitude: l?.longitude ?? null, nome: l?.name ?? null, endereco: l?.address ?? null },
      }
    }
    case 'contacts': {
      const nomes = lista(m.contacts).map(c => texto(obj(obj(c)?.name)?.formatted_name)).filter(Boolean)
      return { tipo: 'contato', texto: nomes.join(', ') || null, midia: null, dados: { contatos: lista(m.contacts) } }
    }
    // Resposta a um botão ou a uma lista: fica como texto, com o que a
    // pessoa escolheu.
    case 'button':
      return { tipo: 'texto', texto: texto(obj(m.button)?.text), midia: null, dados: null }
    case 'interactive': {
      const i = obj(m.interactive)
      const escolha = obj(i?.button_reply) ?? obj(i?.list_reply)
      return { tipo: 'texto', texto: texto(escolha?.title), midia: null, dados: null }
    }
    case 'reaction':
      return null
    default:
      return { tipo: 'outro', texto: null, midia: null, dados: { tipo_original: tipo } }
  }
}

const STATUS: Record<string, StatusRecebido['status']> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'erro' }

export function lerWebhook(corpo: unknown): EventosDoWebhook {
  const eventos: EventosDoWebhook = { mensagens: [], status: [], numeros: [] }
  const raiz = obj(corpo)
  if (raiz?.object !== 'whatsapp_business_account') return eventos

  for (const entrada of lista(raiz.entry)) {
    for (const mudanca of lista(obj(entrada)?.changes)) {
      const m = obj(mudanca)
      if (m?.field !== 'messages') continue
      const valor = obj(m.value)
      const phoneNumberId = texto(obj(valor?.metadata)?.phone_number_id)
      if (!valor || !phoneNumberId) continue
      if (!eventos.numeros.includes(phoneNumberId)) eventos.numeros.push(phoneNumberId)

      // Nome do perfil de quem escreveu, por telefone.
      const nomes = new Map<string, string>()
      for (const c of lista(valor.contacts)) {
        const waId = texto(obj(c)?.wa_id)
        const nome = texto(obj(obj(c)?.profile)?.name)
        if (waId && nome) nomes.set(waId, nome)
      }

      for (const bruta of lista(valor.messages)) {
        const msg = obj(bruta)
        const de = texto(msg?.from)
        const idProvedor = texto(msg?.id)
        if (!msg || !de || !idProvedor) continue
        const lida = lerMensagem(msg)
        if (!lida) continue
        eventos.mensagens.push({ phoneNumberId, de, nome: nomes.get(de) ?? null, idProvedor, quando: instante(msg.timestamp), ...lida })
      }

      for (const bruto of lista(valor.statuses)) {
        const st = obj(bruto)
        const idProvedor = texto(st?.id)
        const status = STATUS[texto(st?.status) ?? '']
        if (!idProvedor || !status) continue
        const erro = obj(lista(st?.errors)[0])
        eventos.status.push({
          phoneNumberId,
          idProvedor,
          status,
          erro: status === 'erro' ? (texto(obj(erro?.error_data)?.details) ?? texto(erro?.title) ?? texto(erro?.message)) : null,
        })
      }
    }
  }
  return eventos
}
