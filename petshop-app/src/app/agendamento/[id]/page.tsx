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

function AvisoShell({ children }: { children: React.ReactNode }) {
  return (
    // lojista-shell aqui não é sobre permissão nenhuma — é só a mesma
    // paleta clara (creme + teal) já usada na área do lojista e no login,
    // reaproveitada via a técnica de retematização por CSS custom
    // properties (ver globals.css). Sem isso a página cai no dark mode
    // roxo padrão do resto do app cliente/login, que não é o pedido aqui.
    <div className="agenonline-shell lojista-shell" style={{ display: 'flex', alignItems: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: '100%', textAlign: 'center' }}>
        {children}
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
  const { data: lojista, error: lojistaError } = await supabase
    .from('lojista')
    .select('id_lojista, nome_loja, logo_url, cidade, estado, telefone, ativo, aceita_agendamento_online')
    .eq('id_lojista', id)
    .maybeSingle()

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

  // Serviços e horário de hoje são públicos — dá pra navegar e ver o que
  // a loja oferece sem estar logado.
  const [{ data: servicos }, { data: horarioHoje }] = await Promise.all([
    supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao')
      .eq('id_lojista', id)
      .eq('status', 'Ativo')
      .order('nome'),
    supabase
      .from('horario')
      .select('hr_inicio, hr_fim')
      .eq('id_lojista', id)
      .eq('dia_semana', diaSemanaBrasil())
      .eq('ativo', true)
      .maybeSingle(),
  ])

  // Dados do próprio cliente — só buscados quando logado como cliente,
  // já que dependem de RLS de auth.uid() (pets, cadastro) ou de uma RPC
  // que só authenticated pode chamar (fn_funcionarios_publicos).
  let funcionarios: { id_funcionario: string; nome: string; cargo: string | null }[] = []
  let pets: { id_pet: string; nome: string; raca: string; especie: 'Cão' | 'Gato' | null; porte: 'Pequeno' | 'Médio' | 'Grande' | null; sexo: string }[] = []
  let cliente = { nome: '', telefone: '', cpf: '' }

  if (autenticado) {
    const [{ data: f }, { data: p }, { data: c }] = await Promise.all([
      supabase.rpc('fn_funcionarios_publicos', { p_id_lojista: id }),
      supabase
        .from('pet')
        .select('id_pet, nome, raca, especie, porte, sexo')
        .eq('id_cliente', user!.id)
        .eq('ativo', true)
        .order('nome'),
      supabase.from('cliente').select('nome, telefone, cpf').eq('id_cliente', user!.id).maybeSingle(),
    ])
    funcionarios = f ?? []
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
      <AgendamentoOnlineWizard
        lojista={{
          id: lojista.id_lojista,
          nome: lojista.nome_loja,
          logoUrl: lojista.logo_url,
          cidade: lojista.cidade,
          estado: lojista.estado,
          telefone: lojista.telefone,
          statusHoje,
        }}
        servicos={servicos ?? []}
        funcionarios={funcionarios}
        pets={pets}
        cliente={cliente}
        autenticado={autenticado}
        contaInvalida={contaInvalida}
        carrinhoInicial={servicosParam ? servicosParam.split(',').filter(Boolean) : []}
      />
    </div>
  )
}
