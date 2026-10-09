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
import { enderecoDoSite } from '@/lib/whatsapp/endereco'
import { configEvolution, estadoDaInstancia, nomeDaInstancia, prepararInstancia, qrDaInstancia, removerInstancia } from '@/lib/whatsapp/evolution'
import { criarProvedorCloudApi } from '@/lib/whatsapp/provedor'
import { MSG_NAO_CONECTADO, MSG_SEM_SERVIDOR_QR, provedorDaLoja, registrarErroDoProvedor } from '@/lib/whatsapp/servico'
import { COLUNAS_MENSAGEM, janelaAberta, type Mensagem, type Midia, type TipoMensagem } from '@/lib/whatsapp/tipos'

type Resultado<T = object> = ({ error: string } | ({ error?: undefined } & T))

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MSG_SERVICO = 'Serviço temporariamente indisponível. Configure a SUPABASE_SERVICE_ROLE_KEY.'
const MSG_MIGRATION = 'Execute a migration 088_whatsapp.sql para usar o WhatsApp.'
const MSG_MIGRATION_QR = 'Execute a migration 089_whatsapp_qr.sql para concluir.'
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
  return { conversa: data as ConversaParaEnvio }
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

// Grava a mensagem que saiu da loja, depois do envio (com o identificador
// do provedor, ou com o erro), e devolve a linha como a tela usa.
async function registrarEnvio(admin: Admin, dados: {
  idLojista: string
  idConversa: string
  tipo: TipoMensagem
  texto: string | null
  midia: Midia | null
  status: 'enviada' | 'erro'
  erro: string | null
  idProvedor: string | null
  idAutor: string
  nomeAutor: string | null
}): Promise<{ mensagem: Mensagem } | { error: string }> {
  const { data: id, error } = await admin.rpc('fn_whatsapp_registrar_envio', {
    p_id_lojista: dados.idLojista, p_id_conversa: dados.idConversa, p_telefone: null, p_tipo: dados.tipo, p_texto: dados.texto,
    p_midia: dados.midia, p_dados: null, p_status: dados.status, p_erro: dados.erro, p_provider_id: dados.idProvedor,
    p_id_autor: dados.idAutor, p_nome_autor: dados.nomeAutor,
  })
  if (error || typeof id !== 'string') {
    if (error && (error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(error.message))) return { error: MSG_MIGRATION_QR }
    return { error: dados.status === 'enviada'
      ? 'A mensagem foi enviada, mas não ficou registrada na conversa. Atualize a tela.'
      : (dados.erro ?? 'Não foi possível enviar a mensagem.') }
  }
  const { data: linha } = await admin.from('whatsapp_mensagem').select(COLUNAS_MENSAGEM).eq('id_mensagem', id).single()
  if (!linha) return { error: 'A mensagem foi registrada, mas não pôde ser lida de volta. Atualize a tela.' }
  return { mensagem: linha as unknown as Mensagem }
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
  // A regra das 24 horas é só da API oficial.
  if (loja.tipo === 'cloud_api' && !janelaAberta(conversa.ultima_entrada_em)) return { error: MSG_JANELA }

  // Envia e só então grava: com o identificador do provedor, ou com o erro
  // (a mensagem fica na conversa marcada como não enviada, e dá para
  // tentar de novo).
  const envio = await loja.provedor.enviarTexto(conversa.telefone, corpo)
  if (!envio.ok) await registrarErroDoProvedor(admin, conversa.id_lojista, envio.erro)

  return registrarEnvio(admin, {
    idLojista: conversa.id_lojista,
    idConversa: conversa.id_conversa,
    tipo: 'texto',
    texto: corpo,
    midia: null,
    status: envio.ok ? 'enviada' : 'erro',
    erro: envio.ok ? null : envio.erro.mensagem,
    idProvedor: envio.ok ? envio.id : null,
    idAutor: ctx.user.id,
    nomeAutor: await nomeDeQuemAtende(ctx.supabase),
  })
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
  if (loja.tipo === 'cloud_api' && !janelaAberta(conversa.ultima_entrada_em)) return { error: MSG_JANELA }

  const envio = await loja.provedor.enviarTexto(conversa.telefone, original.texto)
  if (!envio.ok) {
    await registrarErroDoProvedor(admin, conversa.id_lojista, envio.erro)
    const { data: final } = await admin
      .from('whatsapp_mensagem')
      .update({ erro: envio.erro.mensagem })
      .eq('id_mensagem', idMensagem)
      .select(COLUNAS_MENSAGEM)
      .single()
    if (!final) return { error: envio.erro.mensagem }
    return { mensagem: final as unknown as Mensagem }
  }

  // Saiu: a tentativa que tinha dado erro dá lugar à mensagem enviada.
  const registro = await registrarEnvio(admin, {
    idLojista: conversa.id_lojista,
    idConversa: conversa.id_conversa,
    tipo: 'texto',
    texto: original.texto,
    midia: null,
    status: 'enviada',
    erro: null,
    idProvedor: envio.id,
    idAutor: ctx.user.id,
    nomeAutor: await nomeDeQuemAtende(ctx.supabase),
  })
  if ('error' in registro) return registro
  await admin.from('whatsapp_mensagem').delete().eq('id_mensagem', idMensagem).eq('status', 'erro')
  return registro
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
  if (loja.tipo === 'cloud_api' && !janelaAberta(conversa.ultima_entrada_em)) return { error: MSG_JANELA }

  // Arquivo que não saiu não tem o que mostrar na conversa: se o envio
  // falhar, nada é gravado e o erro volta para a tela.
  const nome = (arquivo.name || (tipo === 'image' ? 'imagem' : 'documento.pdf')).slice(0, 120)
  const envio = await loja.provedor.enviarMidia(
    conversa.telefone,
    tipo,
    { bytes: new Uint8Array(await arquivo.arrayBuffer()), mime: arquivo.type, nome },
    legenda || undefined
  )
  if (!envio.ok) {
    await registrarErroDoProvedor(admin, conversa.id_lojista, envio.erro)
    return { error: envio.erro.mensagem }
  }

  return registrarEnvio(admin, {
    idLojista: conversa.id_lojista,
    idConversa: conversa.id_conversa,
    tipo: tipo === 'image' ? 'imagem' : 'documento',
    texto: legenda || null,
    midia: { id: envio.idMidia, mime: arquivo.type, nome },
    status: 'enviada',
    erro: null,
    idProvedor: envio.id,
    idAutor: ctx.user.id,
    nomeAutor: await nomeDeQuemAtende(ctx.supabase),
  })
}

