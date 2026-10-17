'use server'

// Server Actions dos planos e cobranças recorrentes (migration 060).
// Quem pode e as regras (loja, limites de uso, forma aceita, assinatura
// ativa…) ficam nas funções do banco — aqui só validação de formato.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { obterContextoLojista } from '@/lib/lojista-context'
import { ehFormaPagamento, type FormaPagamento } from '@/lib/pagamento'
import { mensagemErroPlano, type Assinatura, type BeneficioDoAgendamento, type ClienteParaPlano, type Periodicidade, type PetParaPlano } from '@/lib/planos'

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
): Promise<Resultado & { id_assinatura?: string }> {
  if (!UUID_RE.test(idPlano)) return { error: 'Escolha o plano.' }
  if (!UUID_RE.test(idPet)) return { error: 'Escolha o pet.' }
  if (!DATA_RE.test(dataInicio)) return { error: 'Escolha a data de início.' }
  if (forma !== null && !ehFormaPagamento(forma)) return { error: 'Forma de pagamento inválida.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_assinar_plano', {
    p_id_plano: idPlano,
    p_id_pet: idPet,
    p_data_inicio: dataInicio,
    p_forma_pagamento: forma,
  })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível vincular o plano.') }
  revalidarPlanos()
  return { success: true, id_assinatura: (data as string | null) ?? undefined }
}

// ── Atribuir plano pela tela de Planos ──
// Só leitura: quem assina continua sendo fn_assinar_plano (acima), que
// confere tudo de novo no banco (loja, plano ativo, pet do cliente da loja,
// plano repetido). A loja vem do contexto do servidor, nunca do navegador.

async function contextoDosPlanos() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, idLojista: null, erro: 'Não autenticado' }
  const contexto = await obterContextoLojista(supabase, user.id, user.user_metadata?.role)
  // Planos são financeiros: dono ou administrador (o mesmo da página).
  if (!contexto || (contexto.role === 'funcionario' && !contexto.acessoTotal)) {
    return { supabase, idLojista: null, erro: 'Apenas o responsável pela loja ou um administrador pode vincular planos' }
  }
  return { supabase, idLojista: contexto.idLojista, erro: null }
}

// Clientes da loja por nome ou telefone (os mesmos identificadores da
// busca do caixa). Sem termo, os primeiros em ordem alfabética.
export async function buscarClientesPlanoAction(busca: string): Promise<{ error?: string; clientes?: ClienteParaPlano[] }> {
  const { supabase, idLojista, erro } = await contextoDosPlanos()
  if (!idLojista) return { error: erro ?? 'Acesso não autorizado' }

  // Fora do que o filtro do PostgREST entende como sintaxe.
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
  if (error) return { error: 'Não foi possível buscar os clientes agora. Tente de novo.' }

  const clientes = ((data ?? []) as unknown as { cliente: ClienteParaPlano | null }[])
    .map(l => l.cliente)
    .filter((c): c is ClienteParaPlano => !!c)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 20)
  return { clientes }
}

// Pets ativos de um cliente da loja, com os planos que cada um já tem.
export async function petsDoClientePlanoAction(idCliente: string): Promise<{ error?: string; pets?: PetParaPlano[] }> {
  if (!UUID_RE.test(idCliente)) return { error: 'Cliente inválido.' }
  const { supabase, idLojista, erro } = await contextoDosPlanos()
  if (!idLojista) return { error: erro ?? 'Acesso não autorizado' }

  // O cliente precisa ser da loja — senão nem os pets aparecem.
  const { data: vinculo } = await supabase
    .from('cliente_lojista')
    .select('id_cliente')
    .eq('id_lojista', idLojista)
    .eq('id_cliente', idCliente)
    .maybeSingle()
  if (!vinculo) return { error: 'Cliente não encontrado entre os clientes da loja.' }

  const [{ data: pets, error }, { data: assinaturas }] = await Promise.all([
    supabase.from('pet').select('id_pet, nome, raca, especie, foto_url').eq('id_cliente', idCliente).eq('ativo', true).order('nome'),
    supabase.from('assinatura').select('id_pet, id_plano').eq('id_lojista', idLojista).eq('id_cliente', idCliente).eq('status', 'ativa'),
  ])
  if (error) return { error: 'Não foi possível carregar os pets agora. Tente de novo.' }

  const porPet = new Map<string, string[]>()
  for (const a of (assinaturas ?? []) as { id_pet: string; id_plano: string }[]) {
    porPet.set(a.id_pet, [...(porPet.get(a.id_pet) ?? []), a.id_plano])
  }
  return {
    pets: ((pets ?? []) as Omit<PetParaPlano, 'planos_ativos'>[]).map(p => ({ ...p, planos_ativos: porPet.get(p.id_pet) ?? [] })),
  }
}

