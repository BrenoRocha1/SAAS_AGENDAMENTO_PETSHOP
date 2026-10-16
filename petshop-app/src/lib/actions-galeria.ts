'use server'

// Galeria de fotos de referência do serviço (migration 101). Quem pode:
// quem gerencia serviços (dono ou equipe com a permissão). A loja vem
// sempre do contexto do servidor; o serviço/foto é conferido contra ela
// com o client normal (que passa pela RLS) antes de qualquer escrita —
// o client admin usado pela equipe ignora a RLS, então é essa checagem
// que isola uma loja da outra (mesmo padrão de atualizarFotoProdutoAction).

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterContextoLojista, type ContextoLojista } from '@/lib/lojista-context'
import { COLUNAS_FOTO_SERVICO, GALERIA_MAX_BYTES, GALERIA_MAX_FOTOS, problemaDaFoto, type FotoServico } from '@/lib/galeria'

const BUCKET = 'fotos-servico'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MSG_MIGRATION = 'Execute a migration 101_galeria_servico.sql para usar a galeria de fotos.'

type Supabase = Awaited<ReturnType<typeof createClient>>
type Resultado<T = object> = ({ error: string } | ({ success: true } & T))

function devError(amigavel: string, tecnico?: string | null) {
  return process.env.NODE_ENV !== 'production' && tecnico ? `${amigavel} [DEV: ${tecnico}]` : amigavel
}

function faltaMigration(msg?: string | null) {
  return !!msg && /servico_foto|fotos-servico|Bucket not found|42P01/i.test(msg)
}

// Conteúdo real do arquivo (magic numbers), não o nome nem o tipo declarado.
function extensaoDaImagem(bytes: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'webp'
  return null
}

async function lerImagem(arquivo: FormDataEntryValue | null): Promise<{ bytes: Uint8Array; ext: 'jpg' | 'png' | 'webp' } | { erro: string } | null> {
  if (!arquivo || typeof arquivo === 'string' || arquivo.size === 0) return null
  if (arquivo.size > GALERIA_MAX_BYTES) return { erro: 'Imagem muito grande. O limite é 5 MB.' }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const ext = extensaoDaImagem(bytes)
  if (!ext) return { erro: 'Formato de imagem inválido. Envie um arquivo JPG, PNG ou WEBP.' }
  return { bytes, ext }
}

