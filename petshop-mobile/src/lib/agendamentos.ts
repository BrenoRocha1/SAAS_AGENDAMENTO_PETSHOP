// Ações da agenda pelo celular. São as mesmas do painel web
// (petshop-app/src/lib/actions.ts), pelo mesmo caminho do banco: as regras
// de verdade (quem pode, conflito de horário, loja fechada, TaxiDog, plano)
// estão nas funções SQL e na RLS — aqui só a conversa com elas e as
// mensagens.
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO } from '@/lib/agenda'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { linkWhatsApp, formatarMoeda } from '@/lib/format'
import { urlDoSite } from '@/lib/site'
import type { ContextoLojista } from '@/lib/lojistaContext'
import { ORDEM_ETAPA, etapaEncerrada, etapaExigeDia, type StatusAgendamento } from '@/lib/statusAgendamento'
import type { FormaPagamento, StatusPagamento } from '@/lib/pagamento'
import { buscaQueNaoChegou, type ModalidadeTaxiDog } from '@/lib/taxidog'

export interface TransporteDaVisita {
  id_corrida: string
  id_agendamento: string
  status: string
  modalidade: ModalidadeTaxiDog
  valor: number
  // Em uma linha, como o site escreve (rua, número · complemento · bairro · cidade - UF).
  endereco: string
  // Os campos, para reabrir o endereço na troca do transporte.
  enderecoCampos: { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string }
  temTaxiDog: boolean
  // O próximo trecho (busca ou entrega) já está numa rota.
  naRota: boolean
}

// fn_beneficio_do_agendamento: o serviço no plano do pet.
export interface BeneficioDoAgendamento {
  usado: { id_utilizacao: string; plano: string; valor_abatido: number; em: string } | null
  disponivel: { id_assinatura: string; plano: string; quantidade: number; usados: number } | null
}

export interface ProdutoDoAgendamento {
  nome: string
  unidade_venda: string
  quantidade: number
  preco_unitario: number
}

export interface AgendamentoDetalhe {
  id_agendamento: string
  id_lojista: string
  id_cliente: string | null
  id_pet: string | null
  id_servico: string
  dt_agendamento: string
  hr_agendamento: string
  status: StatusAgendamento
  valor: number
  obs: string | null
  id_funcionario: string | null
  cancelado_por: string | null
  motivo_cancelamento: string | null
  pet: { nome: string; raca: string | null; especie: string | null; porte: string | null; foto_url: string | null } | null
  servico: { nome: string; duracao: number } | null
  cliente: { nome: string; telefone: string | null } | null
  funcionario: { nome: string } | null
  // Migration 057 — null se a coluna ainda não existe.
  forma_pagamento: string | null
  status_pagamento: string | null
  transporte: TransporteDaVisita | null
  produtos: ProdutoDoAgendamento[]
  // Benefício do plano usado neste agendamento (migration 060).
  plano: string | null
  // O bloco "Plano" inteiro: usado ou ainda disponível no período.
  beneficio: BeneficioDoAgendamento | null
  // De onde veio o pedido (migration 049) — null se a coluna não existe.
  origem: 'loja' | 'online' | null
}

