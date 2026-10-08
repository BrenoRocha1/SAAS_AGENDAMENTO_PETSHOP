import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import type { Metadata } from 'next'
import Link from 'next/link'
import { format, parseISO, differenceInYears } from 'date-fns'
import { formatarTelefone, iniciais } from '@/lib/format'
import { obterContextoLojista } from '@/lib/lojista-context'
import { IconCalendar, IconChevronLeft, IconChevronRight, IconDog, IconPackage, IconPencil, IconSliders, IconUsers } from '@/components/icons'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import { hojeBrasilISO } from '@/lib/agenda'
import { formasAtivas, normalizarFormasLoja } from '@/lib/pagamento'
import type { Plano, PlanoDoPet as PlanoAtivo } from '@/lib/planos'
import PlanoDoPet from '@/components/lojista/planos/PlanoDoPet'
import { formatarReais } from '@/lib/taxidog'
import Ilustracao from '@/components/Ilustracao'

export const metadata: Metadata = { title: 'Detalhes do Pet — Lojista' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function DetalhePetPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null
  if (!contexto.podeGerenciarClientesPets) {
    return (
      <div className="empty-state card">
        <Ilustracao nome="sem-permissao" />
        <div className="empty-state-title">Sem permissão para ver pets</div>
        <p>Fale com o responsável pelo petshop para liberar esse acesso.</p>
      </div>
    )
  }
  const podeEditar = contexto.role === 'lojista' || contexto.acessoTotal
  const lojistaId = contexto.idLojista

  // RLS ("pet: lojista ve pets de clientes vinculados", migration 015) já
  // garante que só vem resultado se este pet pertencer a um cliente do
  // seu petshop — se vier vazio, tanto faz se o pet não existe ou é de
  // outra loja, a tela trata os dois casos igual (não revela qual é).
  const [{ data: pet }, { data: historico }] = await Promise.all([
    supabase
      .from('pet')
      .select(`
        id_pet, nome, raca, sexo, especie, porte, dt_nasc, peso, obs, foto_url, created_at,
        cliente:id_cliente ( id_cliente, nome, telefone, email )
      `)
      .eq('id_pet', id)
      .maybeSingle(),
    supabase
      .from('agendamento')
      .select(`
        id_agendamento, dt_agendamento, hr_agendamento, status, valor,
        servico:id_servico ( nome ),
        funcionario:id_funcionario ( nome )
      `)
      .eq('id_pet', id)
      .eq('id_lojista', lojistaId)
      .order('dt_agendamento', { ascending: false })
      .order('hr_agendamento', { ascending: false })
      .limit(30),
  ])

  if (!pet) {
    return (
      <>
        <Link href="/lojista/pets" className="btn btn-ghost btn-sm so-desktop" style={{ marginBottom: 'var(--space-4)' }}>
          <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Pets
        </Link>
        <div className="empty-state card">
          <Ilustracao nome="nao-encontrado" />
          <div className="empty-state-title">Pet não encontrado</div>
          <p>Ele pode ter sido removido, ou não pertence a um cliente do seu petshop.</p>
        </div>
      </>
    )
  }

  // Plano do pet (migration 060). Tolerante: sem a migration (ou sem
  // permissão de agenda) o bloco não aparece.
  const hojeISO = hojeBrasilISO()
  const [benRes, planosRes, formasRes] = await Promise.all([
    supabase.rpc('fn_beneficios_do_pet', { p_id_pet: id, p_data: hojeISO }),
    podeEditar ? supabase.rpc('fn_planos_da_loja') : Promise.resolve({ data: [], error: null }),
    podeEditar ? supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: lojistaId }) : Promise.resolve({ data: null, error: null }),
  ])
  const planoDoPet = benRes.error ? null : {
    ativos: (benRes.data ?? []) as PlanoAtivo[],
    planos: (planosRes.error ? [] : planosRes.data ?? []) as Plano[],
    formas: formasAtivas(normalizarFormasLoja(formasRes.data)),
    podeAssinar: podeEditar && !planosRes.error,
  }

  const cliente = pet.cliente as unknown as { id_cliente: string; nome: string; telefone: string; email: string } | null
  const idade = differenceInYears(new Date(), parseISO(pet.dt_nasc))

  const atendimentos = ((historico ?? []) as unknown as Array<{
    id_agendamento: string
    dt_agendamento: string
    hr_agendamento: string
    status: 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'
    valor: number
    servico: { nome: string } | null
    funcionario: { nome: string } | null
  }>)

  return (
    <>
      <Link href="/lojista/pets" className="btn btn-ghost btn-sm so-desktop" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Pets
      </Link>

      {/* Celular (até 768px): a mesma tela do pet no app (o histórico de
          atendimentos fica no computador). */}
      <div className="so-celular tela-app">
        <div className="tela-app-perfil">
          <span className="tela-app-avatar is-72" style={pet.foto_url ? { backgroundImage: `url(${pet.foto_url})` } : undefined}>
            {!pet.foto_url && iniciais(pet.nome)}
          </span>
          <strong>{pet.nome}</strong>
          <span>{[pet.especie, pet.raca].filter(Boolean).join(' • ')}</span>
        </div>

        <div className="tela-app-cartao">
          <div className="tela-app-info is-90">
            <IconUsers style={{ width: 16, height: 16 }} />
            <span>Sexo</span>
            <strong>{pet.sexo}</strong>
          </div>
          <div className="tela-app-info is-90">
            <IconSliders style={{ width: 16, height: 16 }} />
            <span>Porte</span>
            <strong>{pet.porte ?? '—'}</strong>
          </div>
          <div className="tela-app-info is-90">
            <IconCalendar style={{ width: 16, height: 16 }} />
            <span>Nascimento</span>
            <strong>{format(parseISO(pet.dt_nasc), 'dd/MM/yyyy')}</strong>
          </div>
          <div className="tela-app-info is-90">
            <IconPackage style={{ width: 16, height: 16 }} />
            <span>Peso</span>
            <strong>{pet.peso != null ? `${Number(pet.peso)} kg` : '—'}</strong>
          </div>
        </div>

        {pet.obs && (
          <div className="tela-app-cartao">
            <span className="tela-app-rotulo">Observações</span>
            <p>{pet.obs}</p>
          </div>
        )}

        {podeEditar && (
          <Link href={`/lojista/pets?editar=${pet.id_pet}`} className="tela-app-botao is-largo">
            <IconPencil style={{ width: 16, height: 16 }} /> Editar dados do pet
          </Link>
        )}
      </div>

      <div className="page-header so-desktop" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="pet-avatar" style={{ width: 64, height: 64 }}>
            {pet.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
              <img src={pet.foto_url} alt={pet.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <IconDog style={{ width: 30, height: 30 }} />
            )}
          </div>
          <div>
            <h1 className="page-title">{pet.nome}</h1>
            <p className="page-subtitle">
              {[pet.especie, pet.porte, pet.raca].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        {podeEditar && (
          <Link href={`/lojista/pets?editar=${pet.id_pet}`} className="btn btn-primary btn-sm">
            <IconPencil style={{ width: 14, height: 14 }} /> Editar
          </Link>
        )}
      </div>

      <div className="grid-2 so-desktop" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        <div className="card">
          <h3 className="relatorio-secao-titulo">
            <IconDog style={{ width: 15, height: 15 }} /> Dados do pet
          </h3>
          <div className="dash-detail-row"><span>Nome</span><span>{pet.nome}</span></div>
          <div className="dash-detail-row"><span>Espécie</span><span>{pet.especie ?? '—'}</span></div>
          <div className="dash-detail-row"><span>Raça</span><span>{pet.raca}</span></div>
          <div className="dash-detail-row"><span>Porte</span><span>{pet.porte ?? '—'}</span></div>
          <div className="dash-detail-row"><span>Sexo</span><span>{pet.sexo}</span></div>
          <div className="dash-detail-row"><span>Nascimento</span><span>{format(parseISO(pet.dt_nasc), 'dd/MM/yyyy')} ({idade} {idade === 1 ? 'ano' : 'anos'})</span></div>
          {pet.peso != null && <div className="dash-detail-row"><span>Peso</span><span>{Number(pet.peso).toFixed(1)} kg</span></div>}
          {pet.obs && (
            <div className="dash-detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
              <span>Observações</span>
              <span style={{ textAlign: 'left', fontWeight: 400, color: 'var(--gray-300)' }}>{pet.obs}</span>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="relatorio-secao-titulo">
            <IconUsers style={{ width: 15, height: 15 }} /> Tutor
          </h3>
          {cliente ? (
            <>
              <div className="dash-detail-row"><span>Nome</span><span>{cliente.nome}</span></div>
              <div className="dash-detail-row"><span>Telefone</span><span>{formatarTelefone(cliente.telefone)}</span></div>
              <div className="dash-detail-row"><span>E-mail</span><span>{cliente.email}</span></div>
            </>
          ) : (
            <p className="text-sm text-muted">Tutor não encontrado.</p>
          )}
        </div>
      </div>

      {planoDoPet && (
        <PlanoDoPet
          ativos={planoDoPet.ativos}
          idPet={pet.id_pet}
          nomePet={pet.nome}
          planos={planoDoPet.planos}
          hojeISO={hojeISO}
          formasAceitas={planoDoPet.formas}
          podeAssinar={planoDoPet.podeAssinar}
        />
      )}

      {/* Celular: o tutor por último, como no app. */}
      {cliente && (
        <div className="so-celular tela-app">
          <div className="dash-app-secao-topo"><h2>Tutor</h2></div>
          <Link href={`/lojista/clientes/${cliente.id_cliente}`} className="dash-app-linha">
            <span className="tela-app-avatar is-40">{iniciais(cliente.nome)}</span>
            <span className="dash-app-linha-info">
              <span className="dash-app-linha-pet">{cliente.nome}</span>
            </span>
            <IconChevronRight className="tela-app-seta" style={{ width: 18, height: 18 }} />
          </Link>
        </div>
      )}

      <div className="card so-desktop">
        <h3 className="relatorio-secao-titulo">Histórico de atendimentos neste petshop</h3>
        {atendimentos.length === 0 ? (
          <p className="text-sm text-muted">Este pet ainda não teve nenhum atendimento aqui.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Horário</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {atendimentos.map(a => (
                  <tr key={a.id_agendamento}>
                    <td>{format(parseISO(a.dt_agendamento), 'dd/MM/yyyy')}</td>
                    <td>{a.hr_agendamento.slice(0, 5)}</td>
                    <td>{a.servico?.nome ?? '—'}</td>
                    <td>{a.funcionario?.nome ?? '—'}</td>
                    <td>{formatarReais(a.valor)}</td>
                    <td><span className={`badge ${classeBadgeStatus(a.status)}`}>{rotuloStatus(a.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