export interface ResumoCancelamento {
  cobrancas_canceladas: number
  valor_cancelado: number
  agendamentos_devolvidos: number
}

// Cancelar resolve o que ficou em aberto (migration 069): cobranças em
// aberto (cancelar junto ou manter) e agendamentos ainda por fazer que
// usam o plano (voltam ao preço normal).
export async function cancelarAssinaturaAction(
  idAssinatura: string,
  motivo: string,
  opcoes: { cancelarCobrancas: boolean; devolverAgendamentos: boolean },
): Promise<Resultado & { resumo?: ResumoCancelamento }> {
  if (!UUID_RE.test(idAssinatura)) return { error: 'Assinatura inválida.' }
  if ((motivo ?? '').length > 300) return { error: 'Motivo muito longo (até 300 letras).' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_cancelar_assinatura', {
    p_id_assinatura: idAssinatura,
    p_motivo: motivo?.trim() || null,
    p_cancelar_cobrancas: opcoes.cancelarCobrancas,
    p_devolver_agendamentos: opcoes.devolverAgendamentos,
  })
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
      return { error: 'Para cancelar, execute a migration 069_cancelar_assinatura.sql.' }
    }
    return { error: mensagemErroPlano(error.message, 'Não foi possível cancelar a assinatura.') }
  }
  revalidarPlanos()
  revalidatePath('/lojista/agendamentos')
  revalidatePath('/lojista/kanban')
  return { success: true, resumo: data as ResumoCancelamento }
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

// Excluir (migration 104): com assinatura ativa o banco recusa; nunca
// assinado some de vez; só com assinaturas canceladas sai da lista e o
// histórico fica.
export async function excluirPlanoAction(idPlano: string): Promise<Resultado & { modo?: 'apagado' | 'arquivado' }> {
  if (!UUID_RE.test(idPlano)) return { error: 'Plano inválido.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_excluir_plano', { p_id_plano: idPlano })
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
      return { error: 'Para excluir planos, execute a migration 104_excluir_plano.sql.' }
    }
    return { error: mensagemErroPlano(error.message, 'Não foi possível excluir o plano.') }
  }
  revalidarPlanos()
  return { success: true, modo: data === 'apagado' ? 'apagado' : 'arquivado' }
}

// Detalhes de uma assinatura (cobranças, usos, histórico) para o painel da
// tela de Planos — a mesma função da ficha do cliente.
export async function detalheAssinaturaAction(idCliente: string, idAssinatura: string): Promise<{ error?: string; assinatura?: Assinatura }> {
  if (!UUID_RE.test(idCliente) || !UUID_RE.test(idAssinatura)) return { error: 'Assinatura inválida.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_assinaturas_da_loja', { p_id_cliente: idCliente, p_detalhes: true })
  if (error) return { error: mensagemErroPlano(error.message, 'Não foi possível abrir a assinatura.') }
  const assinatura = ((data ?? []) as Assinatura[]).find(a => a.id_assinatura === idAssinatura)
  return assinatura ? { assinatura } : { error: 'Assinatura não encontrada.' }
}