// ------------------------------------------------------------
// Conectar pela API oficial da Meta (dono ou administrador)
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

  // Estava conectada por QR code: a sessão de lá é encerrada.
  await encerrarSessaoQr(admin, idLojista)

  const integracao = {
    id_lojista: idLojista,
    phone_number_id: phoneNumberId,
    waba_id: wabaId || null,
    numero_exibicao: consulta.numero,
    nome_verificado: consulta.nome,
    status: 'conectado',
    ultimo_erro: null,
    conectado_em: agora,
    updated_at: agora,
  }
  let { error: erroIntegracao } = await admin.from('whatsapp_integracao').upsert({ ...integracao, provedor: 'cloud_api', instancia: null })
  // Sem a migration 089 as colunas do QR code não existem: grava sem elas.
  if (erroIntegracao && /provedor|instancia/.test(erroIntegracao.message)) {
    erroIntegracao = (await admin.from('whatsapp_integracao').upsert(integracao)).error
  }
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

// ------------------------------------------------------------
// Conectar por QR code (dono ou administrador)
// ------------------------------------------------------------
// A loja escaneia o QR code com o WhatsApp do celular. Quem mantém a sessão
// é o servidor da Evolution API (um só para todas as lojas, configurado no
// ambiente do SAIP); aqui a loja ganha a sua instância lá.

// A sessão de QR code da loja, se houver, é encerrada no servidor.
async function encerrarSessaoQr(admin: Admin, idLojista: string) {
  const { data } = await admin.from('whatsapp_integracao').select('provedor, instancia').eq('id_lojista', idLojista).maybeSingle()
  const cfg = configEvolution()
  if (cfg && data?.provedor === 'evolution' && data.instancia) await removerInstancia(cfg, data.instancia)
}