export async function carregarAgendamento(id: string): Promise<{ dados?: AgendamentoDetalhe; erro?: string }> {
  const { data, error } = await supabase
    .from('agendamento')
    .select(`
      id_agendamento, id_lojista, id_cliente, id_pet, id_servico, dt_agendamento, hr_agendamento,
      status, valor, obs, id_funcionario, cancelado_por, motivo_cancelamento,
      pet:id_pet ( nome, raca, especie, porte, foto_url ),
      servico:id_servico ( nome, duracao ),
      cliente:id_cliente ( nome, telefone ),
      funcionario:id_funcionario ( nome )
    `)
    .eq('id_agendamento', id)
    .maybeSingle()
  if (error) return { erro: 'Não foi possível carregar este agendamento.' }
  if (!data) return { erro: 'Agendamento não encontrado.' }
  const base = data as unknown as Omit<AgendamentoDetalhe, 'forma_pagamento' | 'status_pagamento' | 'transporte' | 'produtos' | 'plano' | 'beneficio' | 'origem'>

  // O resto é tolerante: cada parte depende de uma migration diferente e
  // nenhuma pode derrubar a tela.
  const [pagamento, transporte, produtos, plano, origem] = await Promise.all([
    supabase.from('agendamento').select('forma_pagamento, status_pagamento').eq('id_agendamento', id).maybeSingle(),
    carregarTransporteDaVisita(base),
    carregarProdutos(id),
    supabase.rpc('fn_beneficio_do_agendamento', { p_id_agendamento: id }),
    supabase.from('agendamento').select('origem').eq('id_agendamento', id).maybeSingle(),
  ])
  const pg = pagamento.error ? null : (pagamento.data as { forma_pagamento: string | null; status_pagamento: string | null } | null)
  const beneficio = plano.error || !plano.data ? null : (plano.data as BeneficioDoAgendamento)
  const og = origem.error ? null : ((origem.data as { origem: string | null } | null)?.origem ?? null)

  return {
    dados: {
      ...base,
      valor: Number(base.valor),
      forma_pagamento: pg?.forma_pagamento ?? null,
      status_pagamento: pg?.status_pagamento ?? null,
      transporte,
      produtos,
      plano: beneficio?.usado?.plano ?? null,
      beneficio,
      origem: og === 'loja' || og === 'online' ? og : null,
    },
  }
}

// TaxiDog da VISITA (mesmo pet, mesmo dia) — é um por visita, e pode
// estar preso a outro serviço marcado junto.
async function carregarTransporteDaVisita(a: { id_agendamento: string; id_lojista: string; id_pet: string | null; dt_agendamento: string }): Promise<TransporteDaVisita | null> {
  if (!a.id_pet) return null
  const { data: visita } = await supabase
    .from('agendamento')
    .select('id_agendamento')
    .eq('id_lojista', a.id_lojista)
    .eq('id_pet', a.id_pet)
    .eq('dt_agendamento', a.dt_agendamento)
  const ids = ((visita ?? []) as { id_agendamento: string }[]).map(v => v.id_agendamento)
  if (ids.length === 0) return null
  const { data, error } = await supabase
    .from('taxidog_corrida')
    .select('id_corrida, id_agendamento, status, modalidade, valor, cep, logradouro, numero, complemento, bairro, cidade, uf, id_funcionario')
    .in('id_agendamento', ids)
    .neq('status', 'cancelada')
    .order('created_at')
  if (error || !data || data.length === 0) return null
  const linhas = data as {
    id_corrida: string; id_agendamento: string; status: string; modalidade: ModalidadeTaxiDog; valor: number
    cep: string | null; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; uf: string
    id_funcionario: string | null
  }[]
  // A deste agendamento primeiro; senão, a da visita.
  const c = linhas.find(l => l.id_agendamento === a.id_agendamento) ?? linhas[0]
  // Na rota = tem parada ainda por fazer (tolerante: sem a tabela, não está).
  const { data: itens } = await supabase.from('taxidog_parada_item').select('id_corrida').eq('feito', false).eq('id_corrida', c.id_corrida).limit(1)
  const rua = [c.logradouro, c.numero].filter(Boolean).join(', ')
  const cidade = [c.cidade, c.uf].filter(Boolean).join(' - ')
  return {
    id_corrida: c.id_corrida,
    id_agendamento: c.id_agendamento,
    status: c.status,
    modalidade: c.modalidade,
    valor: Number(c.valor ?? 0),
    endereco: [rua, c.complemento, c.bairro, cidade].filter(Boolean).join(' · '),
    enderecoCampos: {
      cep: c.cep ?? '',
      logradouro: c.logradouro ?? '',
      numero: c.numero ?? '',
      complemento: c.complemento ?? '',
      bairro: c.bairro ?? '',
      cidade: c.cidade ?? '',
      uf: c.uf ?? '',
    },
    temTaxiDog: !!c.id_funcionario,
    naRota: !!itens && itens.length > 0,
  }
}

