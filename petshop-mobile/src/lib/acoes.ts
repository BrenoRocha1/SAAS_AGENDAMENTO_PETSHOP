import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { SITE_URL } from '@/lib/site'

// Chama uma Server Action do painel web pelo app.
//
// O que é só leitura ou tem função própria no banco, o app faz direto no
// Supabase. O resto — convite por e-mail, gravação feita por
// administrador, envio de imagem, geocodificação — só existe no servidor
// do site, e lá já tem TODA a regra. Em vez de copiar essa regra, o app
// pede ao site que rode a mesma action (POST /api/app/acao), se
// identificando com o token da própria sessão. Precisa de
// EXPO_PUBLIC_SITE_URL.

export type ResultadoAcao<T = Record<string, never>> = { error?: string; success?: boolean; aviso?: string } & Partial<T>

type ValorForm = string | number | boolean | null | undefined | Arquivo
export interface Arquivo { $arquivo: { base64: string; nome: string; tipo: string } }

// Argumento que vira FormData no servidor (as actions de formulário
// recebem FormData). Lista = campo repetido.
export function form(campos: Record<string, ValorForm | ValorForm[]>): { $form: Record<string, ValorForm | ValorForm[]> } {
  return { $form: campos }
}

export function arquivo(base64: string, nome: string, tipo: string): Arquivo {
  return { $arquivo: { base64, nome, tipo } }
}

export const acoesDisponiveis = (): boolean => !!SITE_URL

export const MSG_SEM_SITE = 'Esta função precisa do endereço do site configurado no app (EXPO_PUBLIC_SITE_URL).'

const MSG_SESSAO = 'Sua sessão expirou. Entre de novo.'

async function enviar(token: string, acao: string, args: unknown[]): Promise<Response | null> {
  try {
    return await fetch(`${SITE_URL}/api/app/acao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ acao, args }),
    })
  } catch {
    return null
  }
}

export async function chamarAcao<T = Record<string, never>>(acao: string, ...args: unknown[]): Promise<ResultadoAcao<T>> {
  if (!SITE_URL) return { error: MSG_SEM_SITE } as ResultadoAcao<T>

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { error: MSG_SESSAO } as ResultadoAcao<T>

  let resposta = await enviar(token, acao, args)

  // 401 = o site não aceitou a sessão. Pode ser só o token vencido (o app
  // ficou em segundo plano): renova e tenta de novo, uma vez. Se nem
  // renovar dá, a sessão foi encerrada no servidor — o banco ainda aceita
  // o token até vencer, então sem isto a pessoa ficaria num app "meio
  // logado". Sai deste aparelho e o app volta para o login.
  if (resposta?.status === 401) {
    const { data: nova, error } = await supabase.auth.refreshSession()
    const novoToken = nova.session?.access_token
    if (error || !novoToken) {
      // Falha de rede ao renovar não é sessão inválida: só avisa.
      if (error && isAuthRetryableFetchError(error)) {
        return { error: 'Sem conexão. Confira a internet e tente de novo.' } as ResultadoAcao<T>
      }
      await supabase.auth.signOut({ scope: 'local' })
      return { error: MSG_SESSAO } as ResultadoAcao<T>
    }
    resposta = await enviar(novoToken, acao, args)
  }

  if (!resposta) return { error: 'Sem conexão com o site da loja. Confira a internet e tente de novo.' } as ResultadoAcao<T>

  let corpo: unknown = null
  try {
    corpo = await resposta.json()
  } catch {
    // resposta sem JSON (site fora do ar, página de erro…)
  }
  if (corpo && typeof corpo === 'object') return corpo as ResultadoAcao<T>
  return { error: resposta.ok ? 'O site respondeu de um jeito inesperado.' : 'O site da loja não respondeu. Tente de novo em instantes.' } as ResultadoAcao<T>
}