// Prepara a conexão e devolve o QR code para a tela mostrar.
export async function iniciarQrWhatsAppAction(): Promise<Resultado<{ qr: string | null; conectado: boolean }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!ehGestor(ctx.contexto)) return { error: 'Só o responsável pela loja ou um administrador pode conectar o WhatsApp.' }
  const cfg = configEvolution()
  if (!cfg) return { error: MSG_SEM_SERVIDOR_QR }
  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }

  const idLojista = ctx.contexto.idLojista
  const instancia = nomeDaInstancia(idLojista)
  const agora = new Date().toISOString()

  const { data: atual, error: erroLeitura } = await admin
    .from('whatsapp_integracao')
    .select('provedor, status')
    .eq('id_lojista', idLojista)
    .maybeSingle()
  if (erroLeitura) return { error: faltaMigration(erroLeitura) || /provedor/.test(erroLeitura.message) ? MSG_MIGRATION_QR : 'Não foi possível preparar a conexão.' }

  // O endereço do webhook da loja leva um código secreto; o mesmo código
  // continua valendo enquanto a loja estiver no QR code.
  const { data: credencial } = await admin.from('whatsapp_credencial').select('verify_token').eq('id_lojista', idLojista).maybeSingle()
  const codigo = atual?.provedor === 'evolution' && credencial?.verify_token ? credencial.verify_token : randomBytes(24).toString('hex')

  const preparo = await prepararInstancia(cfg, instancia, `${await enderecoDoSite()}/api/whatsapp/evolution/${codigo}`)
  if (!preparo.ok) return { error: preparo.erro.mensagem }

  // Já estava conectada por QR code e a sessão continua aberta: não troca nada.
  const jaConectada = atual?.provedor === 'evolution' && atual.status === 'conectado'
  const { error: erroIntegracao } = await admin.from('whatsapp_integracao').upsert({
    id_lojista: idLojista,
    provedor: 'evolution',
    instancia,
    phone_number_id: null,
    waba_id: null,
    ...(jaConectada ? {} : { status: 'pendente', numero_exibicao: null, nome_verificado: null }),
    ultimo_erro: null,
    updated_at: agora,
  })
  if (erroIntegracao) return { error: /provedor|instancia|status_check/.test(erroIntegracao.message) ? MSG_MIGRATION_QR : 'Não foi possível salvar a conexão. Tente novamente.' }

  const { error: erroCredencial } = await admin.from('whatsapp_credencial').upsert({
    id_lojista: idLojista,
    // Na conexão por QR code não há token da loja: a chave é a do servidor.
    access_token: '-',
    app_secret: '-',
    verify_token: codigo,
    updated_at: agora,
  })
  if (erroCredencial) return { error: 'Não foi possível guardar a conexão. Tente novamente.' }

  const qr = await qrDaInstancia(cfg, instancia)
  if (!qr.ok) return { error: qr.erro.mensagem }
  if (qr.conectado) await admin.from('whatsapp_integracao').update({ status: 'conectado', conectado_em: agora }).eq('id_lojista', idLojista)

  revalidatePath('/lojista/configuracoes/whatsapp')
  revalidatePath('/lojista/whatsapp')
  return { qr: qr.qr, conectado: qr.conectado }
}

// A tela pergunta de tempos em tempos enquanto o QR code está aberto: já
// escaneou? Se não, devolve o QR code do momento (ele muda a cada minuto).
export async function estadoQrWhatsAppAction(): Promise<Resultado<{ conectado: boolean; qr: string | null; numero: string | null }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!ehGestor(ctx.contexto)) return { error: 'Acesso não autorizado' }
  const cfg = configEvolution()
  if (!cfg) return { error: MSG_SEM_SERVIDOR_QR }
  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }

  const idLojista = ctx.contexto.idLojista
  const { data: integracao } = await admin
    .from('whatsapp_integracao')
    .select('provedor, instancia, status, numero_exibicao')
    .eq('id_lojista', idLojista)
    .maybeSingle()
  if (!integracao || integracao.provedor !== 'evolution' || !integracao.instancia) return { error: 'Gere o QR code primeiro.' }

  const estado = await estadoDaInstancia(cfg, integracao.instancia)
  if (!estado.ok) return { error: estado.erro.mensagem }

  if (estado.estado === 'open') {
    // O aviso do servidor (com o número) costuma chegar antes; isto garante
    // o status mesmo se ele atrasar.
    if (integracao.status !== 'conectado') {
      const agora = new Date().toISOString()
      await admin.from('whatsapp_integracao').update({ status: 'conectado', ultimo_erro: null, conectado_em: agora, updated_at: agora }).eq('id_lojista', idLojista)
      revalidatePath('/lojista/configuracoes/whatsapp')
      revalidatePath('/lojista/whatsapp')
    }
    return { conectado: true, qr: null, numero: integracao.numero_exibicao }
  }

  const qr = await qrDaInstancia(cfg, integracao.instancia)
  if (!qr.ok) return { error: qr.erro.mensagem }
  return { conectado: qr.conectado, qr: qr.qr, numero: null }
}

