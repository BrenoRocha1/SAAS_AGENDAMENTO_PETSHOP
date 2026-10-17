import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import { obterContextoLojista } from '@/lib/lojista-context'
import type { Metadata } from 'next'
import Link from 'next/link'
import { formasAtivas, normalizarFormasLoja } from '@/lib/pagamento'
import { resumoAvaliacoes, resumoEquipe, resumoFormas, resumoHorarios, type HorarioResumo } from '@/lib/resumo-config'
import {
  IconBell,
  IconCalendar,
  IconCar,
  IconChevronRight,
  IconClock,
  IconEye,
  IconMoney,
  IconPencil,
  IconShield,
  IconStar,
} from '@/components/icons'
import './configuracoes.css'

export const metadata: Metadata = { title: 'Configurações — Lojista' }

interface ItemConfig {
  href: string
  icon: React.ReactNode
  titulo: string
  // Como está configurado agora, numa linha.
  resumo: string
  selo?: { texto: string; ligado: boolean }
}

// Índice das configurações: no topo a loja (como os clientes a veem) e,
// em grupos, cada configuração com um resumo do que está valendo agora.
// O app tem a mesma tela (mais/configuracoes.tsx).
export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const user = await obterUsuario()
  const contexto = await obterContextoLojista(supabase, user!.id, user!.user_metadata?.role)
  if (!contexto) return null
  const id = contexto.idLojista

  // Tudo junto e tolerante: o que faltar (migration, permissão) só some do resumo.
  const [loja, extras, horarios, formas, avaliacoes, equipe, taxidog] = await Promise.all([
    supabase.from('lojista').select('nome_loja, cidade, estado, logo_url, kanban_ativo, aceita_agendamento_online').eq('id_lojista', id).maybeSingle(),
    supabase.from('lojista').select('slug, som_novo_agendamento_ativo, bloquear_cancelamento_aceito').eq('id_lojista', id).maybeSingle(),
    supabase.from('horario').select('dia_semana, hr_inicio, hr_fim, ativo').eq('id_lojista', id),
    supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: id }),
    supabase.rpc('fn_avaliacoes_resumo_publico', { p_id_lojista: id }),
    supabase.from('funcionario').select('id_funcionario', { count: 'exact', head: true }).eq('id_lojista', id).eq('ativo', true),
    supabase.from('taxidog_config').select('ativo').eq('id_lojista', id).maybeSingle(),
  ])

  const l = loja.data as { nome_loja: string; cidade: string | null; estado: string | null; logo_url: string | null; kanban_ativo: boolean | null; aceita_agendamento_online: boolean | null } | null
  const x = (extras.error ? null : extras.data) as { slug: string | null; som_novo_agendamento_ativo: boolean | null; bloquear_cancelamento_aceito: boolean | null } | null
  const online = l?.aceita_agendamento_online ?? true
  const kanban = l?.kanban_ativo ?? true
  const aval = (avaliacoes.data ?? null) as { media: number | null; total: number } | null
  const nome = l?.nome_loja ?? 'Sua loja'

  const grupos: { titulo: string; itens: ItemConfig[] }[] = [
    {
      titulo: 'Atendimento',
      itens: [
        {
          href: '/lojista/horarios',
          icon: <IconClock />,
          titulo: 'Horários de funcionamento',
          resumo: horarios.error ? 'Dias, horários e dias fechados' : resumoHorarios((horarios.data ?? []) as HorarioResumo[]),
        },
        {
          href: '/lojista/configuracoes/agendamentos',
          icon: <IconCalendar />,
          titulo: 'Agendamentos',
          resumo: [`Kanban ${kanban ? 'ligado' : 'desligado'}`, x?.bloquear_cancelamento_aceito ? 'sem cancelar depois de aceito' : null].filter(Boolean).join(' · '),
          selo: { texto: online ? 'Online' : 'Só na loja', ligado: online },
        },
        {
          href: '/lojista/configuracoes/pagamentos',
          icon: <IconMoney />,
          titulo: 'Formas de pagamento',
          resumo: formas.error ? 'Pix, dinheiro e cartões' : resumoFormas(formasAtivas(normalizarFormasLoja(formas.data))),
        },
      ],
    },
    {
      titulo: 'Equipe e serviços',
      itens: [
        {
          href: '/lojista/equipe',
          icon: <IconShield />,
          titulo: 'Usuários e permissões',
          resumo: equipe.error ? 'Equipe, administradores e permissões' : resumoEquipe(equipe.count ?? 0),
        },
        {
          href: '/lojista/configuracoes/taxidog',
          icon: <IconCar />,
          titulo: 'TaxiDog',
          resumo: 'Busca e entrega dos pets',
          selo: taxidog.error ? undefined : { texto: taxidog.data?.ativo ? 'Ligado' : 'Desligado', ligado: !!taxidog.data?.ativo },
        },
      ],
    },
    {
      titulo: 'Clientes e avisos',
      itens: [
        {
          href: '/lojista/configuracoes/avaliacoes',
          icon: <IconStar />,
          titulo: 'Avaliações',
          resumo: aval ? resumoAvaliacoes(aval.media, Number(aval.total ?? 0)) : 'O que os clientes dizem da loja',
        },
        {
          href: '/lojista/configuracoes/notificacoes',
          icon: <IconBell />,
          titulo: 'Notificações',
          resumo: x ? `Som de novo agendamento ${x.som_novo_agendamento_ativo === false ? 'desligado' : 'ligado'}` : 'Avisos de novos agendamentos',
        },
      ],
    },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
        <p className="page-subtitle">Como a sua loja funciona e aparece para os clientes.</p>
      </div>

      <div className="cfg">
        {/* A loja, como os clientes a veem. */}
        <section className="cfg-loja">
          {l?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cfg-loja-logo" src={l.logo_url} alt="" />
          ) : (
            <span className="cfg-loja-logo is-inicial" aria-hidden="true">{nome.trim()[0]?.toUpperCase()}</span>
          )}
          <div className="cfg-loja-textos">
            <strong>{nome}</strong>
            <span>{[l?.cidade, l?.estado].filter(Boolean).join(' - ') || 'Endereço não informado'}</span>
          </div>
          <div className="cfg-loja-acoes">
            {x?.slug && (
              <a href={`/${x.slug}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                <IconEye style={{ width: 14, height: 14 }} /> Ver página
              </a>
            )}
            <Link href="/lojista/perfil" className="btn btn-primary btn-sm">
              <IconPencil style={{ width: 14, height: 14 }} /> Dados da loja
            </Link>
          </div>
        </section>

        <div className="cfg-grupos">
          {grupos.map(grupo => (
            <section key={grupo.titulo} className="cfg-grupo">
              <h2 className="cfg-grupo-titulo">{grupo.titulo}</h2>
              <ul className="cfg-lista">
                {grupo.itens.map(item => (
                  <li key={item.href}>
                    <Link href={item.href} className="cfg-item">
                      <span className="cfg-item-icone" aria-hidden="true">{item.icon}</span>
                      <span className="cfg-item-textos">
                        <span className="cfg-item-titulo">{item.titulo}</span>
                        <span className="cfg-item-resumo">{item.resumo}</span>
                      </span>
                      {item.selo && <span className={`cfg-selo ${item.selo.ligado ? 'is-ligado' : ''}`}>{item.selo.texto}</span>}
                      <IconChevronRight className="cfg-item-seta" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
