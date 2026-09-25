'use server'

// Server Actions dos planos e cobranças recorrentes (migration 060).
// Quem pode e as regras (loja, limites de uso, forma aceita, assinatura
// ativa…) ficam nas funções do banco — aqui só validação de formato.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import { mensagemErroPlano, type BeneficioDoAgendamento, type Periodicidade } from '@/lib/planos'

type Resultado = { error?: string; success?: boolean }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const PERIODICIDADES: Periodicidade[] = ['mensal', 'quinzenal', 'trimestral', 'semestral', 'anual', 'personalizado']

function revalidarPlanos() {
  revalidatePath('/lojista/planos')
  revalidatePath('/lojista/clientes/[id]', 'page')
  revalidatePath('/lojista/pets/[id]', 'page')
  revalidatePath('/lojista/dashboard')
  revalidatePath('/lojista/relatorios')
}

export interface DadosPlano {
  id_plano: string | null
  nome: string
  descricao: string
  valor: number
  periodicidade: Periodicidade
  intervalo_dias: number | null
  servicos: { id_servico: string; quantidade: number }[]
}

export async function salvarPlanoAction(dados: DadosPlano): Promise<Resultado & { id_plano?: string }> {
  const nome = (dados.nome ?? '').trim()
  if (nome.length < 2 || nome.length > 100) return { error: 'Dê um nome ao plano (2 a 100 letras).' }
  if ((dados.descricao ?? '').length > 500) return { error: 'Descrição muito longa (até 500 letras).' }
  if (!Number.isFinite(dados.valor) || dados.valor < 0) return { error: 'Informe o valor do plano.' }
  if (!PERIODICIDADES.includes(dados.periodicidade)) return { error: 'Escolha o período de cobrança.' }
  if (dados.periodicidade === 'personalizado' && (!dados.intervalo_dias || dados.intervalo_dias < 1 || dados.intervalo_dias > 730)) {
    return { error: 'No período personalizado, informe a cada quantos dias (1 a 730).' }
  }
  if (!dados.servicos?.length) return { error: 'Inclua pelo menos um serviço no plano.' }
  for (const s of dados.servicos) {
    if (!UUID_RE.test(s.id_servico)) return { error: 'Serviço inválido.' }
    if (!Number.isInteger(s.quantidade) || s.quantidade < 1 || s.quantidade > 999) return { error: 'A quantidade de cada serviço deve ser de 1 a 999.' }
  }
  if (dados.id_plano && !UUID_RE.test(dados.id_plano)) return { error: 'Plano inválido.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_salvar_plano', {
    p_id_plano: dados.id_plano,
    p_nome: nome,
    p_descricao: dados.descricao?.trim() || null,
    p_valor: Math.round(dados.valor * 100) / 100,
    p_periodicidade: dados.periodicidade,
    p_intervalo_dias: dados.periodicidade === 'personalizado' ? dados.intervalo_dias : null,
    p_servicos: dados.servicos,
  })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível salvar o plano.') }
  revalidarPlanos()
  return { success: true, id_plano: data as string }
}

export async function alterarStatusPlanoAction(idPlano: string, ativo: boolean): Promise<Resultado> {
  if (!UUID_RE.test(idPlano)) return { error: 'Plano inválido.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_alterar_status_plano', { p_id_plano: idPlano, p_ativo: ativo })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível mudar o plano.') }
  revalidarPlanos()
  return { success: true }
}

export async function assinarPlanoAction(
  idPlano: string,
  idPet: string,
  dataInicio: string,
  forma: FormaPagamento | null,
): Promise<Resultado> {
  if (!UUID_RE.test(idPlano)) return { error: 'Escolha o plano.' }
  if (!UUID_RE.test(idPet)) return { error: 'Escolha o pet.' }
  if (!DATA_RE.test(dataInicio)) return { error: 'Escolha a data de início.' }
  if (forma !== null && !ehFormaPagamento(forma)) return { error: 'Forma de pagamento inválida.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_assinar_plano', {
    p_id_plano: idPlano,
    p_id_pet: idPet,
    p_data_inicio: dataInicio,
    p_forma_pagamento: forma,
  })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível vincular o plano.') }
  revalidarPlanos()
  return { success: true }
}

export async function cancelarAssinaturaAction(idAssinatura: string, motivo: string): Promise<Resultado> {
  if (!UUID_RE.test(idAssinatura)) return { error: 'Assinatura inválida.' }
  if ((motivo ?? '').length > 300) return { error: 'Motivo muito longo (até 300 letras).' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cancelar_assinatura', { p_id_assinatura: idAssinatura, p_motivo: motivo?.trim() || null })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível cancelar a assinatura.') }
  revalidarPlanos()
  return { success: true }
}

export async function atualizarCobrancaPlanoAction(
  idCobranca: string,
  forma: FormaPagamento | null,
  status: 'pendente' | 'pago' | 'cancelado',
): Promise<Resultado> {
  if (!UUID_RE.test(idCobranca)) return { error: 'Cobrança inválida.' }
  if (forma !== null && !ehFormaPagamento(forma)) return { error: 'Forma de pagamento inválida.' }
  if (!['pendente', 'pago', 'cancelado'].includes(status)) return { error: 'Status inválido.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_atualizar_cobranca_plano', { p_id_cobranca: idCobranca, p_forma: forma, p_status: status })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível atualizar a cobrança.') }
  revalidarPlanos()
  return { success: true }
}

// ── Benefícios no agendamento ──

export async function beneficioDoAgendamentoAction(idAgendamento: string): Promise<BeneficioDoAgendamento | null> {
  if (!UUID_RE.test(idAgendamento)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_beneficio_do_agendamento', { p_id_agendamento: idAgendamento })
  if (error || !data) return null
  return data as BeneficioDoAgendamento
}

function revalidarAgenda() {
  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/kanban')
  revalidarPlanos()
}

export async function usarBeneficioAction(idAgendamento: string): Promise<Resultado & { usados?: number; quantidade?: number }> {
  if (!UUID_RE.test(idAgendamento)) return { error: 'Agendamento inválido.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_usar_beneficio', { p_id_agendamento: idAgendamento })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível usar o benefício.') }
  revalidarAgenda()
  const r = data as { usados: number; quantidade: number }
  return { success: true, usados: r?.usados, quantidade: r?.quantidade }
}

export async function estornarBeneficioAction(idAgendamento: string): Promise<Resultado> {
  if (!UUID_RE.test(idAgendamento)) return { error: 'Agendamento inválido.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_estornar_beneficio', { p_id_agendamento: idAgendamento, p_motivo: null })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível desfazer o uso.') }
  revalidarAgenda()
  return { success: true }
}
