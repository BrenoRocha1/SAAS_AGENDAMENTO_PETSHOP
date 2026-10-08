'use server'

// Ações do painel interno da plataforma. Todas passam por exigirAdmin():
// só quem está em admin_usuario (ativo) consegue, e a escrita é feita com
// o client de service_role — por isso essa checagem nunca pode ser pulada.

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { COOKIE_IMPERSONANDO } from '@/lib/impersonar'
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

type Admin = NonNullable<Awaited<ReturnType<typeof getPlatformAdmin>>>
type Db = NonNullable<ReturnType<typeof createAdminClient>>

// Registro de quem fez o quê (migration 088). Falha em gravar não derruba a
// ação principal, mas fica no log do servidor.
async function auditar(db: Db, admin: Admin, acao: string, alvoTipo: string, alvoId: string, detalhes?: Record<string, unknown>) {
  const { error } = await db.from('admin_auditoria').insert({
    id_admin: admin.id, email_admin: admin.email, acao, alvo_tipo: alvoTipo, alvo_id: alvoId, detalhes: detalhes ?? null,
  })
  if (error) console.error('[interno] auditoria:', error.message)
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
  await auditar(ctx.db, ctx.admin, ativo ? 'empresa.reativar' : 'empresa.desativar', 'lojista', idLojista)
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

// ── Período de teste / acesso (migration 088) ─────────────────────────────

// Soma `dias` ao acesso: parte de hoje se já venceu, ou da data atual se
// ainda vale (assim "+30 dias" nunca encurta).
export async function estenderAcessoAction(idLojista: string, dias: number): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(idLojista)) return { error: 'Empresa inválida.' }
  if (!Number.isInteger(dias) || dias < 1 || dias > 3650) return { error: 'Dias inválidos.' }

  const { data, error: erroLer } = await ctx.db.from('lojista').select('acesso_ate').eq('id_lojista', idLojista).maybeSingle()
  if (erroLer || !data) return { error: erroLer?.message ?? 'Empresa não encontrada.' }
  const base = Math.max(Date.now(), new Date(data.acesso_ate).getTime())
  const novo = new Date(base + dias * 86_400_000).toISOString()

  const { error } = await ctx.db.from('lojista').update({ acesso_ate: novo }).eq('id_lojista', idLojista)
  if (error) return { error: error.message }
  await auditar(ctx.db, ctx.admin, 'acesso.estender', 'lojista', idLojista, { dias, acesso_ate: novo })
  revalidarInterno()
  return { success: true }
}

// Define a data exata em que o acesso termina (para dar mais tempo, ou
// para encurtar/bloquear: uma data no passado bloqueia na hora).
export async function definirAcessoAteAction(idLojista: string, quando: string): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(idLojista)) return { error: 'Empresa inválida.' }
  const data = new Date(quando)
  if (Number.isNaN(data.getTime())) return { error: 'Data inválida.' }
  if (data.getTime() > Date.now() + 5 * 365 * 86_400_000) return { error: 'Data longe demais (máx. 5 anos).' }

  const iso = data.toISOString()
  const { error } = await ctx.db.from('lojista').update({ acesso_ate: iso }).eq('id_lojista', idLojista)
  if (error) return { error: error.message }
  await auditar(ctx.db, ctx.admin, 'acesso.definir', 'lojista', idLojista, { acesso_ate: iso })
  revalidarInterno()
  return { success: true }
}

export async function definirAcessoLivreAction(idLojista: string, livre: boolean): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(idLojista)) return { error: 'Empresa inválida.' }
  const { error } = await ctx.db.from('lojista').update({ acesso_livre: livre }).eq('id_lojista', idLojista)
  if (error) return { error: error.message }
  await auditar(ctx.db, ctx.admin, livre ? 'acesso.livre' : 'acesso.cobrar', 'lojista', idLojista)
  revalidarInterno()
  return { success: true }
}