// O TaxiDog de cada agendamento de UM dia, para a etiqueta do card no Gestor
// de Agendamentos — a mesma escolha do site (lib/taxidog-visita.ts): vale o
// do próprio agendamento; sem ele, o da visita (mesmo pet no dia). Entre
// várias, a em aberto vence a concluída; canceladas não contam. Tolerante:
// sem as tabelas do TaxiDog, ninguém tem etiqueta.
export interface TransporteDoCard { status: string; modalidade: ModalidadeTaxiDog; temTaxiDog: boolean; naRota: boolean }

export async function carregarTransportesDoDia(agendamentos: { id_agendamento: string; id_pet?: string | null }[]): Promise<Record<string, TransporteDoCard>> {
  if (agendamentos.length === 0) return {}
  const { data, error } = await supabase
    .from('taxidog_corrida')
    .select('id_corrida, id_agendamento, status, modalidade, id_funcionario')
    .in('id_agendamento', agendamentos.map(a => a.id_agendamento))
    .neq('status', 'cancelada')
    .order('created_at')
  if (error || !data || data.length === 0) return {}
  const linhas = data as { id_corrida: string; id_agendamento: string; status: string; modalidade: ModalidadeTaxiDog; id_funcionario: string | null }[]
  // Na rota = tem parada ainda por fazer.
  const { data: itens } = await supabase.from('taxidog_parada_item').select('id_corrida').eq('feito', false).in('id_corrida', linhas.map(c => c.id_corrida))
  const naRota = new Set(((itens ?? []) as { id_corrida: string }[]).map(i => i.id_corrida))

  const petDe = new Map(agendamentos.map(a => [a.id_agendamento, a.id_pet ?? null]))
  const aberta = (s: string) => s !== 'concluida'
  const doAgendamento = new Map<string, TransporteDoCard>()
  const daVisita = new Map<string, TransporteDoCard>()
  // Em ordem de criação: a última concluída vence as anteriores, e a em
  // aberto vence qualquer concluída.
  const guardar = (onde: Map<string, TransporteDoCard>, chave: string, t: TransporteDoCard) => {
    const atual = onde.get(chave)
    if (!(atual && aberta(atual.status) && !aberta(t.status))) onde.set(chave, t)
  }
  for (const c of linhas) {
    const t = { status: c.status, modalidade: c.modalidade, temTaxiDog: !!c.id_funcionario, naRota: naRota.has(c.id_corrida) }
    guardar(doAgendamento, c.id_agendamento, t)
    const pet = petDe.get(c.id_agendamento)
    if (pet) guardar(daVisita, pet, t)
  }
  const resultado: Record<string, TransporteDoCard> = {}
  for (const a of agendamentos) {
    const t = doAgendamento.get(a.id_agendamento) ?? (a.id_pet ? daVisita.get(a.id_pet) : undefined)
    if (t) resultado[a.id_agendamento] = t
  }
  return resultado
}

// Itens e depois os nomes (sem embed: a relação é de uma migration nova,
// e o cache de schema do PostgREST já deu trabalho com isso no web).
async function carregarProdutos(id: string): Promise<ProdutoDoAgendamento[]> {
  const { data: itens, error } = await supabase
    .from('agendamento_produto')
    .select('id_produto, quantidade, preco_unitario')
    .eq('id_agendamento', id)
  if (error || !itens || itens.length === 0) return []
  const linhas = itens as { id_produto: string; quantidade: number; preco_unitario: number }[]
  const { data: info } = await supabase
    .from('produto')
    .select('id_produto, nome, unidade_venda')
    .in('id_produto', [...new Set(linhas.map(i => i.id_produto))])
  const porId = new Map(((info ?? []) as { id_produto: string; nome: string; unidade_venda: string }[]).map(p => [p.id_produto, p]))
  return linhas.flatMap(i => {
    const p = porId.get(i.id_produto)
    return p ? [{ nome: p.nome, unidade_venda: p.unidade_venda, quantidade: Number(i.quantidade), preco_unitario: Number(i.preco_unitario) }] : []
  })
}

