// Provedor de WhatsApp: a WhatsApp Business Platform (Cloud API oficial da
// Meta). Só o servidor importa este arquivo — é aqui que o token é usado.
// A tela e as actions conversam com a interface `ProvedorWhatsApp`; trocar
// ou acrescentar outro provedor é escrever outra implementação dela.

export interface CredenciaisWhatsApp {
  phoneNumberId: string
  accessToken: string
}

export interface ErroDoProvedor {
  // Frase para quem está atendendo.
  mensagem: string
  // Código da Meta, quando houver (190 = token inválido, 131047 = fora da
  // janela de 24 horas...).
  codigo?: number
  // O token deixou de valer: a integração precisa ser refeita.
  tokenInvalido?: boolean
}

export type RespostaDoProvedor<T> = ({ ok: true } & T) | { ok: false; erro: ErroDoProvedor }

export interface ArquivoParaEnvio {
  bytes: Uint8Array
  mime: string
  nome: string
}

export interface ProvedorWhatsApp {
  // Confere se o token e o número valem, e devolve como o número aparece.
  consultarNumero(): Promise<RespostaDoProvedor<{ numero: string | null; nome: string | null }>>
  enviarTexto(para: string, texto: string): Promise<RespostaDoProvedor<{ id: string }>>
  // Sobe o arquivo para a Meta; o id devolvido vai em enviarMidia.
  subirMidia(arquivo: ArquivoParaEnvio): Promise<RespostaDoProvedor<{ id: string }>>
  enviarMidia(para: string, tipo: 'image' | 'document', idMidia: string, opcoes?: { legenda?: string; nome?: string }): Promise<RespostaDoProvedor<{ id: string }>>
  // O arquivo de uma mensagem (recebida ou enviada), pelo id da Meta.
  baixarMidia(idMidia: string): Promise<RespostaDoProvedor<{ corpo: ArrayBuffer; mime: string }>>
}

const VERSAO_GRAPH = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'
const BASE = `https://graph.facebook.com/${VERSAO_GRAPH}`
const TEMPO_LIMITE_MS = 20_000

interface ErroGraph {
  error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string }; error_user_msg?: string }
}

// Os erros mais comuns da Meta, em português de quem atende.
function traduzirErro(status: number, corpo: ErroGraph | null): ErroDoProvedor {
  const e = corpo?.error
  const codigo = e?.code
  if (codigo === 190 || status === 401) {
    return { mensagem: 'O acesso ao WhatsApp venceu ou foi revogado. Conecte o número de novo em Configurações → WhatsApp.', codigo, tokenInvalido: true }
  }
  if (codigo === 131047) {
    return { mensagem: 'Passaram mais de 24 horas desde a última mensagem do cliente. A Meta só aceita mensagem livre dentro desse prazo.', codigo }
  }
  if (codigo === 131026) {
    return { mensagem: 'Este número não pode receber a mensagem (não tem WhatsApp ou não aceita mensagens de empresas).', codigo }
  }
  if (codigo === 131030) {
    return { mensagem: 'O número do cliente não está na lista de teste do app da Meta. Em modo de teste, só os números cadastrados lá recebem mensagens.', codigo }
  }
  if (codigo === 130429 || codigo === 131048 || codigo === 131056 || status === 429) {
    return { mensagem: 'A Meta limitou o envio por enquanto (muitas mensagens em pouco tempo). Tente de novo em alguns minutos.', codigo }
  }
  if (codigo === 100) {
    return { mensagem: `A Meta recusou o pedido: ${e?.error_data?.details || e?.message || 'dados inválidos'}.`, codigo }
  }
  if (codigo === 10 || codigo === 200) {
    return { mensagem: 'O token não tem permissão para este número. Confira as permissões do app na Meta (whatsapp_business_messaging).', codigo }
  }
  const detalhe = e?.error_user_msg || e?.error_data?.details || e?.message
  return { mensagem: detalhe ? `A Meta recusou o envio: ${detalhe}` : 'Não foi possível falar com o WhatsApp agora. Tente novamente.', codigo }
}

