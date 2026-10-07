import type { Arquivo } from '@/lib/acoes'
import { mensagemDoBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

// Foto da conta do cliente (migration 085) — o mesmo caminho do site
// (atualizarFotoClienteAction): o arquivo "perfil" na pasta do cliente, no
// bucket das fotos de pet, e o endereço em cliente.foto_url. O app grava
// direto no Supabase: as regras do bucket e da tabela já só deixam o cliente
// mexer no que é dele, e o bucket confere o tipo e o limite de 5 MB.
const BUCKET = 'fotos-pet'
const ARQUIVO = 'perfil'
const TAMANHO_MAXIMO = 5 * 1024 * 1024

function bytesDoBase64(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

// O tipo de verdade, pelos primeiros bytes — como o site confere.
function extensaoDaImagem(b: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

async function limparFoto(idCliente: string) {
  const { data: existentes } = await supabase.storage.from(BUCKET).list(idCliente)
  const doPerfil = existentes?.filter(f => f.name.startsWith(`${ARQUIVO}.`)) ?? []
  if (doPerfil.length > 0) await supabase.storage.from(BUCKET).remove(doPerfil.map(f => `${idCliente}/${f.name}`))
}

export async function buscarFotoCliente(idCliente: string): Promise<string | null> {
  const { data } = await supabase.from('cliente').select('foto_url').eq('id_cliente', idCliente).maybeSingle()
  return (data as { foto_url: string | null } | null)?.foto_url ?? null
}

export async function enviarFotoCliente(idCliente: string, arq: Arquivo): Promise<{ error?: string; url?: string }> {
  let bytes: Uint8Array
  try {
    bytes = bytesDoBase64(arq.$arquivo.base64)
  } catch {
    return { error: 'Não foi possível ler a imagem escolhida.' }
  }
  if (bytes.length > TAMANHO_MAXIMO) return { error: 'Imagem muito grande. O limite é 5 MB.' }
  const extensao = extensaoDaImagem(bytes)
  if (!extensao) return { error: 'Formato de imagem inválido. Envie um arquivo JPG, PNG ou WEBP.' }

  await limparFoto(idCliente)

  const caminho = `${idCliente}/${ARQUIVO}.${extensao}`
  const { error: erroEnvio } = await supabase.storage.from(BUCKET).upload(caminho, bytes.buffer as ArrayBuffer, {
    contentType: extensao === 'jpg' ? 'image/jpeg' : `image/${extensao}`,
    upsert: true,
  })
  if (erroEnvio) return { error: 'Não foi possível enviar a imagem. Tente novamente.' }

  const url = `${supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`
  const { data, error } = await supabase.from('cliente').update({ foto_url: url }).eq('id_cliente', idCliente).select('id_cliente')
  if (error || !data || data.length === 0) {
    return { error: error ? mensagemDoBanco(error, 'Imagem enviada, mas não foi possível salvar. Tente novamente.') : 'Não foi possível salvar a foto.' }
  }
  return { url }
}

export async function removerFotoCliente(idCliente: string): Promise<{ error?: string }> {
  await limparFoto(idCliente)
  const { data, error } = await supabase.from('cliente').update({ foto_url: null }).eq('id_cliente', idCliente).select('id_cliente')
  if (error || !data || data.length === 0) {
    return { error: error ? mensagemDoBanco(error, 'Não foi possível remover a imagem. Tente novamente.') : 'Não foi possível remover a foto.' }
  }
  return {}
}
