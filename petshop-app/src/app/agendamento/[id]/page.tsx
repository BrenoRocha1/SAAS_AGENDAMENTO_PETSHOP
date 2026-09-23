import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { diaSemanaBrasil, agoraBrasilHHMM } from '@/lib/agenda'
import AgendamentoOnlineWizard from '@/components/cliente/AgendamentoOnlineWizard'
import { IconAlert, IconPaw } from '@/components/icons'

export const metadata: Metadata = { title: 'Agendar horário' }

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ servicos?: string }>
}

// UUID (link antigo, por id_lojista) vs slug personalizado (migration 024)
// — o mesmo parâmetro de rota aceita os dois formatos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function AvisoShell({ children }: { children: React.ReactNode }) {
  return (
    // lojista-shell aqui não é sobre permissão nenhuma — é só a mesma
    // paleta clara (creme + teal) já usada na área do lojista e no login,
    // reaproveitada via a técnica de retematização por CSS custom
    // properties (ver globals.css). Sem isso a página cai no dark mode
    // roxo padrão do resto do app cliente/login, que não é o pedido aqui.
    <div className="agenonline-shell lojista-shell" style={{ display: 'flex', alignItems: 'center', minHeight: '100vh' }}>
      <div className="agenonline-content" style={{ width: '100%' }}>
        <div className="card" style={{ width: '100%', textAlign: 'center' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default async function AgendamentoOnlinePage({ params, searchParams }: Props) {
  const { id } = await params
  const { servicos: servicosParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Público de propósito — a policy "lojista: acesso publico as lojas
  // ativas" (migration 023) é o que permite essa consulta funcionar sem
  // login nenhum (visitante anônimo = role `anon`).
  //
  // `slug` fica de fora do select principal de propósito: é uma coluna
  // opcional (migration 024) e, se ainda não rodou no banco, um select
  // que a inclui falha por INTEIRO — o que quebraria até os links por
  // UUID que já funcionavam antes dela existir. Por isso a resolução por
  // slug é uma consulta separada e tolerante: se a coluna não existir ou
  // não achar nada, cai direto em "loja não encontrada" sem derrubar o
  // resto da página.
  let idLojistaResolvido = id
  if (!UUID_RE.test(id)) {
    const { data: porSlug } = await supabase.from('lojista').select('id_lojista').eq('slug', id).maybeSingle()
    idLojistaResolvido = porSlug?.id_lojista ?? ''
  }

  const { data: lojista, error: lojistaError } = idLojistaResolvido
    ? await supabase
        .from('lojista')
        .select('id_lojista, nome_loja, logo_url, descricao, endereco, cidade, estado, cep, telefone, ativo, aceita_agendamento_online')
        .eq('id_lojista', idLojistaResolvido)
        .maybeSingle()
    : { data: null, error: null }

  if (lojistaError || !lojista || !lojista.ativo) {
    return (
      <AvisoShell>
        <IconAlert style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
        <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>Loja não encontrada</h1>
        <p className="text-sm text-muted">
          Verifique se o link está correto com a loja.
          {process.env.NODE_ENV !== 'production' && lojistaError && ` [DEV: ${lojistaError.message}]`}
        </p>
      </AvisoShell>
    )
  }

  if (!lojista.aceita_agendamento_online) {
    return (
      <AvisoShell>
        <IconPaw style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
        <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>{lojista.nome_loja}</h1>
        <p className="text-sm text-muted">
          Esta loja não está aceitando agendamentos online no momento. Entre em contato diretamente com ela.
        </p>
      </AvisoShell>
    )
  }

  const role = user?.user_metadata?.role
  const autenticado = !!user && role === 'cliente'
  const contaInvalida = !!user && role !== 'cliente'

  // Serviços e horários são públicos — dá pra navegar e ver o que a loja
  // oferece sem estar logado. Busca a semana inteira (não só hoje) pra
  // mostrar no modal de detalhes da loja.
  // Avaliações vêm só pelas duas funções públicas da migration 034 —
  // recorte seguro (nota, comentário, primeiro nome, data), sem telefone,
  // e-mail, CPF ou id de cliente. Se a migration ainda não rodou, a RPC
  // devolve erro e data=null: o modal cai no "ainda não há avaliações"
  // em vez de quebrar a página.
  const [
    { data: servicos },
    { data: horarios },
    { data: resumoAvaliacoesRaw },
    { data: avaliacoesRecentesRaw },
    { data: produtos },
  ] = await Promise.all([
    supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao')
      .eq('id_lojista', lojista.id_lojista)
      .eq('status', 'Ativo')
      .order('nome'),
    supabase
      .from('horario')
      .select('dia_semana, hr_inicio, hr_fim, ativo')
      .eq('id_lojista', lojista.id_lojista),
    supabase.rpc('fn_avaliacoes_resumo_publico', { p_id_lojista: lojista.id_lojista }),
    supabase.rpc('fn_avaliacoes_publicas', { p_id_lojista: lojista.id_lojista, p_limit: 3 }),
    // Produtos liberados pra venda no Agendamento Online (migration 039)
    // — público de propósito, mesma ideia de `servico` (a policy de RLS
    // já filtra Ativo + disponivel_agendamento_online, sem checar role).
    supabase
      .from('produto')
      .select('id_produto, nome, preco_venda, unidade_venda, estoque_atual')
      .eq('id_lojista', lojista.id_lojista)
      .eq('status', 'Ativo')
      .eq('disponivel_agendamento_online', true)
      .gt('estoque_atual', 0)
      .order('nome'),
  ])

  const resumoAvaliacoes = resumoAvaliacoesRaw as { media: number | null; total: number } | null
  const avaliacoesPublicas = {
    // NUMERIC do Postgres pode chegar como string via PostgREST.
    media: resumoAvaliacoes?.media != null ? Number(resumoAvaliacoes.media) : null,
    total: Number(resumoAvaliacoes?.total ?? 0),
    recentes: ((avaliacoesRecentesRaw ?? []) as Array<{
      nota: number
      comentario: string
      primeiro_nome: string
      created_at: string
    }>),
  }

  const horarioHoje = (horarios ?? []).find(h => h.dia_semana === diaSemanaBrasil() && h.ativo) ?? null

  // Janela de antecedência (migration 025) — query separada e tolerante,
  // mesmo raciocínio do slug: se ainda não rodou no banco, cai no mesmo
  // padrão que já era fixo no código antes dela existir (sem mínimo,
  // até 30 dias à frente), em vez de quebrar a página.
  const { data: janelaRow } = await supabase
    .from('lojista')
    .select('agendamento_min_valor, agendamento_min_unidade, agendamento_max_valor, agendamento_max_unidade')
    .eq('id_lojista', lojista.id_lojista)
    .maybeSingle()
  const janela = {
    minValor: janelaRow?.agendamento_min_valor ?? 0,
    minUnidade: (janelaRow?.agendamento_min_unidade ?? 'horas') as 'horas' | 'dias',
    maxValor: janelaRow?.agendamento_max_valor ?? 30,
    maxUnidade: (janelaRow?.agendamento_max_unidade ?? 'dias') as 'horas' | 'dias',
  }

  // TaxiDog + aviso de preço estimado (migration 042) — mesmo cuidado das
  // colunas novas acima: se a migration ainda não rodou, a etapa de
  // transporte simplesmente não aparece e o agendamento segue normal.
  // Número/complemento/bairro da loja (migration 045) no mesmo esquema
  // tolerante: sem a migration, o endereço aparece como antes.
  const [{ data: taxidogRaw }, { data: estimadoRow }, { data: enderecoRow }] = await Promise.all([
    supabase.rpc('fn_taxidog_publico', { p_id_lojista: lojista.id_lojista }),
    supabase.from('lojista').select('precos_estimados').eq('id_lojista', lojista.id_lojista).maybeSingle(),
    supabase.from('lojista').select('numero, complemento, bairro').eq('id_lojista', lojista.id_lojista).maybeSingle(),
  ])
  const taxidogDisponivel = !!(taxidogRaw as { disponivel: boolean }[] | null)?.[0]?.disponivel
  const precosEstimados = !!estimadoRow?.precos_estimados

  // Dados do próprio cliente — só buscados quando logado como cliente,
  // já que dependem de RLS de auth.uid().
  let pets: { id_pet: string; nome: string; raca: string; especie: 'Cão' | 'Gato' | null; porte: 'Pequeno' | 'Médio' | 'Grande' | null; sexo: string }[] = []
  let cliente = { nome: '', telefone: '', cpf: '' }

  if (autenticado) {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase
        .from('pet')
        .select('id_pet, nome, raca, especie, porte, sexo')
        .eq('id_cliente', user!.id)
        .eq('ativo', true)
        .order('nome'),
      supabase.from('cliente').select('nome, telefone, cpf').eq('id_cliente', user!.id).maybeSingle(),
    ])
    pets = p ?? []
    cliente = c ?? cliente
  }

  const agora = agoraBrasilHHMM()
  let statusHoje = 'Fechado hoje'
  if (horarioHoje) {
    if (agora < horarioHoje.hr_inicio.slice(0, 5)) statusHoje = `Abre às ${horarioHoje.hr_inicio.slice(0, 5)}`
    else if (agora < horarioHoje.hr_fim.slice(0, 5)) statusHoje = `Aberto até ${horarioHoje.hr_fim.slice(0, 5)}`
  }

  return (
    <div className="agenonline-shell lojista-shell">
      <div className="agenonline-content">
        <AgendamentoOnlineWizard
          lojista={{
            id: lojista.id_lojista,
            nome: lojista.nome_loja,
            logoUrl: lojista.logo_url,
            descricao: lojista.descricao,
            endereco: lojista.endereco,
            numero: enderecoRow?.numero ?? null,
            complemento: enderecoRow?.complemento ?? null,
            bairro: enderecoRow?.bairro ?? null,
            cidade: lojista.cidade,
            estado: lojista.estado,
            cep: lojista.cep,
            telefone: lojista.telefone,
            statusHoje,
          }}
          horarios={horarios ?? []}
          janela={janela}
          servicos={servicos ?? []}
          produtos={produtos ?? []}
          avaliacoes={avaliacoesPublicas}
          pets={pets}
          cliente={cliente}
          autenticado={autenticado}
          contaInvalida={contaInvalida}
          carrinhoInicial={servicosParam ? servicosParam.split(',').filter(Boolean) : []}
          taxidogDisponivel={taxidogDisponivel}
          precosEstimados={precosEstimados}
        />
      </div>
    </div>
  )
}
