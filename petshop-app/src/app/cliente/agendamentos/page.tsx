import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import AgendamentosClienteList, { type AgendamentoCliente, type PagamentoCliente, type ProdutoComprado, type TaxiDogCliente } from '@/components/cliente/AgendamentosClienteList'
import { normalizarFormasLoja } from '@/lib/pagamento'
import type { AvaliacaoExistente } from '@/components/cliente/AvaliacaoModal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Agendamentos' }

export default async function AgendamentosPage() {
  const supabase = await createClient()
  const user = await obterUsuario()

  const [
    { data: agendamentos }, { data: avaliacoesRaw }, { data: itensProdutoRaw },
    { data: corridasRaw }, { data: pagamentosRaw, error: pagamentosErro },
  ] = await Promise.all([
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, id_pet, id_lojista, dt_agendamento, hr_agendamento, status, valor, obs, created_at,
        pet:id_pet ( nome, raca ),
        servico:id_servico ( nome, duracao ),
        lojista:id_lojista ( nome_loja, telefone )
      `)
      .eq('id_cliente', user!.id)
      .order('dt_agendamento', { ascending: false })
      .order('hr_agendamento', { ascending: false }),
    // Só as avaliações que o próprio cliente escreveu — a policy
    // "avaliacao: cliente ve proprias" (migration 034) já garante isso;
    // o .eq é a segunda camada, não a única.
    supabase
      .from('avaliacao')
      .select('id_avaliacao, id_agendamento, nota, comentario')
      .eq('id_cliente', user!.id),
    // Produtos comprados junto de algum agendamento (migration 039).
    // Consulta separada de `produto` (sem embed) de propósito: é uma
    // relação nova, e um embed logo após a migration pode esbarrar no
    // cache de schema do PostgREST ainda não ter sido atualizado.
    supabase
      .from('agendamento_produto')
      .select('id_agendamento, id_produto, quantidade, preco_unitario')
      .eq('id_cliente', user!.id),
    // TaxiDog (migration 042) — consulta tolerante: sem a migration, a
    // tabela não existe e a lista segue igual. RLS "cliente ve proprias".
    supabase
      .from('taxidog_corrida')
      .select('id_agendamento, modalidade, status, valor, logradouro, numero, bairro, cidade, id_funcionario')
      .eq('id_cliente', user!.id)
      .order('created_at'),
    // Pagamento (migration 057) — consulta tolerante como a do TaxiDog.
    supabase
      .from('agendamento')
      .select('id_agendamento, id_lojista, forma_pagamento, status_pagamento')
      .eq('id_cliente', user!.id),
  ])

  const avaliacoes: Record<string, AvaliacaoExistente> = {}
  for (const a of (avaliacoesRaw ?? []) as Array<AvaliacaoExistente & { id_agendamento: string }>) {
    avaliacoes[a.id_agendamento] = { id_avaliacao: a.id_avaliacao, nota: a.nota, comentario: a.comentario }
  }

  const idsProdutos = [...new Set((itensProdutoRaw ?? []).map(i => i.id_produto))]
  const linhasPagamento = (pagamentosErro ? [] : pagamentosRaw ?? []) as Array<{ id_agendamento: string; id_lojista: string; forma_pagamento: string | null; status_pagamento: string | null }>
  // Chave Pix só das lojas com Pix ainda por pagar.
  const lojasComPix = [...new Set(linhasPagamento.filter(l => l.forma_pagamento === 'pix' && l.status_pagamento === 'pendente').map(l => l.id_lojista))]
  // Nomes dos produtos e Pix das lojas saem juntos.
  const [{ data: produtosInfoRaw }, pixDaLojaLista] = await Promise.all([
    idsProdutos.length > 0
      ? supabase.from('produto').select('id_produto, nome, unidade_venda').in('id_produto', idsProdutos)
      : Promise.resolve({ data: [] as { id_produto: string; nome: string; unidade_venda: string }[] }),
    Promise.all(lojasComPix.map(async id => {
      const { data } = await supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: id })
      const formas = normalizarFormasLoja(data)
      return [id, formas.pix && formas.pix_chave ? { chave: formas.pix_chave, nome: formas.pix_nome } : null] as const
    })),
  ])
  const pixDaLoja = new Map(pixDaLojaLista)
  const infoPorProduto = new Map((produtosInfoRaw ?? []).map(p => [p.id_produto, p]))

  const produtosComprados: Record<string, ProdutoComprado[]> = {}
  for (const item of itensProdutoRaw ?? []) {
    const info = infoPorProduto.get(item.id_produto)
    if (!info) continue
    ;(produtosComprados[item.id_agendamento] ??= []).push({
      nome: info.nome,
      unidade_venda: info.unidade_venda,
      quantidade: Number(item.quantidade),
      preco_unitario: Number(item.preco_unitario),
    })
  }

  // A loja pode trocar o transporte (migration 052): o agendamento fica
  // com a solicitação antiga cancelada e a nova — vale a mais recente que
  // não foi cancelada.
  const taxidog: Record<string, TaxiDogCliente> = {}
  for (const c of (corridasRaw ?? []) as Array<Record<string, string | number | null>>) {
    const atual = taxidog[c.id_agendamento as string]
    if (atual && atual.status !== 'cancelada' && c.status === 'cancelada') continue
    taxidog[c.id_agendamento as string] = {
      modalidade: c.modalidade as TaxiDogCliente['modalidade'],
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

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Meus Agendamentos</h1>
        <p className="page-subtitle">Seus próximos horários e o histórico de atendimentos</p>
      </div>

      <AgendamentosClienteList
        agendamentos={(agendamentos ?? []) as unknown as AgendamentoCliente[]}
        avaliacoes={avaliacoes}
        produtosComprados={produtosComprados}
        taxidog={taxidog}
        pagamentos={pagamentos}
      />
    </>
  )
}
