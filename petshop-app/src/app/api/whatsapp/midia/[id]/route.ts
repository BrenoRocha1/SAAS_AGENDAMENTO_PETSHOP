import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { provedorDaLoja } from '@/lib/whatsapp/servico'
import type { Midia } from '@/lib/whatsapp/tipos'

// Arquivo de uma mensagem (imagem, áudio, documento). O arquivo fica na
// Meta e só é baixado com o token da loja — então é o servidor que busca e
// repassa. Quem pede precisa estar logado e enxergar a mensagem: a
// consulta abaixo roda com a sessão da pessoa, e a regra do banco só
// devolve mensagem da loja dela.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ABRE_NA_TELA = /^(image\/(jpeg|png|webp|gif)|audio\/[\w.+-]+|video\/(mp4|3gpp)|application\/pdf)$/

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return new Response('Arquivo não encontrado', { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Não autenticado', { status: 401 })

  const { data: mensagem } = await supabase
    .from('whatsapp_mensagem')
    .select('id_lojista, midia')
    .eq('id_mensagem', id)
    .maybeSingle()
  const midia = mensagem?.midia as Midia | null | undefined
  if (!mensagem || !midia?.id) return new Response('Arquivo não encontrado', { status: 404 })

  const admin = createAdminClient()
  if (!admin) return new Response('Serviço indisponível', { status: 503 })
  const loja = await provedorDaLoja(admin, mensagem.id_lojista)
  if ('erro' in loja) return new Response(loja.erro, { status: 409 })

  const arquivo = await loja.provedor.baixarMidia(midia.id)
  if (!arquivo.ok) return new Response(arquivo.erro.mensagem, { status: 502 })

  // Quem mandou o arquivo foi alguém de fora: só abre na tela o que é
  // imagem, áudio, vídeo ou PDF. O resto (um HTML, um SVG) vai como
  // download, sem o navegador interpretar nada dentro do site.
  const mime = arquivo.mime.split(';')[0].trim().toLowerCase()
  const abreNaTela = ABRE_NA_TELA.test(mime)
  const nome = (midia.nome || 'arquivo').replace(/[^\w.\- ]+/g, '_')
  return new Response(arquivo.corpo, {
    status: 200,
    headers: {
      'Content-Type': abreNaTela ? mime : 'application/octet-stream',
      'Content-Disposition': `${abreNaTela ? 'inline' : 'attachment'}; filename="${nome}"`,
      // Só no navegador de quem pediu, por alguns minutos.
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