// ── Status ──────────────────────────────────────────────────

// Busca do TaxiDog da visita que ainda não chegou à loja.
export interface TaxiDogPendente {
  pet: string
  modalidade: 'buscar' | 'buscar_entregar'
  status: string
  // Pet já no carro, a caminho da loja: só dá para seguir mesmo assim.
  emMovimento: boolean
}

type EnderecoCorrida = {
  cep: string; logradouro: string; numero: string; complemento: string | null
  bairro: string; cidade: string; uf: string; lat: number | null; lng: number | null
}

async function buscaPendenteDaVisita(idLojista: string, idAgendamento: string): Promise<(TaxiDogPendente & { endereco: EnderecoCorrida }) | null> {
  const { data: ag } = await supabase
    .from('agendamento')
    .select('id_pet, dt_agendamento, pet:id_pet ( nome )')
    .eq('id_agendamento', idAgendamento)
    .maybeSingle()
  const linha = ag as unknown as { id_pet: string | null; dt_agendamento: string; pet: { nome: string } | null } | null
  if (!linha?.id_pet) return null
  const { data: visita } = await supabase
    .from('agendamento')
    .select('id_agendamento')
    .eq('id_lojista', idLojista)
    .eq('id_pet', linha.id_pet)
    .eq('dt_agendamento', linha.dt_agendamento)
  const ids = ((visita ?? []) as { id_agendamento: string }[]).map(v => v.id_agendamento)
  if (ids.length === 0) return null
  // Todas as buscas da visita, as que já chegaram também: é por elas que se
  // sabe que o pet está na loja (ver buscaQueNaoChegou).
  const { data: corridas, error } = await supabase
    .from('taxidog_corrida')
    .select('id_agendamento, status, modalidade, cep, logradouro, numero, complemento, bairro, cidade, uf, lat, lng')
    .in('id_agendamento', ids)
    .in('modalidade', ['buscar', 'buscar_entregar'])
    .neq('status', 'cancelada')
    .order('created_at')
  if (error || !corridas) return null
  const c = buscaQueNaoChegou(corridas as (EnderecoCorrida & { id_agendamento: string; status: string; modalidade: 'buscar' | 'buscar_entregar' })[], idAgendamento)
  if (!c) return null
  return {
    pet: linha.pet?.nome ?? 'o pet',
    modalidade: c.modalidade,
    status: c.status,
    emMovimento: c.status === 'pet_embarcado',
    endereco: c,
  }
}

export interface ResultadoStatus {
  erro?: string
  sucesso?: boolean
  // Precisa da resposta da loja antes de seguir.
  taxidogPendente?: TaxiDogPendente
  aviso?: string
}

// opcoes.taxidog: resposta da loja quando a busca do TaxiDog ainda não
// chegou — 'cliente_trouxe' tira a busca (a taxa sai, o TaxiDog é avisado)
// e segue; 'ignorar' segue sem mexer nele.
// O que a tela já sabe do agendamento que está mostrando. Com isso a
// mudança de etapa não precisa ir ao banco só para conferir — a própria
// gravação confere (só altera se o agendamento ainda estiver numa etapa
// anterior), e é uma ida ao banco em vez de várias.
export interface AgendamentoConhecido {
  status: string
  dt_agendamento: string
  // A tela sabe que a visita não tem busca do TaxiDog (ou que a loja nem
  // usa TaxiDog): não precisa procurar.
  semBusca?: boolean
}

