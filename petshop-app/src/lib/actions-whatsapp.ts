'use server'

// Server Actions da central de WhatsApp (migration 088). Enviar passa
// sempre por aqui: é o servidor que fala com a Meta, com o token da loja.
// Quem chama precisa enxergar a conversa — a consulta roda com a sessão da
// pessoa, e a regra do banco só devolve conversa da loja dela.

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterContextoLojista, type ContextoLojista } from '@/lib/lojista-context'
import { criarProvedorCloudApi } from '@/lib/whatsapp/provedor'
import { MSG_NAO_CONECTADO, provedorDaLoja, registrarErroDoProvedor } from '@/lib/whatsapp/servico'
import { COLUNAS_MENSAGEM, janelaAberta, type Mensagem } from '@/lib/whatsapp/tipos'

type Resultado<T = object> = ({ error: string } | ({ error?: undefined } & T))

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MSG_SERVICO = 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.'
const MSG_MIGRATION = 'Execute a migration 088_whatsapp.sql para usar o WhatsApp.'
const MSG_JANELA = 'Passaram mais de 24 horas desde a última mensagem do cliente. A Meta só aceita mensagem livre dentro desse prazo — quando ele escrever de novo, você volta a poder responder.'
const TEXTO_MAXIMO = 4096
const ANEXO_MAXIMO = 10 * 1024 * 1024 // 10 MB
// O que a Cloud API aceita como imagem e como documento, e o SAIP envia.
const TIPOS_ANEXO: Record<string, 'image' | 'document'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'application/pdf': 'document',
}

function faltaMigration(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? ''))
}

type Supabase = Awaited<ReturnType<typeof createClient>>

async function contextoDoWhatsApp(): Promise<{ error: string } | { supabase: Supabase; user: { id: string }; contexto: ContextoLojista }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  if (!contexto || !contexto.podeAtenderWhatsapp) return { error: 'Você não tem permissão para atender o WhatsApp.' }
  return { supabase, user, contexto }
}

function ehGestor(contexto: ContextoLojista) {
  return contexto.role === 'lojista' || contexto.acessoTotal
}

// Nome de quem está atendendo, para assinar a mensagem.
async function nomeDeQuemAtende(supabase: Supabase): Promise<string | null> {
  const { data } = await supabase.rpc('fn_whatsapp_meu_nome')
  return typeof data === 'string' ? data : null
}

// A conversa, se a pessoa pode atender nela.
type ConversaParaEnvio = { id_conversa: string; id_lojista: string; telefone: string; ultima_entrada_em: string | null }

async function conversaParaEnvio(supabase: Supabase, idConversa: string): Promise<{ error: string } | { conversa: ConversaParaEnvio }> {
  if (!UUID_RE.test(idConversa)) return { error: 'Conversa inválida.' }
  const { data, error } = await supabase
    .from('whatsapp_conversa')
    .select('id_conversa, id_lojista, telefone, ultima_entrada_em')
    .eq('id_conversa', idConversa)
    .maybeSingle()
  if (error) return { error: faltaMigration(error) ? MSG_MIGRATION : 'Não foi possível abrir a conversa.' }
  if (!data) return { error: 'Conversa não encontrada.' }
  if (!janelaAberta(data.ultima_entrada_em)) return { error: MSG_JANELA }
  return { conversa: data as ConversaParaEnvio }
}