// ------------------------------------------------------------
// Desconectar e testar (valem para os dois jeitos de conectar)
// ------------------------------------------------------------

// Desconectar: apaga o token (ou encerra a sessão do QR code). As
// conversas ficam.
export async function desconectarWhatsAppAction(): Promise<Resultado> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!ehGestor(ctx.contexto)) return { error: 'Só o responsável pela loja ou um administrador pode desconectar o WhatsApp.' }

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }
  const idLojista = ctx.contexto.idLojista
  await encerrarSessaoQr(admin, idLojista)
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

// Confere se a conexão continua de pé (botão "Testar conexão").
export async function testarWhatsAppAction(): Promise<Resultado<{ numero: string | null; nome: string | null }>> {
  const ctx = await contextoDoWhatsApp()
  if ('error' in ctx) return { error: ctx.error }
  if (!ehGestor(ctx.contexto)) return { error: 'Só o responsável pela loja ou um administrador pode testar a conexão.' }

  const admin = createAdminClient()
  if (!admin) return { error: MSG_SERVICO }
  const idLojista = ctx.contexto.idLojista
  const agora = new Date().toISOString()
  const { data: integracao } = await admin
    .from('whatsapp_integracao')
    .select('*')
    .eq('id_lojista', idLojista)
    .maybeSingle()
  if (!integracao || integracao.status === 'desconectado') return { error: 'Conecte o WhatsApp primeiro.' }

  const falhou = async (mensagem: string) => {
    await admin.from('whatsapp_integracao').update({ status: 'erro', ultimo_erro: mensagem, updated_at: agora }).eq('id_lojista', idLojista)
    revalidatePath('/lojista/configuracoes/whatsapp')
    return { error: mensagem }
  }

  if (integracao.provedor === 'evolution') {
    const cfg = configEvolution()
    if (!cfg) return { error: MSG_SEM_SERVIDOR_QR }
    const estado = await estadoDaInstancia(cfg, integracao.instancia ?? nomeDaInstancia(idLojista))
    if (!estado.ok) return { error: estado.erro.mensagem }
    if (estado.estado !== 'open') return falhou('O WhatsApp está desconectado no celular. Escaneie o QR code de novo.')
    await admin.from('whatsapp_integracao').update({ status: 'conectado', ultimo_erro: null, updated_at: agora }).eq('id_lojista', idLojista)
    revalidatePath('/lojista/configuracoes/whatsapp')
    return { numero: integracao.numero_exibicao ?? null, nome: integracao.nome_verificado ?? null }
  }

  const { data: credencial } = await admin.from('whatsapp_credencial').select('access_token').eq('id_lojista', idLojista).maybeSingle()
  if (!integracao.phone_number_id || !credencial?.access_token) return { error: MSG_NAO_CONECTADO }
  const consulta = await criarProvedorCloudApi({ phoneNumberId: integracao.phone_number_id, accessToken: credencial.access_token }).consultarNumero()
  if (!consulta.ok) return falhou(consulta.erro.mensagem)
  await admin
    .from('whatsapp_integracao')
    .update({ status: 'conectado', ultimo_erro: null, numero_exibicao: consulta.numero, nome_verificado: consulta.nome, updated_at: agora })
    .eq('id_lojista', idLojista)
  revalidatePath('/lojista/configuracoes/whatsapp')
  return { numero: consulta.numero, nome: consulta.nome }
}
