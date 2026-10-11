import type { createClient } from '@/lib/supabase/server'
import {
  COLUNAS_ADICIONAL,
  adicionalValePara,
  faltaMigrationAdicionais,
  lerAdicionais,
  mensagemErroAdicional,
  type AdicionalEscolhido,
  type ServicoAdicional,
} from '@/lib/adicionais'

// Parte de servidor dos serviços adicionais no agendamento do cliente
// (migration 095). Fora de um arquivo 'use server' porque recebem o client
// do Supabase — quem chama são as actions de agendar e as páginas.

type Supabase = Awaited<ReturnType<typeof createClient>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function reais(valor: number): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Os adicionais que a loja liberou para o agendamento online. Sem a
// migration (ou sem nenhum cadastrado), lista vazia: o agendamento segue
// como sempre foi.
export async function carregarAdicionaisOnline(supabase: Supabase, idLojista: string): Promise<ServicoAdicional[]> {
  const { data, error } = await supabase
    .from('servico_adicional')
    .select(COLUNAS_ADICIONAL)
    .eq('id_lojista', idLojista)
    .eq('status', 'Ativo')
    .eq('disponivel_online', true)
    .is('excluido_em', null)
    .order('nome')
  if (error) return []
  return lerAdicionais(data)
}

// Lê o campo "adicionais" do formulário de agendamento:
// [{ id_servico, id_adicional, preco }]. Vazio quando o cliente não escolheu
// nenhum (ou a tela nem manda o campo).
export function lerAdicionaisDoFormulario(formData: FormData): { itens: AdicionalEscolhido[]; erro?: string } {
  const bruto = formData.get('adicionais')
  if (typeof bruto !== 'string' || !bruto.trim()) return { itens: [] }
  let lista: unknown
  try {
    lista = JSON.parse(bruto)
  } catch {
    return { itens: [], erro: 'Serviços adicionais inválidos.' }
  }
  if (!Array.isArray(lista) || lista.length > 40) return { itens: [], erro: 'Serviços adicionais inválidos.' }
  const itens: AdicionalEscolhido[] = []
  for (const x of lista as Array<Record<string, unknown>>) {
    const idServico = String(x?.id_servico ?? '')
    const idAdicional = String(x?.id_adicional ?? '')
    const preco = Number(x?.preco)
    if (!UUID_RE.test(idServico) || !UUID_RE.test(idAdicional) || !Number.isFinite(preco) || preco < 0) {
      return { itens: [], erro: 'Serviços adicionais inválidos.' }
    }
    if (!itens.some(i => i.id_servico === idServico && i.id_adicional === idAdicional)) {
      itens.push({ id_servico: idServico, id_adicional: idAdicional, preco })
    }
  }
  return { itens }
}

// Antes de criar o agendamento: cada adicional escolhido ainda existe, está
// liberado para o online, vale para o serviço e custa o que o cliente viu.
// Se algo mudou, nada é criado — a tela recebe a lista atual e o cliente
// confere o resumo de novo.
export async function validarAdicionaisEscolhidos(
  supabase: Supabase,
  idLojista: string,
  idsServicos: string[],
  escolhidos: AdicionalEscolhido[],
): Promise<{ erro?: string; adicionaisAtuais?: ServicoAdicional[] }> {
  if (escolhidos.length === 0) return {}
  const atuais = await carregarAdicionaisOnline(supabase, idLojista)
  const porId = new Map(atuais.map(a => [a.id_adicional, a]))
  for (const e of escolhidos) {
    const a = porId.get(e.id_adicional)
    if (!a || !idsServicos.includes(e.id_servico) || !adicionalValePara(a, e.id_servico)) {
      return { erro: 'Um dos serviços adicionais escolhidos não está mais disponível. Confira o resumo e confirme de novo.', adicionaisAtuais: atuais }
    }
    if (Math.abs(a.preco - e.preco) >= 0.005) {
      return { erro: `O preço de "${a.nome}" mudou para ${reais(a.preco)}. Confira o resumo e confirme de novo.`, adicionaisAtuais: atuais }
    }
  }
  return {}
}

// Depois de criar o pedido: grava os adicionais nos agendamentos que
// acabaram de nascer (o banco confere tudo de novo e usa o preço do
// cadastro). Se falhar, o agendamento já existe — volta um aviso pra tela
// mostrar, em vez de fingir que deu certo.
export async function aplicarAdicionaisDoPedido(
  supabase: Supabase,
  idsAgendamento: string[],
  escolhidos: AdicionalEscolhido[],
): Promise<{ aviso?: string }> {
  if (escolhidos.length === 0 || idsAgendamento.length === 0) return {}
  const { error } = await supabase.rpc('fn_adicionais_do_cliente_no_pedido', {
    p_ids_agendamento: idsAgendamento,
    p_itens: escolhidos.map(e => ({ id_servico: e.id_servico, id_adicional: e.id_adicional })),
  })
  if (!error) return {}
  console.error('[adicionais do pedido] erro:', error.code, error.message)
  const motivo = faltaMigrationAdicionais(error) ? null : mensagemErroAdicional(error.message)
  return {
    aviso: `O agendamento foi criado, mas não deu para incluir os serviços adicionais${motivo ? ` (${motivo.replace(/\.$/, '')})` : ''}. Fale com a loja para combinar.`,
  }
}
