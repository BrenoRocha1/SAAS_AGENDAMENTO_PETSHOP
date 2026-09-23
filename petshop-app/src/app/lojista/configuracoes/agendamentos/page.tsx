import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { alternarKanbanAction, alternarAgendamentoOnlineAction } from '@/lib/actions'
import { alternarPrecosEstimadosAction } from '@/lib/actions-taxidog'
import ConfigToggleCard from '@/components/lojista/ConfigToggleCard'
import LinkAgendamentoOnline from '@/components/lojista/LinkAgendamentoOnline'
import JanelaAgendamentoForm from '@/components/lojista/JanelaAgendamentoForm'
import { IconAlert, IconCalendar, IconCar, IconChevronLeft, IconChevronRight, IconKanban, IconMoney } from '@/components/icons'
import { ROTULO_MODO_COBRANCA, type ModoCobrancaTaxiDog } from '@/lib/taxidog'

export const metadata: Metadata = { title: 'Configurações de Agendamentos — Lojista' }

export default async function ConfiguracoesAgendamentosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: lojista, error } = await supabase
    .from('lojista')
    .select('kanban_ativo, aceita_agendamento_online')
    .eq('id_lojista', user!.id)
    .maybeSingle()

  // Busca o slug numa query separada, de propósito: é uma coluna nova
  // (migration 024) e opcional — se ainda não rodou no banco, não pode
  // derrubar a tela inteira (kanban/agendamento online já funcionavam
  // antes dela existir). Sem a coluna, `slug` vira null e o card de link
  // mostra só o link por UUID.
  const { data: slugRow, error: slugError } = await supabase
    .from('lojista')
    .select('slug')
    .eq('id_lojista', user!.id)
    .maybeSingle()
  const slugPendente = !!slugError

  // Mesmo raciocínio do slug acima: colunas novas (migration 025) numa
  // query separada e tolerante, pra não derrubar o resto da tela se
  // ainda não rodou.
  const { data: janelaRow, error: janelaError } = await supabase
    .from('lojista')
    .select('agendamento_min_valor, agendamento_min_unidade, agendamento_max_valor, agendamento_max_unidade')
    .eq('id_lojista', user!.id)
    .maybeSingle()
  const janelaPendente = !!janelaError

  // TaxiDog + preço estimado (migration 042) — tolerante como as de cima.
  const [{ data: taxidogRow, error: taxidogError }, { data: estimadoRow, error: estimadoError }] = await Promise.all([
    supabase.from('taxidog_config').select('ativo, disponivel_online, modo_cobranca').eq('id_lojista', user!.id).maybeSingle(),
    supabase.from('lojista').select('precos_estimados').eq('id_lojista', user!.id).maybeSingle(),
  ])
  const taxidogPendente = !!taxidogError

  return (
    <>
      <Link href="/lojista/configuracoes" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-4)' }}>
        <IconChevronLeft style={{ width: 14, height: 14 }} /> Voltar para Configurações
      </Link>

      <div className="page-header">
        <h1 className="page-title">Configurações de Agendamentos</h1>
        <p className="page-subtitle">Controle o Kanban, o agendamento feito pelos próprios clientes e o TaxiDog.</p>
      </div>

      {error || !lojista ? (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-5)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>
            Não foi possível carregar as configurações agora.{' '}
            {process.env.NODE_ENV !== 'production' && error && `[DEV: ${error.message}]`}
            {' '}Execute a migration 020_configuracoes_loja.sql se ainda não rodou, e tente novamente.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 700 }}>
          <div id="kanban">
            <ConfigToggleCard
              icone={<IconKanban style={{ width: 17, height: 17 }} />}
              titulo="Gestor de Agendamentos (Kanban)"
              descricao="Acompanhe os atendimentos em tempo real, separados por Pendente, Em Andamento e Finalizado."
              descricaoQuandoDesativado="Desativado, o item some do menu lateral — os agendamentos continuam existindo normalmente, só a tela de Kanban fica indisponível."
              ativoInicial={lojista.kanban_ativo}
              action={alternarKanbanAction}
            />
          </div>

          <div id="online">
            <ConfigToggleCard
              icone={<IconCalendar style={{ width: 17, height: 17 }} />}
              titulo="Agendamento Online"
              descricao="Permite que clientes já cadastrados agendem sozinhos, pelo app, sem precisar ligar ou ir até a loja."
              descricaoQuandoDesativado="Desativado, sua loja some do seletor de lojas no app do cliente e novas tentativas de agendamento público são recusadas — agendamentos feitos por você (walk-in, telefone) continuam funcionando normalmente."
              ativoInicial={lojista.aceita_agendamento_online}
              action={alternarAgendamentoOnlineAction}
            />
          </div>

          {lojista.aceita_agendamento_online && (
            <>
              {slugPendente && (
                <div className="alert alert-warning">
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Ainda não dá pra personalizar o nome do link — execute a migration 024_slug_lojista.sql.
                    {process.env.NODE_ENV !== 'production' && ` [DEV: ${slugError!.message}]`}
                  </span>
                </div>
              )}
              <LinkAgendamentoOnline idLojista={user!.id} slugAtual={slugRow?.slug ?? null} />

              {janelaPendente ? (
                <div className="alert alert-warning">
                  <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Ainda não dá pra configurar a antecedência do agendamento online — execute a migration 025_janela_agendamento.sql.
                    {process.env.NODE_ENV !== 'production' && ` [DEV: ${janelaError!.message}]`}
                  </span>
                </div>
              ) : (
                <JanelaAgendamentoForm
                  minValorAtual={janelaRow!.agendamento_min_valor}
                  minUnidadeAtual={janelaRow!.agendamento_min_unidade as 'horas' | 'dias'}
                  maxValorAtual={janelaRow!.agendamento_max_valor}
                  maxUnidadeAtual={janelaRow!.agendamento_max_unidade as 'horas' | 'dias'}
                />
              )}
            </>
          )}

          <div id="taxidog">
            <Link href="/lojista/configuracoes/agendamentos/taxidog" className="card config-item" style={{ padding: 'var(--space-5)' }}>
              <span className="dash-icon-btn" style={{ cursor: 'default' }}><IconCar style={{ width: 17, height: 17 }} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="config-item-titulo">TaxiDog</div>
                <div className="config-item-desc">
                  {taxidogPendente
                    ? 'Execute a migration 042_taxidog.sql para configurar a busca e entrega dos pets.'
                    : taxidogRow?.ativo
                      ? `Cobrança: ${ROTULO_MODO_COBRANCA[(taxidogRow.modo_cobranca ?? 'fixo') as ModoCobrancaTaxiDog]}${taxidogRow.disponivel_online ? ' · disponível no agendamento online' : ' · só a loja agenda'}`
                      : 'Busca e entrega dos pets: preços, regiões atendidas e quem faz as corridas.'}
                </div>
              </div>
              {!taxidogPendente && (
                <span className={`badge ${taxidogRow?.ativo ? 'badge-ativo' : 'badge-inativo'}`}>
                  {taxidogRow?.ativo ? 'Ativado' : 'Desativado'}
                </span>
              )}
              <IconChevronRight style={{ width: 16, height: 16, color: 'var(--gray-600)', flexShrink: 0 }} />
            </Link>
          </div>

          {!estimadoError && (
            <div id="precos-estimados">
              <ConfigToggleCard
                icone={<IconMoney style={{ width: 17, height: 17 }} />}
                titulo="Preço do serviço é estimativa"
                descricao="Avisa o cliente, no resumo do agendamento online, que o valor do serviço pode ser ajustado no dia (pelagem muito embolada, por exemplo). A taxa do TaxiDog não muda."
                descricaoQuandoDesativado="Desativado, o preço mostrado no agendamento online é apresentado como valor final."
                ativoInicial={!!estimadoRow?.precos_estimados}
                action={alternarPrecosEstimadosAction}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