// ------------------------------------------------------------
// Enviar texto
// ------------------------------------------------------------
export async function enviarMensagemWhatsAppAction(idConversa: string, texto: string): Promise<Resultado<{ mensagem: Mensagem }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  const corpo = (texto ?? '').trim()
  if (!corpo) return { error: 'Escreva uma mensagem.' }
  if (corpo.length > TEXTO_MAXIMO) return { error: `A mensagem passa do limite do WhatsApp (${TEXTO_MAXIMO} caracteres).` }

  const alvo = await conversaParaEnvio(ctx.supabase, idConversa)
  if ('error' in alvo) return { error: alvo.error }
  const { conversa } = alvo

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }
  const loja = await provedorDaLoja(admin, conversa.id_lojista)
  if ('erro' in loja) return { error: loja.erro }

  // Grava primeiro como "enviando": se a chamada à Meta falhar, a mensagem
  // fica na conversa marcada com erro, e dá para tentar de novo.
  const { data: nova, error: erroGravar } = await admin
    .from('whatsapp_mensagem')
    .insert({
      id_conversa: conversa.id_conversa,
      id_lojista: conversa.id_lojista,
      direcao: 'saida',
      tipo: 'texto',
      texto: corpo,
      status: 'enviando',
      id_autor: ctx.user.id,
      nome_autor: await nomeDeQuemAtende(ctx.supabase),
    })
    .select(COLUNAS_MENSAGEM)
    .single()
  if (erroGravar || !nova) return { error: 'Não foi possível registrar a mensagem. Tente novamente.' }

  const envio = await loja.provedor.enviarTexto(conversa.telefone, corpo)
  const mudanca = envio.ok
    ? { status: 'enviada', provider_message_id: envio.id, erro: null }
    : { status: 'erro', erro: envio.erro.mensagem }
  if (!envio.ok) await registrarErroDoProvedor(admin, conversa.id_lojista, envio.erro)

  const { data: final } = await admin
    .from('whatsapp_mensagem')
    .update(mudanca)
    .eq('id_mensagem', (nova as unknown as Mensagem).id_mensagem)
    .select(COLUNAS_MENSAGEM)
    .single()

  return { mensagem: (final ?? { ...(nova as unknown as Mensagem), ...mudanca }) as unknown as Mensagem }
}

// ------------------------------------------------------------
// Tentar de novo uma mensagem de texto que deu erro
// ------------------------------------------------------------
export async function reenviarMensagemWhatsAppAction(idMensagem: string): Promise<Resultado<{ mensagem: Mensagem }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!UUID_RE.test(idMensagem)) return { error: 'Mensagem inválida.' }

  const { data: original } = await ctx.supabase
    .from('whatsapp_mensagem')
    .select('id_mensagem, id_conversa, direcao, tipo, texto, status')
    .eq('id_mensagem', idMensagem)
    .maybeSingle()
  if (!original || original.direcao !== 'saida' || original.status !== 'erro') return { error: 'Essa mensagem não pode ser reenviada.' }
  if (original.tipo !== 'texto' || !original.texto) return { error: 'Para reenviar um arquivo, anexe-o de novo.' }

  const alvo = await conversaParaEnvio(ctx.supabase, original.id_conversa)
  if ('error' in alvo) return { error: alvo.error }
  const { conversa } = alvo

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }
  const loja = await provedorDaLoja(admin, conversa.id_lojista)
  if ('erro' in loja) return { error: loja.erro }

  await admin.from('whatsapp_mensagem').update({ status: 'enviando', erro: null }).eq('id_mensagem', idMensagem).eq('status', 'erro')

  const envio = await loja.provedor.enviarTexto(conversa.telefone, original.texto)
  const mudanca = envio.ok
    ? { status: 'enviada', provider_message_id: envio.id, erro: null, enviada_em: new Date().toISOString() }
    : { status: 'erro', erro: envio.erro.mensagem }
  if (!envio.ok) await registrarErroDoProvedor(admin, conversa.id_lojista, envio.erro)

  const { data: final, error } = await admin
    .from('whatsapp_mensagem')
    .update(mudanca)
    .eq('id_mensagem', idMensagem)
    .select(COLUNAS_MENSAGEM)
    .single()
  if (error || !final) return { error: 'Não foi possível atualizar a mensagem.' }
  return { mensagem: final as unknown as Mensagem }
}