// As etapas de onde se pode chegar em `status` (o status só anda pra frente).
function etapasAnteriores(status: StatusAgendamento): string[] {
  if (status === 'Cancelado') return ['Pendente', 'Confirmado', 'Em andamento']
  const nova = ORDEM_ETAPA[status as keyof typeof ORDEM_ETAPA] ?? 0
  return Object.entries(ORDEM_ETAPA).filter(([, ordem]) => ordem < nova).map(([etapa]) => etapa)
}

export async function atualizarStatus(
  contexto: ContextoLojista,
  idAgendamento: string,
  status: StatusAgendamento,
  opcoes?: { taxidog?: 'ignorar' | 'cliente_trouxe'; conhecido?: AgendamentoConhecido },
): Promise<ResultadoStatus> {
  if (!contexto.podeGerenciarAgenda) return { erro: 'Você não tem permissão para gerenciar a agenda.' }

  // O status não volta: confere o atual antes de aceitar a mudança.
  let atual: { status: string; dt_agendamento: string } | null = opcoes?.conhecido ?? null
  if (!atual) {
    const { data, error: buscaErro } = await supabase
      .from('agendamento')
      .select('status, dt_agendamento')
      .eq('id_agendamento', idAgendamento)
      .eq('id_lojista', contexto.idLojista)
      .maybeSingle()
    if (buscaErro || !data) return { erro: 'Agendamento não encontrado.' }
    atual = data as { status: string; dt_agendamento: string }
  }
  if (etapaExigeDia(status) && atual.dt_agendamento > hojeBrasilISO()) {
    const [, mes, dia] = atual.dt_agendamento.split('-')
    return { erro: `Este agendamento é para ${dia}/${mes} — o atendimento só pode ser iniciado ou finalizado a partir desse dia.` }
  }
  if (etapaEncerrada(atual.status)) return { erro: 'Este agendamento já foi finalizado e não pode mais mudar de status.' }
  if (status !== 'Cancelado') {
    const ordemAtual = ORDEM_ETAPA[atual.status as keyof typeof ORDEM_ETAPA] ?? 0
    const ordemNova = ORDEM_ETAPA[status as keyof typeof ORDEM_ETAPA] ?? 0
    if (ordemNova <= ordemAtual) return { erro: 'Não é possível voltar para uma etapa anterior.' }
  }

  // Iniciar/finalizar com a busca do TaxiDog ainda a caminho: pergunta
  // antes (o cliente pode ter trazido o pet por conta própria).
  let aviso: string | undefined
  if ((status === 'Em andamento' || status === 'Concluído') && opcoes?.taxidog !== 'ignorar' && !opcoes?.conhecido?.semBusca) {
    const busca = await buscaPendenteDaVisita(contexto.idLojista, idAgendamento)
    if (busca) {
      if (opcoes?.taxidog !== 'cliente_trouxe' || busca.emMovimento) {
        return { taxidogPendente: { pet: busca.pet, modalidade: busca.modalidade, status: busca.status, emMovimento: busca.emMovimento } }
      }
      const e = busca.endereco
      // "Só buscar" some inteiro; "buscar e entregar" vira só a entrega,
      // no mesmo endereço (e com a mesma coordenada já calculada).
      const { error: erroTransporte } = await supabase.rpc(
        'fn_alterar_transporte_agendamento',
        busca.modalidade === 'buscar'
          ? { p_id_agendamento: idAgendamento, p_modalidade: null }
          : {
              p_id_agendamento: idAgendamento,
              p_modalidade: 'entregar',
              p_cep: e.cep,
              p_logradouro: e.logradouro,
              p_numero: e.numero,
              p_complemento: e.complemento || null,
              p_bairro: e.bairro,
              p_cidade: e.cidade,
              p_uf: e.uf,
              p_lat: e.lat,
              p_lng: e.lng,
            },
      )
      if (erroTransporte) return { erro: mensagemDoBanco(erroTransporte, 'Não foi possível alterar o transporte.') }
      aviso = busca.modalidade === 'buscar'
        ? 'Busca do TaxiDog cancelada — o cliente trouxe o pet.'
        : 'Busca do TaxiDog retirada — fica só a entrega.'
    }
  }

  // Só grava se o agendamento ainda estiver numa etapa anterior: outra
  // pessoa pode ter mexido nele desde que a tela carregou.
  const { data: alterado, error } = await supabase
    .from('agendamento')
    .update({ status })
    .eq('id_agendamento', idAgendamento)
    .eq('id_lojista', contexto.idLojista)
    .in('status', etapasAnteriores(status))
    .select('id_agendamento')
  if (error) return { erro: mensagemDoBanco(error, 'Erro ao atualizar o status.') }
  if (!alterado || alterado.length === 0) {
    // Nada mudou: ou alguém já tinha mexido, ou a RLS recusou em silêncio.
    const { data: agora } = await supabase.from('agendamento').select('status').eq('id_agendamento', idAgendamento).maybeSingle()
    const statusAgora = (agora as { status: string } | null)?.status
    if (statusAgora === status) return { sucesso: true, aviso }
    if (statusAgora && etapaEncerrada(statusAgora)) return { erro: 'Este agendamento já foi finalizado e não pode mais mudar de status.' }
    if (statusAgora && statusAgora !== atual.status) return { erro: 'Este agendamento já foi alterado por outra pessoa. A tela foi atualizada.' }
    return { erro: 'Você não tem permissão para alterar este agendamento.' }
  }
  return { sucesso: true, aviso }
}