async function chamar(url: string, init: RequestInit): Promise<{ status: number; json: unknown } | { falha: ErroDoProvedor }> {
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)
  try {
    const resposta = await fetch(url, { ...init, signal: controle.signal, cache: 'no-store' })
    const json: unknown = await resposta.json().catch(() => null)
    return { status: resposta.status, json }
  } catch {
    return { falha: { mensagem: 'Não foi possível falar com o WhatsApp agora. Confira a conexão e tente novamente.' } }
  } finally {
    clearTimeout(relogio)
  }
}

export function criarProvedorCloudApi(cred: CredenciaisWhatsApp): ProvedorWhatsApp {
  const autorizacao = { Authorization: `Bearer ${cred.accessToken}` }
  const numero = encodeURIComponent(cred.phoneNumberId)

  async function enviar(corpo: Record<string, unknown>): Promise<RespostaDoProvedor<{ id: string }>> {
    const r = await chamar(`${BASE}/${numero}/messages`, {
      method: 'POST',
      headers: { ...autorizacao, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...corpo }),
    })
    if ('falha' in r) return { ok: false, erro: r.falha }
    const id = (r.json as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, id }
    return { ok: false, erro: traduzirErro(r.status, r.json as ErroGraph | null) }
  }

  return {
    async consultarNumero() {
      const r = await chamar(`${BASE}/${numero}?fields=display_phone_number,verified_name`, { headers: autorizacao })
      if ('falha' in r) return { ok: false, erro: r.falha }
      if (r.status >= 200 && r.status < 300) {
        const j = r.json as { display_phone_number?: string; verified_name?: string } | null
        return { ok: true, numero: j?.display_phone_number ?? null, nome: j?.verified_name ?? null }
      }
      return { ok: false, erro: traduzirErro(r.status, r.json as ErroGraph | null) }
    },

    enviarTexto(para, texto) {
      return enviar({ to: para, type: 'text', text: { preview_url: true, body: texto } })
    },

    async subirMidia(arquivo) {
      const form = new FormData()
      form.set('messaging_product', 'whatsapp')
      form.set('type', arquivo.mime)
      form.set('file', new Blob([arquivo.bytes as BlobPart], { type: arquivo.mime }), arquivo.nome)
      const r = await chamar(`${BASE}/${numero}/media`, { method: 'POST', headers: autorizacao, body: form })
      if ('falha' in r) return { ok: false, erro: r.falha }
      const id = (r.json as { id?: string } | null)?.id
      if (r.status >= 200 && r.status < 300 && id) return { ok: true, id }
      return { ok: false, erro: traduzirErro(r.status, r.json as ErroGraph | null) }
    },

    enviarMidia(para, tipo, idMidia, opcoes) {
      const conteudo: Record<string, unknown> = { id: idMidia }
      if (opcoes?.legenda) conteudo.caption = opcoes.legenda
      if (tipo === 'document' && opcoes?.nome) conteudo.filename = opcoes.nome
      return enviar({ to: para, type: tipo, [tipo]: conteudo })
    },

    async baixarMidia(idMidia) {
      // Primeiro o endereço (vale poucos minutos), depois o arquivo — os
      // dois pedem o token.
      const r = await chamar(`${BASE}/${encodeURIComponent(idMidia)}`, { headers: autorizacao })
      if ('falha' in r) return { ok: false, erro: r.falha }
      const info = r.json as { url?: string; mime_type?: string } | null
      if (!(r.status >= 200 && r.status < 300) || !info?.url) {
        return { ok: false, erro: traduzirErro(r.status, r.json as ErroGraph | null) }
      }
      try {
        const arquivo = await fetch(info.url, { headers: autorizacao, cache: 'no-store' })
        if (!arquivo.ok) return { ok: false, erro: { mensagem: 'O arquivo não está mais disponível no WhatsApp.' } }
        return { ok: true, corpo: await arquivo.arrayBuffer(), mime: info.mime_type || arquivo.headers.get('content-type') || 'application/octet-stream' }
      } catch {
        return { ok: false, erro: { mensagem: 'Não foi possível baixar o arquivo agora.' } }
      }
    },
  }
}
