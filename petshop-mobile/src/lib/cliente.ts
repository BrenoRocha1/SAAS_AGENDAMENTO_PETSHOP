// Dados da conta do CLIENTE — espelha o que as páginas /cliente/* do
// painel web carregam (a RLS já entrega só o que é dele; o .eq é a
// segunda camada).
import { supabase } from '@/lib/supabase'
import { agoraBrasilHHMM, hojeBrasilISO } from '@/lib/agenda'
import { normalizarFormasLoja } from '@/lib/pagamento'
import type { StatusAgendamento } from '@/lib/statusAgendamento'
import type { ModalidadeTaxiDog } from '@/lib/taxidog'

export interface AgendamentoCliente {
  id_agendamento: string
  id_pet: string | null
  id_lojista: string
  dt_agendamento: string
  hr_agendamento: string
  status: StatusAgendamento
  valor: number
  obs: string | null
  created_at: string
  pet: { nome: string; raca: string | null } | null
  servico: { nome: string; duracao: number } | null
  lojista: { nome_loja: string; telefone: string | null } | null
}

export interface AvaliacaoExistente { id_avaliacao: string; nota: number; comentario: string | null }
export interface ProdutoComprado { nome: string; unidade_venda: string; quantidade: number; preco_unitario: number }
export interface TaxiDogCliente { modalidade: ModalidadeTaxiDog; status: string; valor: number; endereco: string; temTaxiDog: boolean }
export interface PagamentoCliente { forma: string | null; status: string | null; pix: { chave: string; nome: string | null } | null }

// Um cartão = um agendamento feito de uma vez. Um carrinho com vários
// serviços vira vários agendamentos no banco, todos gravados na mesma
// transação — mesmo created_at —, então é por ele (junto de loja, pet e
// dia) que os serviços se juntam.
export interface Visita {
  chave: string
  dt: string
  itens: AgendamentoCliente[]
  status: StatusAgendamento
  valor: number
  criadoEm: string
  taxidog: TaxiDogCliente | null
  produtos: ProdutoComprado[]
  pagamento: PagamentoCliente | null
}

export interface DadosAgendamentosCliente {
  visitas: Visita[]
  avaliacoes: Record<string, AvaliacaoExistente>
  // id do agendamento → nome do plano que cobre o serviço (migration 075).
  noPlano: Record<string, string>
}

const ORDEM: StatusAgendamento[] = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído']

// Status da visita: o do serviço "mais atrasado" entre os não cancelados
// (banho Finalizado + tosa Em andamento = Em andamento); tudo cancelado =
// Cancelado.
function statusDaVisita(itens: AgendamentoCliente[]): StatusAgendamento {
  const ativos = itens.filter(i => i.status !== 'Cancelado')
  if (ativos.length === 0) return 'Cancelado'
  return ativos.reduce((menor, i) => (ORDEM.indexOf(i.status) < ORDEM.indexOf(menor) ? i.status : menor), ativos[0].status)
}

export const primeiraHora = (v: Visita) => (v.itens.find(i => i.status !== 'Cancelado') ?? v.itens[0]).hr_agendamento

export const visitaAtiva = (v: Visita, hoje = hojeBrasilISO()) =>
  (v.status === 'Pendente' || v.status === 'Confirmado' || v.status === 'Em andamento') && v.dt >= hoje

// O horário ainda não chegou? (o cliente só cancela/altera antes dele —
// mesma regra do banco.)
export function horarioAindaVem(ag: { dt_agendamento: string; hr_agendamento: string }): boolean {
  const hoje = hojeBrasilISO()
  return ag.dt_agendamento > hoje || (ag.dt_agendamento === hoje && ag.hr_agendamento.slice(0, 5) > agoraBrasilHHMM())
}