const tipoDaExtensao = (ext: string) => (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`)

// Quem está logado, a loja dele e o client para gravar.
async function contextoDaGaleria(): Promise<{ supabase: Supabase; contexto: ContextoLojista; db: Supabase } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto) return { error: 'Acesso não autorizado' }
  if (!contexto.podeGerenciarServicos) return { error: 'Você não tem permissão para gerenciar serviços.' }
  const db = contexto.role === 'lojista' ? supabase : createAdminClient()
  if (!db) return { error: 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.' }
  return { supabase, contexto, db: db as Supabase }
}

function revalidar() {
  revalidatePath('/lojista/servicos')
  revalidatePath('/agendamento/[id]', 'page')
  revalidatePath('/[slug]', 'page')
}

// ── Adicionar ───────────────────────────────────────────────
// formData: foto (obrigatória), mini (opcional — sem ela, a própria foto
// faz de miniatura, como no app), nome, descricao.
export async function adicionarFotoServicoAction(idServico: string, formData: FormData): Promise<Resultado<{ foto: FotoServico }>> {
  if (!UUID_RE.test(idServico)) return { error: 'Serviço inválido.' }
  const ctx = await contextoDaGaleria()
  if ('error' in ctx) return ctx
  const { supabase, contexto, db } = ctx

  const nome = String(formData.get('nome') ?? '').trim()
  const descricao = String(formData.get('descricao') ?? '').trim()
  const problema = problemaDaFoto(nome, descricao)
  if (problema) return { error: problema }

  // O serviço precisa ser da própria loja (client normal → RLS).
  const { data: servico } = await supabase.from('servico').select('id_servico')
    .eq('id_servico', idServico).eq('id_lojista', contexto.idLojista).is('excluido_em', null).maybeSingle()
  if (!servico) return { error: 'Serviço não encontrado.' }

  const { data: atuais, error: erroLer } = await db.from('servico_foto').select('ordem').eq('id_servico', idServico)
  if (erroLer) return { error: faltaMigration(erroLer.message) ? MSG_MIGRATION : devError('Não foi possível ler a galeria.', erroLer.message) }
  if ((atuais ?? []).length >= GALERIA_MAX_FOTOS) return { error: `Cada serviço pode ter no máximo ${GALERIA_MAX_FOTOS} fotos.` }

  const grande = await lerImagem(formData.get('foto'))
  if (!grande) return { error: 'Selecione uma imagem.' }
  if ('erro' in grande) return { error: grande.erro }
  const mini = (await lerImagem(formData.get('mini'))) ?? grande
  if ('erro' in mini) return { error: mini.erro }

  const idFoto = randomUUID()
  const pasta = `${contexto.idLojista}/${idServico}`
  const caminho = `${pasta}/${idFoto}.${grande.ext}`
  const caminhoMini = mini === grande ? caminho : `${pasta}/${idFoto}-mini.${mini.ext}`

  const envio = await db.storage.from(BUCKET).upload(caminho, grande.bytes, { contentType: tipoDaExtensao(grande.ext) })
  if (envio.error) return { error: faltaMigration(envio.error.message) ? MSG_MIGRATION : devError('Não foi possível enviar a imagem. Tente novamente.', envio.error.message) }
  if (caminhoMini !== caminho) {
    const envioMini = await db.storage.from(BUCKET).upload(caminhoMini, mini.bytes, { contentType: tipoDaExtensao(mini.ext) })
    if (envioMini.error) {
      await db.storage.from(BUCKET).remove([caminho])
      return { error: devError('Não foi possível enviar a imagem. Tente novamente.', envioMini.error.message) }
    }
  }

  const url = db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
  const urlMini = db.storage.from(BUCKET).getPublicUrl(caminhoMini).data.publicUrl
  const ordem = Math.max(-1, ...(atuais ?? []).map(f => Number(f.ordem))) + 1

  const { data: foto, error } = await db.from('servico_foto').insert({
    id_foto: idFoto,
    id_servico: idServico,
    id_lojista: contexto.idLojista,
    nome,
    descricao: descricao || null,
    caminho,
    caminho_mini: caminhoMini,
    url,
    url_mini: urlMini,
    ordem,
  }).select(COLUNAS_FOTO_SERVICO).single()

  if (error || !foto) {
    // Sem o registro, o arquivo não serve para nada: sai do Storage.
    await db.storage.from(BUCKET).remove([...new Set([caminho, caminhoMini])])
    const m = error?.message ?? ''
    if (/no máximo 12/.test(m)) return { error: `Cada serviço pode ter no máximo ${GALERIA_MAX_FOTOS} fotos.` }
    return { error: faltaMigration(m) ? MSG_MIGRATION : devError('Não foi possível salvar a foto. Tente novamente.', m) }
  }

  revalidar()
  return { success: true, foto: foto as FotoServico }
}

// ── Editar nome e descrição ─────────────────────────────────
export async function editarFotoServicoAction(idFoto: string, dados: { nome: string; descricao: string }): Promise<Resultado<{ foto: FotoServico }>> {
  if (!UUID_RE.test(idFoto)) return { error: 'Foto inválida.' }
  const nome = String(dados?.nome ?? '').trim()
  const descricao = String(dados?.descricao ?? '').trim()
  const problema = problemaDaFoto(nome, descricao)
  if (problema) return { error: problema }

  const ctx = await contextoDaGaleria()
  if ('error' in ctx) return ctx
  const { db, contexto } = ctx

  const { data: foto, error } = await db.from('servico_foto')
    .update({ nome, descricao: descricao || null })
    .eq('id_foto', idFoto).eq('id_lojista', contexto.idLojista)
    .select(COLUNAS_FOTO_SERVICO).maybeSingle()
  if (error) return { error: faltaMigration(error.message) ? MSG_MIGRATION : devError('Não foi possível salvar.', error.message) }
  if (!foto) return { error: 'Foto não encontrada.' }

  revalidar()
  return { success: true, foto: foto as FotoServico }
}

// ── Reordenar ───────────────────────────────────────────────
// ids: todas as fotos do serviço, na ordem nova.
export async function reordenarFotosServicoAction(idServico: string, ids: string[]): Promise<Resultado> {
  if (!UUID_RE.test(idServico) || !Array.isArray(ids) || ids.length > GALERIA_MAX_FOTOS || !ids.every(i => typeof i === 'string' && UUID_RE.test(i))) {
    return { error: 'Ordem inválida.' }
  }
  const ctx = await contextoDaGaleria()
  if ('error' in ctx) return ctx
  const { supabase, db, contexto } = ctx

  // O serviço precisa ser da própria loja (client normal → RLS).
  const { data: servico } = await supabase.from('servico').select('id_servico')
    .eq('id_servico', idServico).eq('id_lojista', contexto.idLojista).maybeSingle()
  if (!servico) return { error: 'Serviço não encontrado.' }

  const { data: atuais, error } = await db.from('servico_foto').select('id_foto')
    .eq('id_servico', idServico).eq('id_lojista', contexto.idLojista)
  if (error) return { error: faltaMigration(error.message) ? MSG_MIGRATION : devError('Não foi possível ler a galeria.', error.message) }
  const doServico = new Set((atuais ?? []).map(f => f.id_foto as string))
  if (doServico.size !== ids.length || !ids.every(i => doServico.has(i))) {
    return { error: 'A galeria mudou enquanto você reordenava. Atualize a página e tente de novo.' }
  }

  for (const [i, id] of ids.entries()) {
    const { error: erroOrdem } = await db.from('servico_foto').update({ ordem: i })
      .eq('id_foto', id).eq('id_lojista', contexto.idLojista)
    if (erroOrdem) return { error: devError('Não foi possível salvar a ordem.', erroOrdem.message) }
  }

  revalidar()
  return { success: true }
}

// ── Remover ─────────────────────────────────────────────────
export async function removerFotoServicoAction(idFoto: string): Promise<Resultado> {
  if (!UUID_RE.test(idFoto)) return { error: 'Foto inválida.' }
  const ctx = await contextoDaGaleria()
  if ('error' in ctx) return ctx
  const { db, contexto } = ctx

  const { data: foto, error } = await db.from('servico_foto')
    .delete()
    .eq('id_foto', idFoto).eq('id_lojista', contexto.idLojista)
    .select('caminho, caminho_mini').maybeSingle()
  if (error) return { error: faltaMigration(error.message) ? MSG_MIGRATION : devError('Não foi possível remover a foto.', error.message) }
  if (!foto) return { error: 'Foto não encontrada.' }

  // Os arquivos são só desta foto (nome = id da foto): saem do Storage.
  await db.storage.from(BUCKET).remove([...new Set([foto.caminho as string, foto.caminho_mini as string])])

  revalidar()
  return { success: true }
}
