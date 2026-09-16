import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { diaSemanaBrasil, agoraBrasilHHMM } from '@/lib/agenda'
import AgendamentoOnlineWizard from '@/components/cliente/AgendamentoOnlineWizard'
import { IconAlert, IconPaw } from '@/components/icons'

export const metadata: Metadata = { title: 'Agendar horário' }

interface Props {
  params: Promise<{ id: string }>
}

function AvisoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="agenonline-shell" style={{ display: 'flex', alignItems: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: '100%', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  )
}

export default async function AgendamentoOnlinePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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

  if (!user) {
    return (
      <AvisoShell>
        <IconPaw style={{ width: 32, height: 32, color: 'var(--primary-400)', margin: '0 auto var(--space-4)' }} />
        <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>Agendar em {lojista.nome_loja}</h1>
        <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-5)' }}>
          Entre com sua conta de cliente para continuar o agendamento.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Link href={`/login?redirectTo=/agendamento/${id}`} className="btn btn-primary">Entrar</Link>
          <Link href="/cadastro" className="btn btn-secondary">Criar conta de cliente</Link>
        </div>
      </AvisoShell>
    )
  }

  if (role !== 'cliente') {
    return (
      <AvisoShell>
        <IconAlert style={{ width: 32, height: 32, color: 'var(--warning-400)', margin: '0 auto var(--space-4)' }} />
        <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>Página para clientes</h1>
        <p className="text-sm text-muted">
          Esta é a página de agendamento de {lojista.nome_loja} para clientes. A conta atual não é uma conta de cliente.
        </p>
      </AvisoShell>
    )
  }

  const [{ data: servicos }, { data: funcionarios }, { data: pets }, { data: cliente }, { data: horarioHoje }] = await Promise.all([
    supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao')
      .eq('id_lojista', id)
      .eq('status', 'Ativo')
      .order('nome'),
    supabase.rpc('fn_funcionarios_publicos', { p_id_lojista: id }),
    supabase
      .from('pet')
      .select('id_pet, nome, raca, especie, porte, sexo')
      .eq('id_cliente', user.id)
      .eq('ativo', true)
      .order('nome'),
    supabase.from('cliente').select('nome, telefone, cpf').eq('id_cliente', user.id).maybeSingle(),
    supabase
      .from('horario')
      .select('hr_inicio, hr_fim')
      .eq('id_lojista', id)
      .eq('dia_semana', diaSemanaBrasil())
      .eq('ativo', true)
      .maybeSingle(),
  ])

  const agora = agoraBrasilHHMM()
  let statusHoje = 'Fechado hoje'
  if (horarioHoje) {
    if (agora < horarioHoje.hr_inicio.slice(0, 5)) statusHoje = `Abre às ${horarioHoje.hr_inicio.slice(0, 5)}`
    else if (agora < horarioHoje.hr_fim.slice(0, 5)) statusHoje = `Aberto até ${horarioHoje.hr_fim.slice(0, 5)}`
  }

  return (
    <div className="agenonline-shell">
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
        funcionarios={funcionarios ?? []}
        pets={pets ?? []}
        cliente={cliente ?? { nome: '', telefone: '', cpf: '' }}
      />
    </div>
  )
}