// ── Entrar na conta de um cliente / loja ──────────────────────────────────
// Gera um link de uso único pelo Supabase e já o troca por sessão aqui no
// servidor. A sessão do admin é SUBSTITUÍDA pela da pessoa (é assim que o
// Supabase funciona); para voltar, "Sair desta conta" e entrar de novo em
// /central-k7x2q9/entrar. Cada entrada fica gravada em admin_auditoria.
export async function entrarComoAction(tipo: 'lojista' | 'cliente', id: string): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(id) || (tipo !== 'lojista' && tipo !== 'cliente')) return { error: 'Conta inválida.' }

  // Nunca entrar na conta de outro administrador.
  const { data: ehAdmin } = await ctx.db.from('admin_usuario').select('id').eq('id', id).maybeSingle()
  if (ehAdmin) return { error: 'Não é possível entrar na conta de um administrador.' }

  const { data: usuario, error: erroUsuario } = await ctx.db.auth.admin.getUserById(id)
  const email = usuario?.user?.email
  if (erroUsuario || !email) return { error: 'Não achei o login dessa conta.' }

  const { data: link, error: erroLink } = await ctx.db.auth.admin.generateLink({ type: 'magiclink', email })
  const hash = link?.properties?.hashed_token
  if (erroLink || !hash) return { error: erroLink?.message ?? 'Não foi possível gerar o acesso.' }

  await auditar(ctx.db, ctx.admin, 'conta.entrar', tipo, id, { email })

  const supabase = await createClient()
  const { error: erroSessao } = await supabase.auth.verifyOtp({ token_hash: hash, type: 'magiclink' })
  if (erroSessao) return { error: erroSessao.message }

  const nome = tipo === 'lojista'
    ? (await ctx.db.from('lojista').select('nome_loja').eq('id_lojista', id).maybeSingle()).data?.nome_loja
    : (await ctx.db.from('cliente').select('nome').eq('id_cliente', id).maybeSingle()).data?.nome

  ;(await cookies()).set(COOKIE_IMPERSONANDO, encodeURIComponent(nome ?? email), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8,
  })
  revalidatePath('/', 'layout')
  // Cai direto no perfil pessoal da pessoa, para a equipe resolver o que ela precisar.
  redirect(tipo === 'lojista' ? '/lojista/perfil' : '/cliente/perfil')
}

// Sai da conta vista e volta para a tela de entrada do painel interno.
export async function sairDaContaAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  ;(await cookies()).delete(COOKIE_IMPERSONANDO)
  revalidatePath('/', 'layout')
  redirect(`${ROTA_INTERNA}/entrar`)
}

// ── Trocar o e-mail de uma conta ──────────────────────────────────────────
// Troca no login (Supabase Auth) e no cadastro (lojista/cliente). Se o
// segundo passo falhar, o primeiro é desfeito. Quem entra com Google segue
// entrando normalmente (o Google é reconhecido pela identidade, não pelo
// e-mail); o e-mail novo vale para avisos e para o link de "entrar na conta".
export async function trocarEmailAction(tipo: 'lojista' | 'cliente', id: string, novoEmail: string): Promise<Resultado> {
  const ctx = await exigirAdmin()
  if ('erro' in ctx) return { error: ctx.erro }
  if (!UUID_RE.test(id) || (tipo !== 'lojista' && tipo !== 'cliente')) return { error: 'Conta inválida.' }
  const email = novoEmail.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { error: 'E-mail inválido.' }

  const { data: ehAdmin } = await ctx.db.from('admin_usuario').select('id').eq('id', id).maybeSingle()
  if (ehAdmin) return { error: 'Não é possível trocar o e-mail de um administrador por aqui.' }

  const { data: atual } = await ctx.db.auth.admin.getUserById(id)
  const emailAntigo = atual?.user?.email
  if (!emailAntigo) return { error: 'Não achei o login dessa conta.' }
  if (emailAntigo.toLowerCase() === email) return { error: 'Esse já é o e-mail da conta.' }

  const { error: erroAuth } = await ctx.db.auth.admin.updateUserById(id, { email, email_confirm: true })
  if (erroAuth) return { error: erroAuth.message }

  const tabela = tipo === 'lojista' ? 'lojista' : 'cliente'
  const coluna = tipo === 'lojista' ? 'id_lojista' : 'id_cliente'
  const { error: erroTabela } = await ctx.db.from(tabela).update({ email }).eq(coluna, id)
  if (erroTabela) {
    await ctx.db.auth.admin.updateUserById(id, { email: emailAntigo, email_confirm: true })
    return { error: erroTabela.message }
  }

  await auditar(ctx.db, ctx.admin, 'conta.trocar_email', tipo, id, { de: emailAntigo, para: email })
  revalidarInterno()
  return { success: true }
}
