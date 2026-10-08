import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { redirect } from 'next/navigation'
import LojistaSidebar from '@/components/layout/LojistaSidebar'
import NotificacaoNovoAgendamento from '@/components/lojista/NotificacaoNovoAgendamento'
import AtualizacaoAoVivo from '@/components/lojista/AtualizacaoAoVivo'
import NotificacaoTaxiDog from '@/components/lojista/NotificacaoTaxiDog'
import { obterContextoLojista } from '@/lib/lojista-context'
import type { Metadata } from 'next'
import { ehEmailInterno } from '@/lib/email-interno'
import { acessoDaLoja } from '@/lib/acesso-loja'
import AcessoExpirado from '@/components/acesso/AcessoExpirado'
import FaixaTeste from '@/components/acesso/FaixaTeste'
import FaixaImpersonando from '@/components/acesso/FaixaImpersonando'

export const metadata: Metadata = { title: 'Dashboard — Lojista' }

export default async function LojistaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = await obterUsuario()

  if (!user) redirect('/login')

  // Verifica role: user_metadata primeiro, depois tabela lojista como fallback
  // Isso evita loop de redirect quando user_metadata.role não está definido
  const metaRole = user.user_metadata?.role
  let isLojista = metaRole === 'lojista'

  if (!isLojista && metaRole !== 'cliente' && metaRole !== 'funcionario') {
    // role indefinido — consulta o banco como fonte de verdade
    const { data: lojistaRow } = await supabase
      .from('lojista')
      .select('id_lojista')
      .eq('id_lojista', user.id)
      .maybeSingle()
    isLojista = !!lojistaRow
  }

  // Funcionário também usa este layout (mesmo painel do lojista, limitado
  // pelas permissões dele — o corte de quais rotas ele pode acessar já
  // acontece no middleware). obterContextoLojista resolve o id_lojista de
  // verdade nos dois casos.
  const contexto = isLojista
    ? await obterContextoLojista(supabase, user.id, 'lojista')
    : await obterContextoLojista(supabase, user.id, 'funcionario')

  if (!contexto) redirect('/cliente/dashboard')

  // kanban_ativo (migration 013) decide se o item "Kanban" aparece no menu.
  // Se a migration ainda não rodou, a coluna não existe e o select abaixo
  // falha — nesse caso caímos pra uma consulta sem ela e assumimos o
  // padrão (true), sem derrubar o layout inteiro (usado por toda página
  // do lojista) por causa de uma coluna que ainda não existe no banco.
  let nomeLoja = 'Meu Petshop'
  let kanbanAtivo = true
  // Padrão ligado (mesmo default da coluna, migration 036) — se a query
  // cheia falhar (coluna ainda não existe), a notificação sonora não fica
  // "quebrada" por causa de uma migration pendente, só assume o padrão.
  let somAtivo = true
  let somTipo = 'sino'
  // As três consultas do menu saem juntas (antes, uma esperava a outra).
  const [{ data: lojista, error: lojistaError }, { data: taxidogCfg }, { data: funcionario }] = await Promise.all([
    supabase
      .from('lojista')
      .select('nome_loja, kanban_ativo, som_novo_agendamento_ativo, som_novo_agendamento_tipo')
      .eq('id_lojista', contexto.idLojista)
      .single(),
    // TaxiDog ligado? (migration 042) — tolerante: sem a tabela, o item
    // "TaxiDog" simplesmente não aparece no menu.
    supabase
      .from('taxidog_config')
      .select('ativo')
      .eq('id_lojista', contexto.idLojista)
      .maybeSingle(),
    // Nome próprio do funcionário, pro rodapé da sidebar mostrar quem está
    // logado (não o nome da loja, que já aparece separado).
    contexto.role === 'funcionario'
      ? supabase.from('funcionario').select('nome').eq('id_funcionario', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (lojistaError) {
    const { data: fallback } = await supabase
      .from('lojista')
      .select('nome_loja')
      .eq('id_lojista', contexto.idLojista)
      .single()
    nomeLoja = fallback?.nome_loja ?? nomeLoja
  } else {
    nomeLoja = lojista?.nome_loja ?? nomeLoja
    kanbanAtivo = lojista?.kanban_ativo ?? true
    somAtivo = lojista?.som_novo_agendamento_ativo ?? true
    somTipo = lojista?.som_novo_agendamento_tipo ?? 'sino'
  }
  const taxidogAtivo = !!taxidogCfg?.ativo
  const nomeUsuario = contexto.role === 'funcionario'
    ? ((funcionario as { nome: string } | null)?.nome ?? 'Funcionário')
    : nomeLoja

  // Período de teste de 30 dias (migration 088): acabou → só a tela de aviso.
  const acesso = await acessoDaLoja(supabase, contexto.idLojista)
  if (!acesso.liberado) {
    return <AcessoExpirado nomeLoja={nomeLoja} ehDono={contexto.role === 'lojista'} />
  }

  return (
    <div className="app-layout lojista-shell">
      <FaixaImpersonando />
      <NotificacaoNovoAgendamento lojistaId={contexto.idLojista} somAtivo={somAtivo} somTipo={somTipo} />
      <AtualizacaoAoVivo lojistaId={contexto.idLojista} />
      {/* Avisos do TaxiDog: corridas/rotas pra quem é TaxiDog, rota para
          aprovar pra gestão. */}
      {(contexto.podeTaxidog || (contexto.podeGerenciarAgenda && taxidogAtivo)) && (
        <NotificacaoTaxiDog
          lojistaId={contexto.idLojista}
          userId={user.id}
          taxidog={contexto.podeTaxidog}
          gestor={contexto.podeGerenciarAgenda}
          somAtivo={somAtivo}
          somTipo={somTipo}
        />
      )}
      <LojistaSidebar
        nomeLoja={nomeLoja}
        nomeUsuario={nomeUsuario}
        userEmail={ehEmailInterno(user.email) ? '' : (user.email ?? '')}
        kanbanAtivo={kanbanAtivo}
        taxidogAtivo={taxidogAtivo}
        role={contexto.role}
        podeGerenciarAgenda={contexto.podeGerenciarAgenda}
        podeGerenciarServicos={contexto.podeGerenciarServicos}
        podeGerenciarProdutos={contexto.podeGerenciarProdutos}
        podeGerenciarClientesPets={contexto.podeGerenciarClientesPets}
        acessoTotal={contexto.acessoTotal}
        podeTaxidog={contexto.podeTaxidog}
      />
      <main className="app-main">
        <div className="app-content">
          {!acesso.livre && acesso.diasRestantes !== null && acesso.diasRestantes <= 7 && contexto.role === 'lojista' && (
            <FaixaTeste dias={acesso.diasRestantes} />
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
