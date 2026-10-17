// Atribuir um plano pela tela de Planos — o mesmo do site
// (AtribuirPlanoModal + buscarClientesPlanoAction / petsDoClientePlanoAction).
// Quem cria a assinatura é fn_assinar_plano, a mesma da ficha do pet: o
// banco confere a loja, o plano ativo, o pet do cliente da loja e o plano
// repetido. Aqui é só leitura, já presa à loja (e às regras de acesso).

import { supabase } from '@/lib/supabase'
import { mensagemDoBanco } from '@/lib/erros'

export interface ClienteParaPlano { id_cliente: string; nome: string; telefone: string | null }
export interface PetParaPlano {
  id_pet: string
  nome: string
  raca: string | null
  especie: string | null
  foto_url: string | null
  // id dos planos que o pet já tem ativos (o mesmo plano não pode repetir).
  planos_ativos: string[]
}

// Clientes da loja por nome ou telefone. Sem termo, os primeiros em ordem alfabética.
export async function buscarClientesParaPlano(idLojista: string, busca: string): Promise<{ erro?: string; clientes?: ClienteParaPlano[] }> {
  const termo = (busca ?? '').replace(/[%,()*\\]/g, ' ').trim().slice(0, 60)
  const digitos = termo.replace(/\D/g, '')
  let consulta = supabase
    .from('cliente_lojista')
    .select('cliente:id_cliente!inner ( id_cliente, nome, telefone )')
    .eq('id_lojista', idLojista)
  if (termo) {
    const filtros = [`nome.ilike.%${termo}%`]
    if (digitos.length >= 3) filtros.push(`telefone.ilike.%${digitos}%`)
    consulta = consulta.or(filtros.join(','), { referencedTable: 'cliente' })
  }
  const { data, error } = await consulta.limit(termo ? 40 : 200)
  if (error) return { erro: 'Não foi possível buscar os clientes agora. Tente de novo.' }
  const clientes = ((data ?? []) as unknown as { cliente: ClienteParaPlano | null }[])
    .map(l => l.cliente)
    .filter((c): c is ClienteParaPlano => !!c)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 20)
  return { clientes }
}

// Pets ativos de um cliente da loja, com os planos que cada um já tem.
export async function petsDoClienteParaPlano(idLojista: string, idCliente: string): Promise<{ erro?: string; pets?: PetParaPlano[] }> {
  const { data: vinculo } = await supabase.from('cliente_lojista').select('id_cliente').eq('id_lojista', idLojista).eq('id_cliente', idCliente).maybeSingle()
  if (!vinculo) return { erro: 'Cliente não encontrado entre os clientes da loja.' }
  const [{ data: pets, error }, { data: assinaturas }] = await Promise.all([
    supabase.from('pet').select('id_pet, nome, raca, especie, foto_url').eq('id_cliente', idCliente).eq('ativo', true).order('nome'),
    supabase.from('assinatura').select('id_pet, id_plano').eq('id_lojista', idLojista).eq('id_cliente', idCliente).eq('status', 'ativa'),
  ])
  if (error) return { erro: 'Não foi possível carregar os pets agora. Tente de novo.' }
  const porPet = new Map<string, string[]>()
  for (const a of (assinaturas ?? []) as { id_pet: string; id_plano: string }[]) {
    porPet.set(a.id_pet, [...(porPet.get(a.id_pet) ?? []), a.id_plano])
  }
  return { pets: ((pets ?? []) as Omit<PetParaPlano, 'planos_ativos'>[]).map(p => ({ ...p, planos_ativos: porPet.get(p.id_pet) ?? [] })) }
}

export async function assinarPlano(idPlano: string, idPet: string, inicioISO: string, forma: string | null): Promise<{ erro?: string }> {
  const { error } = await supabase.rpc('fn_assinar_plano', {
    p_id_plano: idPlano,
    p_id_pet: idPet,
    p_data_inicio: inicioISO,
    p_forma_pagamento: forma,
  })
  if (!error) return {}
  // Duas confirmações ao mesmo tempo: o índice único (migration 103) segura a segunda.
  if (/uq_assinatura_ativa_pet_plano|duplicate key/i.test(error.message)) return { erro: 'Este pet já tem este plano ativo.' }
  return { erro: mensagemDoBanco(error, 'Não foi possível vincular o plano.') }
}

// Início do período n (0 = o primeiro): a mesma conta de
// fn_plano_inicio_periodo no banco (e de petshop-app/src/lib/planos.ts).
export function inicioPeriodoPlano(inicioISO: string, periodicidade: string, intervaloDias: number | null, n: number): string {
  const [a, m, d] = inicioISO.slice(0, 10).split('-').map(Number)
  const somarMeses = (meses: number) => {
    const total = (m - 1) + meses
    const ano = a + Math.floor(total / 12)
    const mes = ((total % 12) + 12) % 12
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
    return new Date(Date.UTC(ano, mes, Math.min(d, ultimo)))
  }
  const somarDias = (dias: number) => new Date(Date.UTC(a, m - 1, d + dias))
  const data = periodicidade === 'mensal' ? somarMeses(n)
    : periodicidade === 'trimestral' ? somarMeses(3 * n)
    : periodicidade === 'semestral' ? somarMeses(6 * n)
    : periodicidade === 'anual' ? somarMeses(12 * n)
    : periodicidade === 'quinzenal' ? somarDias(15 * n)
    : somarDias((intervaloDias || 30) * n)
  return data.toISOString().slice(0, 10)
}

function diaAnterior(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10)
}

// O que acontece ao confirmar (fn_gerar_periodos_assinatura): o 1º período
// começa no início; uma cobrança pendente no início de cada período; com
// início no passado, os períodos até hoje já nascem com as cobranças.
export function previaAssinatura(inicioISO: string, periodicidade: string, intervaloDias: number | null, hojeISO: string) {
  const periodo = (n: number) => ({
    inicio: inicioPeriodoPlano(inicioISO, periodicidade, intervaloDias, n),
    fim: diaAnterior(inicioPeriodoPlano(inicioISO, periodicidade, intervaloDias, n + 1)),
  })
  let n = 0
  while (periodo(n).fim < hojeISO && n < 240) n++
  return { primeiro: periodo(0), cobrancasCriadas: n + 1, proximaCobranca: periodo(n + 1).inicio }
}