export async function cancelarAgendamento(idAgendamento: string, motivo: string): Promise<{ erro?: string }> {
  const { error } = await supabase.rpc('fn_cancelar_agendamento', {
    p_id_agendamento: idAgendamento,
    p_motivo: motivo.trim() || null,
  })
  return error ? { erro: mensagemDoBanco(error, 'Não foi possível cancelar o agendamento.') } : {}
}

// ── Pagamento / profissional ────────────────────────────────

// Forma e/ou status do pedido (vale pros serviços marcados juntos).
export async function atualizarPagamento(idAgendamento: string, forma: FormaPagamento | null, status: StatusPagamento | null): Promise<{ erro?: string }> {
  const { error } = await supabase.rpc('fn_atualizar_pagamento', {
    p_id_agendamento: idAgendamento,
    p_forma: forma,
    p_status: status,
  })
  return error ? { erro: mensagemDoBanco(error, 'Não foi possível atualizar o pagamento.') } : {}
}

// Só o responsável pela conta ou um administrador atribui o profissional.
export async function atribuirProfissional(contexto: ContextoLojista, idAgendamento: string, idFuncionario: string | null): Promise<{ erro?: string }> {
  if (!contexto.acessoTotal) return { erro: 'Apenas administradores podem atribuir o profissional responsável.' }
  const { data, error } = await supabase
    .from('agendamento')
    .update({ id_funcionario: idFuncionario })
    .eq('id_agendamento', idAgendamento)
    .eq('id_lojista', contexto.idLojista)
    .select('id_agendamento')
  if (error) return { erro: mensagemDoBanco(error, 'Erro ao atribuir o profissional.') }
  if (!data || data.length === 0) return { erro: 'Você não tem permissão para alterar este agendamento.' }
  return {}
}

// ── Remarcar ────────────────────────────────────────────────

export interface Slot {
  hr_slot: string
  disponivel: boolean
}

export async function horariosParaRemarcar(idAgendamento: string, data: string): Promise<{ slots: Slot[]; erro?: string }> {
  const { data: rows, error } = await supabase.rpc('fn_horarios_remarcar', { p_id_agendamento: idAgendamento, p_data: data })
  if (error) return { slots: [], erro: mensagemDoBanco(error, 'Não foi possível carregar os horários.') }
  return { slots: (rows ?? []) as Slot[] }
}

