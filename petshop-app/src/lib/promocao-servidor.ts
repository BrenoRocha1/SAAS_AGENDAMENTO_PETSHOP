// Promoção do serviço no servidor (migration 096) — o que as actions de
// serviço e de agendamento têm em comum. Não é um arquivo 'use server'.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  faltaMigrationPromocaoCompleta,
  lerDadosPromocaoServico,
  type DadosPromocaoServico,
} from '@/lib/promocao'
import { formatarReais } from '@/lib/taxidog'

// Erro do banco ao gravar a promoção, em português claro. As mensagens do
// trigger da 096 ("O preço promocional…") já vêm prontas para a tela.
// `null` = o erro não é da promoção.
export function mensagemErroPromocaoServico(mensagem: string | null | undefined): string | null {
  if (faltaMigrationPromocaoCompleta(mensagem)) return 'Execute a migration 096_promocao_servico_completa.sql para usar a promoção com preço promocional.'
  if (/preço promocional/i.test(mensagem ?? '')) return mensagem as string
  if (/servico_promo_valida/i.test(mensagem ?? '')) return 'Confira o período da promoção: o encerramento precisa ser depois do início.'
  return null
}

// A seção "Promoção" do cadastro do serviço manda um JSON no campo
// `promocao` — só quando a loja mexeu nela. Sem o campo, a promoção do
// serviço não é tocada.
export function lerPromocaoDoFormulario(formData: FormData):
  | { veio: false }
  | { veio: true; dados: DadosPromocaoServico | null }
  | { erro: string } {
  const bruto = formData.get('promocao')
  if (typeof bruto !== 'string' || bruto === '') return { veio: false }
  let json: unknown
  try {
    json = JSON.parse(bruto)
  } catch {
    return { erro: 'Dados da promoção inválidos.' }
  }
  const dados = lerDadosPromocaoServico(json)
  if (dados === undefined) return { erro: 'Dados da promoção inválidos.' }
  return { veio: true, dados }
}

export interface PrecoAtual { preco: number; cheio: number }

// O cliente confirma o agendamento com os preços que viu (`precos_vistos`).
// Antes de criar, o servidor calcula de novo cada serviço para o pet — com a
// promoção que vale AGORA — e, se algum mudou (a promoção terminou ou
// começou nesse meio-tempo, ou a loja mexeu no preço), nada é criado: a
// tela recebe os preços atuais, mostra a diferença e o cliente decide.
// Tela antiga, que não manda `precos_vistos`, segue como sempre.
export async function conferirPrecosVistos(
  supabase: SupabaseClient,
  formData: FormData,
  idPet: string,
  idsServicos: string[],
): Promise<{ error: string; precos_atuais: Record<string, PrecoAtual> } | null> {
  const bruto = formData.get('precos_vistos')
  if (typeof bruto !== 'string' || bruto === '') return null
  // `promo`: o preço que o cliente viu era promocional.
  let vistos: Map<string, number>
  const vistosEmPromo = new Set<string>()
  try {
    const lista = JSON.parse(bruto) as unknown
    if (!Array.isArray(lista)) return null
    const itens = lista.filter((i): i is { id_servico: string; preco: number; promo?: unknown } =>
      !!i && typeof i === 'object' && typeof (i as { id_servico?: unknown }).id_servico === 'string' && Number.isFinite(Number((i as { preco?: unknown }).preco)))
    vistos = new Map(itens.map(i => [i.id_servico, Number(i.preco)]))
    for (const i of itens) if (i.promo === true) vistosEmPromo.add(i.id_servico)
  } catch {
    return null
  }
  if (vistos.size === 0) return null

  const unicos = [...new Set(idsServicos)].filter(id => vistos.has(id))
  const [atuais, nomes] = await Promise.all([
    Promise.all(unicos.map(async id => {
      const [promo, cheio] = await Promise.all([
        supabase.rpc('fn_calcular_preco_servico', { p_id_servico: id, p_id_pet: idPet }),
        // Sem a migration 096 esta função não existe: o preço cheio fica igual ao atual.
        supabase.rpc('fn_preco_servico_cheio', { p_id_servico: id, p_id_pet: idPet }),
      ])
      if (promo.error || promo.data == null) return null
      const preco = Number(promo.data)
      return [id, { preco, cheio: cheio.error || cheio.data == null ? preco : Number(cheio.data) }] as const
    })),
    supabase.from('servico').select('id_servico, nome').in('id_servico', unicos),
  ])

  const precosAtuais: Record<string, PrecoAtual> = {}
  for (const par of atuais) if (par) precosAtuais[par[0]] = par[1]

  const mudou = unicos.filter(id => precosAtuais[id] && Math.abs(precosAtuais[id].preco - (vistos.get(id) as number)) >= 0.005)
  if (mudou.length === 0) return null

  const nome = (id: string) => ((nomes.data ?? []) as { id_servico: string; nome: string }[]).find(s => s.id_servico === id)?.nome ?? 'um serviço'
  const frases = mudou.map(id => {
    const antes = vistos.get(id) as number
    const agora = precosAtuais[id]
    const motivo = agora.preco > antes
      ? (vistosEmPromo.has(id) && agora.preco === agora.cheio ? ' — a promoção terminou' : '')
      : (agora.preco < agora.cheio && !vistosEmPromo.has(id) ? ' — entrou em promoção' : '')
    return `${nome(id)} passou de ${formatarReais(antes)} para ${formatarReais(agora.preco)}${motivo}`
  })
  return {
    error: `O preço mudou: ${frases.join('; ')}. Confira o novo total antes de confirmar.`,
    precos_atuais: precosAtuais,
  }
}