// ------------------------------------------------------------
// Enviar imagem (JPG, PNG) ou PDF, com legenda opcional
// ------------------------------------------------------------
export async function enviarAnexoWhatsAppAction(idConversa: string, formData: FormData): Promise<Resultado<{ mensagem: Mensagem }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }

  const arquivo = formData.get('arquivo') as File | null
  const legenda = ((formData.get('legenda') as string | null) ?? '').trim().slice(0, 1024)
  if (!arquivo || arquivo.size === 0) return { error: 'Escolha um arquivo.' }
  if (arquivo.size > ANEXO_MAXIMO) return { error: 'Arquivo muito grande. O limite é 10 MB.' }
  const tipo = TIPOS_ANEXO[arquivo.type]
  if (!tipo) return { error: 'Formato não aceito. Envie imagem JPG ou PNG, ou um PDF.' }

  const alvo = await conversaParaEnvio(ctx.supabase, idConversa)
  if ('error' in alvo) return { error: alvo.error }
  const { conversa } = alvo

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }
  const loja = await provedorDaLoja(admin, conversa.id_lojista)
  if ('erro' in loja) return { error: loja.erro }

  // Sem o arquivo na Meta não existe o que mostrar na conversa: se a
  // subida falhar, nada é gravado e o erro volta para a tela.
  const nome = (arquivo.name || (tipo === 'image' ? 'imagem' : 'documento.pdf')).slice(0, 120)
  const subida = await loja.provedor.subirMidia({ bytes: new Uint8Array(await arquivo.arrayBuffer()), mime: arquivo.type, nome })
  if (!subida.ok) {
    await registrarErroDoProvedor(admin, conversa.id_lojista, subida.erro)
    return { error: subida.erro.mensagem }
  }

  const { data: nova, error: erroGravar } = await admin
    .from('whatsapp_mensagem')
    .insert({
      id_conversa: conversa.id_conversa,
      id_lojista: conversa.id_lojista,
      direcao: 'saida',
      tipo: tipo === 'image' ? 'imagem' : 'documento',
      texto: legenda || null,
      midia: { id: subida.id, mime: arquivo.type, nome },
      status: 'enviando',
      id_autor: ctx.user.id,
      nome_autor: await nomeDeQuemAtende(ctx.supabase),
    })
    .select(COLUNAS_MENSAGEM)
    .single()
  if (erroGravar || !nova) return { error: 'Não foi possível registrar a mensagem. Tente novamente.' }

  const envio = await loja.provedor.enviarMidia(conversa.telefone, tipo, subida.id, { legenda: legenda || undefined, nome })
  const mudanca = envio.ok
    ? { status: 'enviada', provider_message_id: envio.id, erro: null }
    : { status: 'erro', erro: envio.erro.mensagem }
  if (!envio.ok) await registrarErroDoProvedor(admin, conversa.id_lojista, envio.erro)

  const { data: final } = await admin
    .from('whatsapp_mensagem')
    .update(mudanca)
    .eq('id_mensagem', (nova as unknown as Mensagem).id_mensagem)
    .select(COLUNAS_MENSAGEM)
    .single()

  return { mensagem: (final ?? { ...(nova as unknown as Mensagem), ...mudanca }) as unknown as Mensagem }
}

