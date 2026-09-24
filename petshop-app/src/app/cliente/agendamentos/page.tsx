import { createClient } from '@/lib/supabase/server'
import AgendamentosClienteList, { type AgendamentoCliente, type ProdutoComprado, type TaxiDogCliente } from '@/components/cliente/AgendamentosClienteList'
import type { AvaliacaoExistente } from '@/components/cliente/AvaliacaoModal'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Meus Agendamentos' }

export default async function AgendamentosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: agendamentos }, { data: avaliacoesRaw }, { data: itensProdutoRaw }] = await Promise.all([
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
  ])

  const avaliacoes: Record<string, AvaliacaoExistente> = {}
  for (const a of (avaliacoesRaw ?? []) as Array<AvaliacaoExistente & { id_agendamento: string }>) {
    avaliacoes[a.id_agendamento] = { id_avaliacao: a.id_avaliacao, nota: a.nota, comentario: a.comentario }
  }

  const idsProdutos = [...new Set((itensProdutoRaw ?? []).map(i => i.id_produto))]
  const { data: produtosInfoRaw } = idsProdutos.length > 0
    ? await supabase.from('produto').select('id_produto, nome, unidade_venda').in('id_produto', idsProdutos)
    : { data: [] as { id_produto: string; nome: string; unidade_venda: string }[] }
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

  // TaxiDog (migration 042) — consulta tolerante: sem a migration, a
  // tabela não existe e a lista segue igual. RLS "cliente ve proprias".
  const { data: corridasRaw } = await supabase
    .from('taxidog_corrida')
    .select('id_agendamento, modalidade, status, valor, logradouro, numero, bairro, cidade, id_funcionario')
    .eq('id_cliente', user!.id)
    .order('created_at')

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
      />
    </>
  )
}
