// ============================================================
// Transporte de cada agendamento / VISITA — Kanban e Agenda
// ============================================================
// A solicitação de TaxiDog fica presa a um dos serviços da visita (mesmo
// pet, mesmo dia), mas vale pra visita inteira. Quando o cliente fez
// agendamentos separados no mesmo dia, cada um com o seu TaxiDog, vale o
// do próprio agendamento; sem ele, o da visita. Pode haver mais de uma por visita (uma trocada
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
  // Tem TaxiDog (pela rota ou pego pelo Kanban).
  temTaxiDog: boolean
}

export const chaveVisita = (idPet: string, data: string) => `${idPet}|${data}`

// O TaxiDog vale para a visita, mas foi pedido em UM agendamento (onde está
// a taxa). Nos outros agendamentos do pet no dia a tela diz de onde ele vem:
// "Banho Normal às 10:00". null = é deste agendamento (ou não há TaxiDog).
export function origemTaxiDogDaVisita(
  idAgendamento: string,
  transporte: TransporteVisita | null,
  daTela: { id_agendamento: string; hr_agendamento: string; nome_servico: string }[],
): { deOutro: boolean; descricao: string | null } {
  if (!transporte || transporte.id_agendamento === idAgendamento) return { deOutro: false, descricao: null }
  const dono = daTela.find(a => a.id_agendamento === transporte.id_agendamento)
  return { deOutro: true, descricao: dono ? `${dono.nome_servico} às ${dono.hr_agendamento.slice(0, 5)}` : null }
}

type AgendamentoVisita = { id_agendamento: string; id_pet: string; dt_agendamento: string }

// Devolve a função que acha o transporte de um agendamento.
export async function carregarTransportePorVisita(
  supabase: Supabase,
  agendamentos: AgendamentoVisita[],
): Promise<(a: AgendamentoVisita) => TransporteVisita | null> {
  const resultado = new Map<string, TransporteVisita>()
  const porAgendamento = new Map<string, TransporteVisita>()
  const transporteDe = (a: AgendamentoVisita) =>
    porAgendamento.get(a.id_agendamento) ?? resultado.get(chaveVisita(a.id_pet, a.dt_agendamento)) ?? null
  if (agendamentos.length === 0) return transporteDe

  type Corrida = {
    id_corrida: string; id_agendamento: string; modalidade: ModalidadeTaxiDog; status: string; valor: number | string
    cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string
    id_funcionario: string | null
    itens?: { feito: boolean }[] | null
  }
  const COLUNAS = 'id_corrida, id_agendamento, modalidade, status, valor, cep, logradouro, numero, complemento, bairro, cidade, uf, id_funcionario, created_at'
  const ids = agendamentos.map(a => a.id_agendamento)

  // Uma ida só: as corridas já com os passos de rota (migration 052). Se
  // essa relação não existir no banco, cai nas duas consultas de antes.
  let linhas: Corrida[]
  let naRota: Set<string>
  const junto = await supabase
    .from('taxidog_corrida')
    .select(`${COLUNAS}, itens:taxidog_parada_item ( feito )`)
    .in('id_agendamento', ids)
    .neq('status', 'cancelada')
    .order('created_at')
  if (!junto.error) {
    linhas = (junto.data ?? []) as unknown as Corrida[]
    naRota = new Set(linhas.filter(c => (c.itens ?? []).some(i => !i.feito)).map(c => c.id_corrida))
    if (linhas.length === 0) return transporteDe
  } else {
    const { data: corridas } = await supabase
      .from('taxidog_corrida')
      .select(COLUNAS)
      .in('id_agendamento', ids)
      .neq('status', 'cancelada')
      .order('created_at')
    linhas = (corridas ?? []) as unknown as Corrida[]
    if (linhas.length === 0) return transporteDe
    const { data: itens } = await supabase
      .from('taxidog_parada_item')
      .select('id_corrida')
      .eq('feito', false)
      .in('id_corrida', linhas.map(c => c.id_corrida))
    naRota = new Set(((itens ?? []) as { id_corrida: string }[]).map(i => i.id_corrida))
  }

  const agPorId = new Map(agendamentos.map(a => [a.id_agendamento, a]))
  const aberta = (s: string) => s !== 'concluida'
  // Em ordem de criação: a última concluída vence as anteriores, e a em
  // aberto vence qualquer concluída.
  for (const c of linhas) {
    const ag = agPorId.get(c.id_agendamento)
    if (!ag) continue
    const transporte: TransporteVisita = {
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
      temTaxiDog: !!c.id_funcionario,
    }
    const chave = chaveVisita(ag.id_pet, ag.dt_agendamento)
    const daVisita = resultado.get(chave)
    if (!(daVisita && aberta(daVisita.status) && !aberta(c.status))) resultado.set(chave, transporte)
    const doAgendamento = porAgendamento.get(c.id_agendamento)
    if (!(doAgendamento && aberta(doAgendamento.status) && !aberta(c.status))) porAgendamento.set(c.id_agendamento, transporte)
  }
  return transporteDe
}