// ------------------------------------------------------------
// Conectar o número da loja (dono ou administrador)
// ------------------------------------------------------------
// A loja informa os dados do app dela na Meta. O token e o segredo vão
// direto para a tabela que só o servidor lê; nunca voltam para a tela.
export async function conectarWhatsAppAction(formData: FormData): Promise<Resultado<{ numero: string | null; nome: string | null }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!ehGestor(ctx.contexto)) return { error: 'Só o responsável pela loja ou um administrador pode conectar o WhatsApp.' }

  const phoneNumberId = ((formData.get('phone_number_id') as string | null) ?? '').trim()
  const wabaId = ((formData.get('waba_id') as string | null) ?? '').trim()
  const accessToken = ((formData.get('access_token') as string | null) ?? '').trim()
  const appSecret = ((formData.get('app_secret') as string | null) ?? '').trim()

  if (!/^\d{5,25}$/.test(phoneNumberId)) return { error: 'Informe o identificador do número (Phone number ID), só com dígitos.' }
  if (wabaId && !/^\d{5,25}$/.test(wabaId)) return { error: 'O identificador da conta do WhatsApp Business (WABA ID) tem só dígitos.' }
  if (accessToken.length < 20) return { error: 'Cole o token de acesso do app da Meta.' }
  if (appSecret.length < 16) return { error: 'Cole o segredo do app (App Secret) da Meta.' }

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }

  // Só conecta se a Meta reconhecer o token para esse número.
  const consulta = await criarProvedorCloudApi({ phoneNumberId, accessToken }).consultarNumero()
  if (!consulta.ok) return { error: consulta.erro.mensagem }

  const idLojista = ctx.contexto.idLojista
  const agora = new Date().toISOString()

  const { error: erroIntegracao } = await admin.from('whatsapp_integracao').upsert({
    id_lojista: idLojista,
    phone_number_id: phoneNumberId,
    waba_id: wabaId || null,
    numero_exibicao: consulta.numero,
    nome_verificado: consulta.nome,
    status: 'conectado',
    ultimo_erro: null,
    conectado_em: agora,
    updated_at: agora,
  })
  if (erroIntegracao) {
    if (faltaMigration(erroIntegracao)) return { error: MSG_MIGRATION }
    if (erroIntegracao.code === '23505') return { error: 'Este número já está conectado a outra loja no SAIP.' }
    return { error: 'Não foi possível salvar a conexão. Tente novamente.' }
  }

  // O código de verificação do webhook é mantido se já existia: a loja
  // pode tê-lo cadastrado na Meta.
  const { data: atual } = await admin.from('whatsapp_credencial').select('verify_token').eq('id_lojista', idLojista).maybeSingle()
  const { error: erroCredencial } = await admin.from('whatsapp_credencial').upsert({
    id_lojista: idLojista,
    access_token: accessToken,
    app_secret: appSecret,
    verify_token: atual?.verify_token ?? randomBytes(24).toString('hex'),
    updated_at: agora,
  })
  if (erroCredencial) {
    await admin.from('whatsapp_integracao').update({ status: 'desconectado' }).eq('id_lojista', idLojista)
    return { error: 'Não foi possível guardar as credenciais. Tente novamente.' }
  }

  revalidatePath('/lojista/configuracoes/whatsapp')
  revalidatePath('/lojista/whatsapp')
  return { numero: consulta.numero, nome: consulta.nome }
}

// Desconectar: apaga o token e o segredo. As conversas ficam.
export async function desconectarWhatsAppAction(): Promise<Resultado> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!ehGestor(ctx.contexto)) return { error: 'Só o responsável pela loja ou um administrador pode desconectar o WhatsApp.' }

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }
  const idLojista = ctx.contexto.idLojista
  const { error: erroCredencial } = await admin.from('whatsapp_credencial').delete().eq('id_lojista', idLojista)
  const { error } = await admin
    .from('whatsapp_integracao')
    .update({ status: 'desconectado', ultimo_erro: null, updated_at: new Date().toISOString() })
    .eq('id_lojista', idLojista)
  if (error || erroCredencial) return { error: 'Não foi possível desconectar. Tente novamente.' }

  revalidatePath('/lojista/configuracoes/whatsapp')
  revalidatePath('/lojista/whatsapp')
  return {}
}

// Confere com a Meta se o token ainda vale (botão "Testar conexão").
export async function testarWhatsAppAction(): Promise<Resultado<{ numero: string | null; nome: string | null }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!ehGestor(ctx.contexto)) return { error: 'Só o responsável pela loja ou um administrador pode testar a conexão.' }

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }
  const idLojista = ctx.contexto.idLojista
  const loja = await provedorDaLoja(admin, idLojista)
  if ('erro' in loja) return { error: loja.erro === MSG_NAO_CONECTADO ? 'Conecte o WhatsApp primeiro.' : loja.erro }

  const consulta = await loja.provedor.consultarNumero()
  const agora = new Date().toISOString()
  if (!consulta.ok) {
    await admin.from('whatsapp_integracao').update({ status: 'erro', ultimo_erro: consulta.erro.mensagem, updated_at: agora }).eq('id_lojista', idLojista)
    revalidatePath('/lojista/configuracoes/whatsapp')
    return { error: consulta.erro.mensagem }
  }
  await admin
    .from('whatsapp_integracao')
    .update({ status: 'conectado', ultimo_erro: null, numero_exibicao: consulta.numero, nome_verificado: consulta.nome, updated_at: agora })
    .eq('id_lojista', idLojista)
  revalidatePath('/lojista/configuracoes/whatsapp')
  return { numero: consulta.numero, nome: consulta.nome }
}
