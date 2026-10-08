import type { createAdminClient } from '@/lib/supabase/admin'
import { criarProvedorCloudApi, type ErroDoProvedor, type ProvedorWhatsApp } from './provedor'
import { assinaturaValida, lerWebhook } from './webhook'

// Serviço de WhatsApp do lado do servidor: liga o provedor (Cloud API da
// Meta) às tabelas da migration 088. As credenciais só são lidas aqui, com
// a chave de serviço — nunca vão para o navegador.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

export const MSG_NAO_CONECTADO = 'O WhatsApp da loja não está conectado.'

// O provedor pronto para enviar pela loja, ou o motivo de não dar.
export async function provedorDaLoja(admin: Admin, idLojista: string): Promise<{ provedor: ProvedorWhatsApp } | { erro: string }> {
  const [{ data: integracao }, { data: credencial }] = await Promise.all([
    admin.from('whatsapp_integracao').select('phone_number_id, status').eq('id_lojista', idLojista).maybeSingle(),
    admin.from('whatsapp_credencial').select('access_token').eq('id_lojista', idLojista).maybeSingle(),
  ])
  if (!integracao || integracao.status === 'desconectado' || !credencial?.access_token) return { erro: MSG_NAO_CONECTADO }
  return { provedor: criarProvedorCloudApi({ phoneNumberId: integracao.phone_number_id, accessToken: credencial.access_token }) }
}

// O token deixou de valer: a tela passa a avisar que precisa reconectar.
export async function registrarErroDoProvedor(admin: Admin, idLojista: string, erro: ErroDoProvedor) {
  if (!erro.tokenInvalido) return
  await admin
    .from('whatsapp_integracao')
    .update({ status: 'erro', ultimo_erro: erro.mensagem, updated_at: new Date().toISOString() })
    .eq('id_lojista', idLojista)
    .neq('status', 'desconectado')
}

// Verificação do webhook (a Meta chama com o código que a loja colou lá).
// Vale o código da loja ou, se o SAIP tiver um app único configurado, o do
// ambiente.
export async function codigoDeVerificacaoValido(admin: Admin, codigo: string | null): Promise<boolean> {
  if (!codigo) return false
  const global = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (global && codigo === global) return true
  const { data } = await admin.from('whatsapp_credencial').select('id_lojista').eq('verify_token', codigo).maybeSingle()
  return !!data
}

// Pacote de eventos da Meta: mensagens recebidas e status das enviadas.
// Devolve o código HTTP da resposta. Em falha de gravação responde 500
// para a Meta tentar de novo — a mesma mensagem não entra duas vezes
// (provider_message_id).
export async function processarWebhook(admin: Admin, corpoCru: string, assinatura: string | null): Promise<number> {
  let corpo: unknown
  try {
    corpo = JSON.parse(corpoCru)
  } catch {
    return 400
  }
  const eventos = lerWebhook(corpo)
  // Nada de mensagens (outro tipo de aviso da conta): só confirma.
  if (eventos.numeros.length === 0) return 200

  const { data: integracoes, error: erroIntegracoes } = await admin
    .from('whatsapp_integracao')
    .select('id_lojista, phone_number_id')
    .in('phone_number_id', eventos.numeros)
    .neq('status', 'desconectado')
  if (erroIntegracoes) return 500
  // Número que nenhuma loja conectou: confirma, senão a Meta fica reenviando.
  if (!integracoes || integracoes.length === 0) return 200

  const { data: credenciais } = await admin
    .from('whatsapp_credencial')
    .select('id_lojista, app_secret')
    .in('id_lojista', integracoes.map(i => i.id_lojista))

  // Só entra o que veio assinado com o segredo do app daquela loja (ou do
  // app único do SAIP, se houver).
  const segredoGlobal = process.env.WHATSAPP_APP_SECRET
  const lojaDoNumero = new Map<string, string>()
  for (const integracao of integracoes) {
    const segredo = credenciais?.find(c => c.id_lojista === integracao.id_lojista)?.app_secret
    const assinado = (!!segredo && assinaturaValida(corpoCru, assinatura, segredo))
      || (!!segredoGlobal && assinaturaValida(corpoCru, assinatura, segredoGlobal))
    if (assinado) lojaDoNumero.set(integracao.phone_number_id, integracao.id_lojista)
  }
  if (lojaDoNumero.size === 0) return 401

  let falhou = false

  // Uma de cada vez, na ordem em que vieram.
  for (const m of eventos.mensagens) {
    const idLojista = lojaDoNumero.get(m.phoneNumberId)
    if (!idLojista) continue
    const { error } = await admin.rpc('fn_whatsapp_receber', {
      p_id_lojista: idLojista,
      p_telefone: m.de,
      p_nome: m.nome,
      p_provider_id: m.idProvedor,
      p_tipo: m.tipo,
      p_texto: m.texto,
      p_midia: m.midia,
      p_dados: m.dados,
      p_quando: m.quando,
    })
    if (error) {
      console.error('[whatsapp webhook] mensagem não gravada:', error.code, error.message)
      falhou = true
    }
  }

  for (const s of eventos.status) {
    const idLojista = lojaDoNumero.get(s.phoneNumberId)
    if (!idLojista) continue
    const { error } = await admin.rpc('fn_whatsapp_status', {
      p_id_lojista: idLojista,
      p_provider_id: s.idProvedor,
      p_status: s.status,
      p_erro: s.erro,
    })
    if (error) {
      console.error('[whatsapp webhook] status não gravado:', error.code, error.message)
      falhou = true
    }
  }

  // Sinal de vida do webhook, mostrado em Configurações → WhatsApp.
  await admin
    .from('whatsapp_integracao')
    .update({ webhook_em: new Date().toISOString() })
    .in('id_lojista', [...new Set(lojaDoNumero.values())])

  return falhou ? 500 : 200
}