// Remarca o pedido (os serviços marcados juntos) — regras e efeitos
// (TaxiDog, plano, registro) em fn_remarcar_agendamento (migration 064).
export async function remarcarAgendamento(idAgendamento: string, data: string, hora: string, motivo: string): Promise<{ erro?: string; avisos?: string[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: 'Escolha a nova data.' }
  if (!/^\d{2}:\d{2}$/.test(hora)) return { erro: 'Escolha o novo horário.' }
  if (motivo.length > 300) return { erro: 'Motivo muito longo (até 300 letras).' }
  const { data: res, error } = await supabase.rpc('fn_remarcar_agendamento', {
    p_id_agendamento: idAgendamento,
    p_data: data,
    p_hora: hora,
    p_motivo: motivo.trim() || null,
  })
  if (error) {
    return { erro: faltaMigration(error) ? 'Remarcar ainda não foi ativado no sistema da loja.' : mensagemDoBanco(error, 'Não foi possível remarcar.') }
  }
  return { avisos: (res as { avisos?: string[] } | null)?.avisos ?? [] }
}

// ── Editar (serviço / pet) ──────────────────────────────────

// Troca o serviço e/ou o pet (do mesmo cliente) — regras em
// fn_editar_agendamento (migration 070): a loja altera Pendente ou Aceito.
export async function editarAgendamento(
  idAgendamento: string,
  dados: { idServico: string | null; idPet: string | null; usarBeneficio: boolean },
): Promise<{ erro?: string; valorAnterior?: number; valorNovo?: number; avisos?: string[] }> {
  if (!dados.idServico && !dados.idPet) return { erro: 'Escolha outro serviço ou outro pet.' }
  const { data: res, error } = await supabase.rpc('fn_editar_agendamento', {
    p_id_agendamento: idAgendamento,
    p_id_servico: dados.idServico,
    p_id_pet: dados.idPet,
    p_usar_beneficio: dados.usarBeneficio,
  })
  if (error) {
    return { erro: faltaMigration(error) ? 'Alterar agendamento ainda não foi ativado no sistema da loja.' : mensagemDoBanco(error, 'Não foi possível alterar o agendamento.') }
  }
  const r = res as { valor_anterior: number; valor_novo: number; avisos?: string[] } | null
  return { valorAnterior: Number(r?.valor_anterior ?? 0), valorNovo: Number(r?.valor_novo ?? 0), avisos: r?.avisos ?? [] }
}

// ── Mensagem pronta pro cliente (a loja decide se manda) ────

export function whatsappRemarcado(a: { id_agendamento: string; cliente: { nome: string; telefone: string | null } | null; pet: { nome: string } | null }, nomeLoja: string, data: string, hora: string): string | null {
  const [ano, mes, dia] = data.split('-')
  const acompanhar = urlDoSite(`/acompanhar/${a.id_agendamento}`)
  const texto = `Olá, ${a.cliente?.nome?.split(' ')[0] ?? ''}! O agendamento de ${a.pet?.nome ?? 'seu pet'} na ${nomeLoja} foi remarcado para ${dia}/${mes}/${ano} às ${hora}.${acompanhar ? ` Acompanhe por aqui: ${acompanhar}` : ''}`
  return linkWhatsApp(a.cliente?.telefone, texto)
}

export function whatsappAlterado(a: AgendamentoDetalhe, nomeLoja: string): string | null {
  const [ano, mes, dia] = a.dt_agendamento.split('-')
  const acompanhar = urlDoSite(`/acompanhar/${a.id_agendamento}`)
  const texto = `Olá, ${a.cliente?.nome?.split(' ')[0] ?? ''}! O agendamento de ${a.pet?.nome ?? 'seu pet'} na ${nomeLoja} em ${dia}/${mes}/${ano} às ${a.hr_agendamento.slice(0, 5)} foi alterado: ${a.servico?.nome ?? 'serviço'}, ${formatarMoeda(a.valor)}.${acompanhar ? ` Acompanhe por aqui: ${acompanhar}` : ''}`
  return linkWhatsApp(a.cliente?.telefone, texto)
}
