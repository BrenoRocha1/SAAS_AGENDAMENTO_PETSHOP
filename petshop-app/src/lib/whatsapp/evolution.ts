// Conexão por QR code: a Evolution API (servidor de código aberto que mantém
// uma sessão de WhatsApp Web aberta para cada loja). Só o servidor do SAIP
// importa este arquivo. NÃO é a API oficial da Meta.
//
// O endereço e a chave do servidor da Evolution vêm do ambiente
// (EVOLUTION_API_URL e EVOLUTION_API_KEY) — é um servidor só para todas as
// lojas; cada loja tem a sua "instância" lá dentro.
//
// Formatos conferidos no código da Evolution API v2 (rotas instance/*,
// message/*, webhook/set e chat/getBase64FromMediaMessage).

import type { ArquivoParaEnvio, ErroDoProvedor, ProvedorWhatsApp, RespostaDoProvedor } from './provedor'

export interface ConfigEvolution {
  url: string
  apiKey: string
}

export type EstadoDaInstancia = 'open' | 'connecting' | 'close'

// O servidor de QR está configurado no SAIP?
export function configEvolution(): ConfigEvolution | null {
  const url = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  if (!url || !apiKey || !/^https?:\/\//.test(url)) return null
  return { url, apiKey }
}

// A instância da loja no servidor da Evolution: um nome fixo por loja.
export function nomeDaInstancia(idLojista: string): string {
  return `saip-${idLojista.replace(/-/g, '')}`
}

const TEMPO_LIMITE_MS = 25_000

const MSG_SEM_SERVIDOR = 'Não foi possível falar com o servidor de conexão do WhatsApp agora. Tente novamente em instantes.'
const MSG_DESCONECTADO = 'O WhatsApp da loja está desconectado. Escaneie o QR code de novo em Configurações → WhatsApp.'

type Resposta = { status: number; json: unknown } | { falha: ErroDoProvedor }

async function chamar(cfg: ConfigEvolution, metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<Resposta> {
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)
  try {
    const resposta = await fetch(`${cfg.url}${caminho}`, {
      method: metodo,
      headers: { apikey: cfg.apiKey, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
      cache: 'no-store',
    })
    const json: unknown = await resposta.json().catch(() => null)
    return { status: resposta.status, json }
  } catch {
    return { falha: { mensagem: MSG_SEM_SERVIDOR } }
  } finally {
    clearTimeout(relogio)
  }
}

const ok = (status: number) => status >= 200 && status < 300

// Texto do erro que a Evolution devolve (o formato muda entre as rotas).
function detalheDoErro(json: unknown): string {
  const j = json as { message?: unknown; error?: unknown; response?: { message?: unknown } } | null
  const bruto = j?.response?.message ?? j?.message ?? (j?.error as { message?: unknown } | null)?.message ?? j?.error
  return typeof bruto === 'string' ? bruto : JSON.stringify(bruto ?? '')
}

function traduzirErro(status: number, json: unknown): ErroDoProvedor {
  const detalhe = detalheDoErro(json)
  if (status === 401 || status === 403) {
    return { mensagem: 'O servidor de conexão do WhatsApp recusou o acesso. Avise o suporte do SAIP.' }
  }
  if (status === 404) return { mensagem: MSG_DESCONECTADO, tokenInvalido: true }
  if (/"exists":\s*false/.test(detalhe)) return { mensagem: 'Este número não tem WhatsApp.' }
  if (/connection closed|not connected|closed/i.test(detalhe)) return { mensagem: MSG_DESCONECTADO, tokenInvalido: true }
  return { mensagem: 'O WhatsApp não aceitou a mensagem agora. Tente novamente.' }
}

// ------------------------------------------------------------
// Instância (a sessão da loja)
// ------------------------------------------------------------

// Cria a instância da loja (se já existir, tudo bem) e aponta o webhook
// dela para o SAIP. Só os eventos que o SAIP usa.
export async function prepararInstancia(cfg: ConfigEvolution, instancia: string, enderecoWebhook: string): Promise<RespostaDoProvedor<object>> {
  const criada = await chamar(cfg, 'POST', '/instance/create', { instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true })
  if ('falha' in criada) return { ok: false, erro: criada.falha }
  // 403 com "already in use": a instância já existe — segue.
  const jaExiste = !ok(criada.status) && /already|in use|exist/i.test(detalheDoErro(criada.json))
  if (!ok(criada.status) && !jaExiste) {
    return { ok: false, erro: criada.status === 401 ? traduzirErro(401, criada.json) : { mensagem: 'Não foi possível preparar a conexão do WhatsApp. Tente novamente.' } }
  }

  const webhook = await chamar(cfg, 'POST', `/webhook/set/${encodeURIComponent(instancia)}`, {
    webhook: {
      enabled: true,
      url: enderecoWebhook,
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
    },
  })
  if ('falha' in webhook) return { ok: false, erro: webhook.falha }
  if (!ok(webhook.status)) return { ok: false, erro: { mensagem: 'Não foi possível ligar o recebimento de mensagens. Tente novamente.' } }
  return { ok: true }
}

// QR code para escanear (imagem em data:image/png;base64,...), ou o aviso
// de que a sessão já está aberta.
export async function qrDaInstancia(cfg: ConfigEvolution, instancia: string): Promise<RespostaDoProvedor<{ qr: string | null; conectado: boolean }>> {
  const r = await chamar(cfg, 'GET', `/instance/connect/${encodeURIComponent(instancia)}`)
  if ('falha' in r) return { ok: false, erro: r.falha }
  if (!ok(r.status)) return { ok: false, erro: { mensagem: 'Não foi possível gerar o QR code. Tente novamente.' } }
  const j = r.json as { base64?: string; instance?: { state?: string } } | null
  const qr = typeof j?.base64 === 'string' && j.base64.startsWith('data:image/') ? j.base64 : null
  return { ok: true, qr, conectado: j?.instance?.state === 'open' }
}

export async function estadoDaInstancia(cfg: ConfigEvolution, instancia: string): Promise<RespostaDoProvedor<{ estado: EstadoDaInstancia }>> {
  const r = await chamar(cfg, 'GET', `/instance/connectionState/${encodeURIComponent(instancia)}`)
  if ('falha' in r) return { ok: false, erro: r.falha }
  if (r.status === 404) return { ok: true, estado: 'close' }
  if (!ok(r.status)) return { ok: false, erro: { mensagem: MSG_SEM_SERVIDOR } }
  const estado = (r.json as { instance?: { state?: string } } | null)?.instance?.state
  return { ok: true, estado: estado === 'open' || estado === 'connecting' ? estado : 'close' }
}

// Desconectar: sai do WhatsApp e apaga a instância. Falha aqui não impede a
// loja de desconectar no SAIP — a instância órfã não recebe mais nada.
export async function removerInstancia(cfg: ConfigEvolution, instancia: string): Promise<void> {
  await chamar(cfg, 'DELETE', `/instance/logout/${encodeURIComponent(instancia)}`)
  await chamar(cfg, 'DELETE', `/instance/delete/${encodeURIComponent(instancia)}`)
}

// ------------------------------------------------------------
// Mensagens
// ------------------------------------------------------------
export function criarProvedorEvolution(cfg: ConfigEvolution, instancia: string): ProvedorWhatsApp {
  const nome = encodeURIComponent(instancia)

  // A resposta de um envio é a própria mensagem, com a chave dela.
  function idDaResposta(r: Resposta): RespostaDoProvedor<{ id: string }> {
    if ('falha' in r) return { ok: false, erro: r.falha }
    const id = (r.json as { key?: { id?: string } } | null)?.key?.id
    if (ok(r.status) && id) return { ok: true, id }
    return { ok: false, erro: traduzirErro(r.status, r.json) }
  }

  return {
    async enviarTexto(para, texto) {
      return idDaResposta(await chamar(cfg, 'POST', `/message/sendText/${nome}`, { number: para, text: texto, linkPreview: true }))
    },

    async enviarMidia(para, tipo, arquivo: ArquivoParaEnvio, legenda) {
      const envio = idDaResposta(await chamar(cfg, 'POST', `/message/sendMedia/${nome}`, {
        number: para,
        mediatype: tipo,
        mimetype: arquivo.mime,
        media: Buffer.from(arquivo.bytes).toString('base64'),
        fileName: arquivo.nome,
        ...(legenda ? { caption: legenda } : {}),
      }))
      // Na Evolution o arquivo é buscado pela própria mensagem.
      return envio.ok ? { ok: true, id: envio.id, idMidia: envio.id } : envio
    },

    async baixarMidia(idMidia) {
      const r = await chamar(cfg, 'POST', `/chat/getBase64FromMediaMessage/${nome}`, { message: { key: { id: idMidia } }, convertToMp4: false })
      if ('falha' in r) return { ok: false, erro: r.falha }
      const j = r.json as { base64?: string; mimetype?: string } | null
      if (!ok(r.status) || !j?.base64) return { ok: false, erro: { mensagem: 'O arquivo não está mais disponível no WhatsApp.' } }
      const bytes = Buffer.from(j.base64, 'base64')
      return { ok: true, corpo: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, mime: j.mimetype || 'application/octet-stream' }
    },
  }
}
