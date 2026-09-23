// Helpers de servidor do TaxiDog usados pelas Server Actions de
// agendamento (actions.ts) e pelas do próprio TaxiDog (actions-taxidog.ts).
// Não é um arquivo 'use server' — só é importado por eles.
import type { createClient } from '@/lib/supabase/server'
import { taxiDogAgendamentoSchema } from '@/lib/validations'
import { geocodificarEndereco } from '@/lib/geocodificacao'
import type { z } from 'zod'

type Supabase = Awaited<ReturnType<typeof createClient>>
export type TaxiDogAgendamento = z.infer<typeof taxiDogAgendamentoSchema>

// `taxidog` ausente/vazio = cliente vai levar o pet (caminho de sempre).
export function lerTaxiDogDoFormulario(
  formData: FormData
): { dados: TaxiDogAgendamento | null; erro?: string } {
  const bruto = formData.get('taxidog') as string | null
  if (!bruto) return { dados: null }

  let json: unknown
  try {
    json = JSON.parse(bruto)
  } catch {
    return { dados: null, erro: 'Dados do TaxiDog inválidos.' }
  }

  const parsed = taxiDogAgendamentoSchema.safeParse(json)
  if (!parsed.success) return { dados: null, erro: parsed.error.issues[0].message }
  return { dados: parsed.data }
}

// Só geocodifica quando a loja cobra por distância — por valor fixo ou
// por região o banco não precisa de coordenada nenhuma.
export async function coordenadasParaTaxiDog(
  supabase: Supabase,
  idLojista: string,
  endereco: TaxiDogAgendamento['endereco']
): Promise<{ lat: number; lng: number; precisao: string } | null> {
  const { data } = await supabase.rpc('fn_taxidog_publico', { p_id_lojista: idLojista })
  const info = (data as { disponivel: boolean; modo_cobranca: string }[] | null)?.[0]
  if (!info?.disponivel) return null
  if (info.modo_cobranca !== 'distancia' && info.modo_cobranca !== 'personalizado') return null
  return geocodificarEndereco(endereco)
}

export function paramsRpcTaxiDog(dados: TaxiDogAgendamento, coords: { lat: number; lng: number } | null) {
  return {
    p_tx_modalidade: dados.modalidade,
    p_tx_cep: dados.endereco.cep,
    p_tx_logradouro: dados.endereco.logradouro,
    p_tx_numero: dados.endereco.numero,
    p_tx_complemento: dados.endereco.complemento || null,
    p_tx_bairro: dados.endereco.bairro,
    p_tx_cidade: dados.endereco.cidade,
    p_tx_uf: dados.endereco.uf,
    p_tx_lat: coords?.lat ?? null,
    p_tx_lng: coords?.lng ?? null,
  }
}

// fn_anexar_taxidog prefixa as mensagens com "TaxiDog:" justamente pra
// elas chegarem prontas ao cliente (endereço fora da área, CEP inválido…).
export function mensagemErroTaxiDog(mensagem: string | undefined): string | null {
  if (!mensagem) return null
  const i = mensagem.indexOf('TaxiDog:')
  return i >= 0 ? mensagem.slice(i) : null
}
