import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { IconChevronRight, IconMapPin, IconStore } from '@/components/icons'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Novo Agendamento' }

// "Novo agendamento" da conta do cliente: aqui ele só escolhe o petshop. O
// agendamento em si é o MESMO fluxo do link da loja (/agendamento/[id],
// AgendamentoOnlineWizard) — que já reconhece o cliente logado, pula a
// etapa de conta e mostra os pets dele. Um fluxo só: o que muda num lugar
// vale para os dois. Com um petshop só, vai direto para ele.
export default async function NovoAgendamentoPage() {
  const supabase = await createClient()
  const user = await obterUsuario()

  // Só petshops com quem o cliente já tem vínculo (migration 014/026) —
  // ou seja, onde ele já agendou pelo menos uma vez pelo link público da
  // loja. Evita expor um marketplace com TODOS os petshops da plataforma.
  const { data: vinculos } = await supabase
    .from('cliente_lojista')
    .select('id_lojista')
    .eq('id_cliente', user!.id)

  const idsLojistas = (vinculos ?? []).map(v => v.id_lojista)

  const { data: lojistas } = idsLojistas.length
    ? await supabase
        .from('lojista')
        .select('id_lojista, nome_loja, cidade, estado, descricao, logo_url')
        .eq('ativo', true)
        .eq('aceita_agendamento_online', true)
        .in('id_lojista', idsLojistas)
        .order('nome_loja')
    : { data: [] as { id_lojista: string; nome_loja: string; cidade: string | null; estado: string | null; descricao: string | null; logo_url: string | null }[] }

  const lojas = lojistas ?? []
  if (lojas.length === 1) redirect(`/agendamento/${lojas[0].id_lojista}`)

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Novo Agendamento</h1>
        <p className="page-subtitle">Escolha o petshop para agendar</p>
      </div>

      <div className="card wizard-etapa">
        {lojas.length === 0 ? (
          <div className="empty-state">
            <IconStore style={{ width: 32, height: 32, color: 'var(--gray-500)', margin: '0 auto var(--space-4)' }} />
            <div className="empty-state-title">Nenhum petshop disponível ainda</div>
            <p>
              Você ainda não tem um petshop vinculado. Peça o link de agendamento do seu
              petshop e faça o primeiro agendamento por lá — depois disso, ele aparece aqui
              para agendamentos futuros mais rápidos.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {lojas.map(l => (
              <Link key={l.id_lojista} href={`/agendamento/${l.id_lojista}`} className="loja-opcao">
                <span className="loja-opcao-logo">
                  {l.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                    <img src={l.logo_url} alt="" />
                  ) : (
                    <IconStore style={{ width: 18, height: 18 }} />
                  )}
                </span>
                <span className="loja-opcao-texto">
                  <span className="loja-opcao-nome">{l.nome_loja}</span>
                  {l.cidade && (
                    <span className="loja-opcao-sub">
                      <IconMapPin style={{ width: 12, height: 12 }} /> {l.cidade}{l.estado ? `, ${l.estado}` : ''}
                    </span>
                  )}
                  {l.descricao && <span className="loja-opcao-sub">{l.descricao}</span>}
                </span>
                <IconChevronRight style={{ width: 18, height: 18, flexShrink: 0, color: 'var(--primary-400)' }} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