export async function carregarAgendamentosDoCliente(idCliente: string): Promise<{ dados?: DadosAgendamentosCliente; erro?: string }> {
  const [ags, avals, itens, corridas, pagos, noPlanoRes] = await Promise.all([
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, id_pet, id_lojista, dt_agendamento, hr_agendamento, status, valor, obs, created_at,
        pet:id_pet ( nome, raca ),
        servico:id_servico ( nome, duracao ),
        lojista:id_lojista ( nome_loja, telefone )
      `)
      .eq('id_cliente', idCliente)
      .order('dt_agendamento', { ascending: false })
      .order('hr_agendamento', { ascending: false }),
    supabase.from('avaliacao').select('id_avaliacao, id_agendamento, nota, comentario').eq('id_cliente', idCliente),
    // Sem embed de `produto` de propósito (relação de migration nova).
    supabase.from('agendamento_produto').select('id_agendamento, id_produto, quantidade, preco_unitario').eq('id_cliente', idCliente),
    supabase
      .from('taxidog_corrida')
      .select('id_agendamento, modalidade, status, valor, logradouro, numero, bairro, cidade, id_funcionario')
      .eq('id_cliente', idCliente)
      .order('created_at'),
    supabase.from('agendamento').select('id_agendamento, id_lojista, forma_pagamento, status_pagamento').eq('id_cliente', idCliente),
    supabase.rpc('fn_meus_agendamentos_no_plano'),
  ])
  if (ags.error) return { erro: 'Não foi possível carregar os seus agendamentos.' }
  const agendamentos = ((ags.data ?? []) as unknown as AgendamentoCliente[]).map(a => ({ ...a, valor: Number(a.valor) }))

  const avaliacoes: Record<string, AvaliacaoExistente> = {}
  for (const a of (avals.data ?? []) as (AvaliacaoExistente & { id_agendamento: string })[]) {
    avaliacoes[a.id_agendamento] = { id_avaliacao: a.id_avaliacao, nota: a.nota, comentario: a.comentario }
  }

  // Cada parte abaixo depende de uma migration diferente: tolerante a erro.
  const linhasItens = (itens.error ? [] : itens.data ?? []) as { id_agendamento: string; id_produto: string; quantidade: number; preco_unitario: number }[]
  const linhasPagamento = (pagos.error ? [] : pagos.data ?? []) as { id_agendamento: string; id_lojista: string; forma_pagamento: string | null; status_pagamento: string | null }[]
  const idsProdutos = [...new Set(linhasItens.map(i => i.id_produto))]
  // Chave Pix só das lojas com Pix ainda por pagar.
  const lojasComPix = [...new Set(linhasPagamento.filter(l => l.forma_pagamento === 'pix' && l.status_pagamento === 'pendente').map(l => l.id_lojista))]

  const [infoProdutos, pixLista] = await Promise.all([
    idsProdutos.length > 0
      ? supabase.from('produto').select('id_produto, nome, unidade_venda').in('id_produto', idsProdutos)
      : Promise.resolve({ data: [] as { id_produto: string; nome: string; unidade_venda: string }[] }),
    Promise.all(lojasComPix.map(async id => {
      const { data } = await supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: id })
      const formas = normalizarFormasLoja(data)
      return [id, formas.pix && formas.pix_chave ? { chave: formas.pix_chave, nome: formas.pix_nome } : null] as const
    })),
  ])
  const pixDaLoja = new Map(pixLista)
  const infoPorProduto = new Map(((infoProdutos.data ?? []) as { id_produto: string; nome: string; unidade_venda: string }[]).map(p => [p.id_produto, p]))

  const produtos: Record<string, ProdutoComprado[]> = {}
  for (const item of linhasItens) {
    const info = infoPorProduto.get(item.id_produto)
    if (!info) continue
    ;(produtos[item.id_agendamento] ??= []).push({
      nome: info.nome,
      unidade_venda: info.unidade_venda,
      quantidade: Number(item.quantidade),
      preco_unitario: Number(item.preco_unitario),
    })
  }

  // A loja pode trocar o transporte: fica a solicitação antiga cancelada e
  // a nova — vale a mais recente que não foi cancelada.
  const taxidog: Record<string, TaxiDogCliente> = {}
  for (const c of (corridas.error ? [] : corridas.data ?? []) as Record<string, string | number | null>[]) {
    const id = c.id_agendamento as string
    const atual = taxidog[id]
    if (atual && atual.status !== 'cancelada' && c.status === 'cancelada') continue
    taxidog[id] = {
      modalidade: c.modalidade as ModalidadeTaxiDog,
      status: c.status as string,
      valor: Number(c.valor),
      endereco: `${c.logradouro}, ${c.numero} · ${c.bairro} · ${c.cidade}`,
      temTaxiDog: !!c.id_funcionario,
    }
  }

  const pagamentos: Record<string, PagamentoCliente> = {}
  for (const l of linhasPagamento) {
    pagamentos[l.id_agendamento] = {
      forma: l.forma_pagamento,
      status: l.status_pagamento,
      pix: l.forma_pagamento === 'pix' ? pixDaLoja.get(l.id_lojista) ?? null : null,
    }
  }

  const noPlano: Record<string, string> = {}
  for (const l of (noPlanoRes.error ? [] : noPlanoRes.data ?? []) as { id_agendamento: string; plano: string }[]) {
    noPlano[l.id_agendamento] = l.plano
  }

  const grupos = new Map<string, AgendamentoCliente[]>()
  for (const ag of agendamentos) {
    const chave = `${ag.id_lojista}|${ag.id_pet}|${ag.dt_agendamento}|${ag.created_at}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), ag])
  }
  const visitas: Visita[] = [...grupos.entries()].map(([chave, lista]) => {
    const itensDaVisita = [...lista].sort((a, b) => a.hr_agendamento.localeCompare(b.hr_agendamento))
    const status = statusDaVisita(itensDaVisita)
    const contam = status === 'Cancelado' ? itensDaVisita : itensDaVisita.filter(i => i.status !== 'Cancelado')
    return {
      chave,
      dt: itensDaVisita[0].dt_agendamento,
      itens: itensDaVisita,
      status,
      valor: contam.reduce((soma, i) => soma + i.valor, 0),
      criadoEm: itensDaVisita.reduce((min, i) => (i.created_at < min ? i.created_at : min), itensDaVisita[0].created_at),
      taxidog: itensDaVisita.map(i => taxidog[i.id_agendamento]).find(Boolean) ?? null,
      produtos: itensDaVisita.flatMap(i => produtos[i.id_agendamento] ?? []),
      pagamento: itensDaVisita.map(i => pagamentos[i.id_agendamento]).find(p => p?.forma) ?? null,
    }
  })

  return { dados: { visitas, avaliacoes, noPlano } }
}
