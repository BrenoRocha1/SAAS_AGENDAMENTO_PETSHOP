// ============================================================
// Transporte de cada VISITA (mesmo pet, mesmo dia) — Kanban e Agenda
// ============================================================
// A solicitação de TaxiDog fica presa a um dos serviços da visita, mas
// vale pra visita inteira. Pode haver mais de uma por visita (uma trocada
// e cancelada, uma busca concluída + a entrega pedida depois): vale a em
// aberto; sem ela, a concluída mais recente. Canceladas não contam.
// Consultas tolerantes: sem as migrations 042/052 as tabelas não existem
// e a tela só fica sem o transporte.

import type { createClient } from '@/lib/supabase/server'
import type { EnderecoTaxiDog, ModalidadeTaxiDog } from '@/lib/taxidog'

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface TransporteVisita {
  id_corrida: string
  // Serviço que carrega a taxa (os outros da visita não somam de novo).
  id_agendamento: string
  modalidade: ModalidadeTaxiDog
  status: string
  valor: number
  endereco: EnderecoTaxiDog
  // O próximo trecho (busca ou entrega) já está numa rota.
  naRota: boolean
}

export const chaveVisita = (idPet: string, data: string) => `${idPet}|${data}`

export async function carregarTransportePorVisita(
  supabase: Supabase,
  agendamentos: { id_agendamento: string; id_pet: string; dt_agendamento: string }[],
): Promise<Map<string, TransporteVisita>> {
  const resultado = new Map<string, TransporteVisita>()
  if (agendamentos.length === 0) return resultado

  const { data: corridas } = await supabase
    .from('taxidog_corrida')
    .select('id_corrida, id_agendamento, modalidade, status, valor, cep, logradouro, numero, complemento, bairro, cidade, uf, created_at')
    .in('id_agendamento', agendamentos.map(a => a.id_agendamento))
    .neq('status', 'cancelada')
    .order('created_at')
  const linhas = (corridas ?? []) as Array<{
    id_corrida: string; id_agendamento: string; modalidade: ModalidadeTaxiDog; status: string; valor: number | string
    cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string
  }>
  if (linhas.length === 0) return resultado

  const { data: itens } = await supabase
    .from('taxidog_parada_item')
    .select('id_corrida')
    .eq('feito', false)
    .in('id_corrida', linhas.map(c => c.id_corrida))
  const naRota = new Set(((itens ?? []) as { id_corrida: string }[]).map(i => i.id_corrida))

  const agPorId = new Map(agendamentos.map(a => [a.id_agendamento, a]))
  const aberta = (s: string) => s !== 'concluida'
  // Em ordem de criação: a última concluída vence as anteriores, e a em
  // aberto vence qualquer concluída.
  for (const c of linhas) {
    const ag = agPorId.get(c.id_agendamento)
    if (!ag) continue
    const chave = chaveVisita(ag.id_pet, ag.dt_agendamento)
    const atual = resultado.get(chave)
    if (atual && aberta(atual.status) && !aberta(c.status)) continue
    resultado.set(chave, {
      id_corrida: c.id_corrida,
      id_agendamento: c.id_agendamento,
      modalidade: c.modalidade,
      status: c.status,
      valor: Number(c.valor),
      endereco: {
        cep: c.cep,
        logradouro: c.logradouro,
        numero: c.numero,
        complemento: c.complemento ?? '',
        bairro: c.bairro,
        cidade: c.cidade,
        uf: c.uf,
      },
      naRota: naRota.has(c.id_corrida),
    })
  }
  return resultado
}
