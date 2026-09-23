import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LojistaSidebar from '@/components/layout/LojistaSidebar'
import NotificacaoNovoAgendamento from '@/components/lojista/NotificacaoNovoAgendamento'
import { obterContextoLojista } from '@/lib/lojista-context'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Lojista' }

export default async function LojistaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
  const { data: lojista, error: lojistaError } = await supabase
    .from('lojista')
    .select('nome_loja, kanban_ativo, som_novo_agendamento_ativo, som_novo_agendamento_tipo')
    .eq('id_lojista', contexto.idLojista)
    .single()

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

  // TaxiDog ligado? (migration 042) — tolerante: sem a tabela, o item
  // "TaxiDog" simplesmente não aparece no menu.
  const { data: taxidogCfg } = await supabase
    .from('taxidog_config')
    .select('ativo')
    .eq('id_lojista', contexto.idLojista)
    .maybeSingle()
  const taxidogAtivo = !!taxidogCfg?.ativo

  // Nome próprio do funcionário, pro rodapé da sidebar mostrar quem está
  // logado (não o nome da loja, que já aparece separado).
  let nomeUsuario = nomeLoja
  if (contexto.role === 'funcionario') {
    const { data: funcionario } = await supabase
      .from('funcionario')
      .select('nome')
      .eq('id_funcionario', user.id)
      .maybeSingle()
    nomeUsuario = funcionario?.nome ?? 'Funcionário'
  }

  return (
    <div className="app-layout lojista-shell">
      <NotificacaoNovoAgendamento lojistaId={contexto.idLojista} somAtivo={somAtivo} somTipo={somTipo} />
      <LojistaSidebar
        nomeLoja={nomeLoja}
        nomeUsuario={nomeUsuario}
        userEmail={user.email ?? ''}
        kanbanAtivo={kanbanAtivo}
        taxidogAtivo={taxidogAtivo}
        role={contexto.role}
        podeGerenciarAgenda={contexto.podeGerenciarAgenda}
        podeGerenciarServicos={contexto.podeGerenciarServicos}
        podeGerenciarProdutos={contexto.podeGerenciarProdutos}
        podeGerenciarClientesPets={contexto.podeGerenciarClientesPets}
        acessoTotal={contexto.acessoTotal}
      />
      <main className="app-main">
        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
