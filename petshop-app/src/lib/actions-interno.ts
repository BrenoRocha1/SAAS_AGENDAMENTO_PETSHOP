'use server'

// Ações do painel interno da plataforma. Todas passam por exigirAdmin():
// só quem está em admin_usuario (ativo) consegue, e a escrita é feita com
// o client de service_role — por isso essa checagem nunca pode ser pulada.

import { revalidatePath } from 'next/cache'
import { getPlatformAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROTA_INTERNA } from '@/lib/rota-interna'

type Resultado = { error?: string; success?: boolean }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

async function exigirAdmin() {
  const admin = await getPlatformAdmin()
  if (!admin) return { erro: 'Sem permissão.' as const }
  const db = createAdminClient()
  if (!db) return { erro: 'Servidor sem a chave de serviço (SUPABASE_SERVICE_ROLE_KEY).' as const }
  return { admin, db }
}

function revalidarInterno() {
  revalidatePath(ROTA_INTERNA, 'layout')
}

export async function alterarStatusEmpresaAction(idLojista: string, ativo: boolean): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(idLojista)) return { error: 'Empresa inválida.' }
  const { error } = await ctx.db.from('lojista').update({ ativo }).eq('id_lojista', idLojista)
  if (error) return { error: error.message }
  revalidarInterno()
  return { success: true }
}

export async function alterarStatusClienteAction(idCliente: string, ativo: boolean): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(idCliente)) return { error: 'Cliente inválido.' }
  const { error } = await ctx.db.from('cliente').update({ ativo }).eq('id_cliente', idCliente)
  if (error) return { error: error.message }
  revalidarInterno()
  return { success: true }
}

export async function editarEmpresaAction(
  idLojista: string,
  dados: { nome_loja: string; telefone: string; cidade: string; estado: string },
): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(idLojista)) return { error: 'Empresa inválida.' }

  const nome = dados.nome_loja.trim()
  const telefone = dados.telefone.replace(/\D/g, '')
  const estado = dados.estado.trim().toUpperCase()
  if (nome.length < 2 || nome.length > 150) return { error: 'O nome da loja precisa ter de 2 a 150 caracteres.' }
  if (!/^\d{10,11}$/.test(telefone)) return { error: 'Telefone com DDD, 10 ou 11 números.' }
  if (estado && !/^[A-Z]{2}$/.test(estado)) return { error: 'Estado com 2 letras (ex.: SP).' }

  const { error } = await ctx.db
    .from('lojista')
    .update({ nome_loja: nome, telefone, cidade: dados.cidade.trim() || null, estado: estado || null })
    .eq('id_lojista', idLojista)
  if (error) return { error: error.message }
  revalidarInterno()
  return { success: true }
}

// Promove alguém que JÁ tem conta (cliente ou lojista) pelo e-mail.
export async function adicionarAdminAction(email: string, nome: string): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }

  const mail = email.trim().toLowerCase()
  if (!EMAIL_RE.test(mail)) return { error: 'E-mail inválido.' }

  const [{ data: lojista }, { data: cliente }] = await Promise.all([
    ctx.db.from('lojista').select('id_lojista, nome_loja').ilike('email', mail).maybeSingle(),
    ctx.db.from('cliente').select('id_cliente, nome').ilike('email', mail).maybeSingle(),
  ])
  const id: string | undefined = lojista?.id_lojista ?? cliente?.id_cliente
  if (!id) return { error: 'Não achei conta com esse e-mail. A pessoa precisa ter entrado no sistema antes.' }

  const nomeFinal = nome.trim() || lojista?.nome_loja || cliente?.nome || null
  const { error } = await ctx.db
    .from('admin_usuario')
    .upsert({ id, email: mail, nome: nomeFinal, ativo: true }, { onConflict: 'id' })
  if (error) return { error: error.message }
  revalidarInterno()
  return { success: true }
}

export async function alterarStatusAdminAction(idAdmin: string, ativo: boolean): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(idAdmin)) return { error: 'Admin inválido.' }
  if (idAdmin === ctx.admin.id) return { error: 'Você não pode desativar o próprio acesso.' }
  const { error } = await ctx.db.from('admin_usuario').update({ ativo }).eq('id', idAdmin)
  if (error) return { error: error.message }
  revalidarInterno()
  return { success: true }
}
