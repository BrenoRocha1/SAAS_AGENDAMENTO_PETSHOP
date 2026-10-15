import { createClient } from '@/lib/supabase/server'
import { obterUsuario } from '@/lib/supabase/usuario'
import type { Metadata } from 'next'
import { diaSemanaBrasil, agoraBrasilHHMM } from '@/lib/agenda'
import type { LojaMarketplace } from '@/lib/marketplace'
import TelaPetshops from '@/components/cliente/TelaPetshops'

export const metadata: Metadata = { title: 'Petshops — SAIP' }

interface Lojista {
  id_lojista: string
  nome_loja: string
  logo_url: string | null
  descricao: string | null
  cidade: string | null
  estado: string | null
  slug: string | null
  telefone: string | null
}

interface HorarioPorLoja {
  id_lojista: string
  dia_semana: string
  hr_inicio: string
  hr_fim: string
  ativo: boolean
}

// Aberto/fechado agora, pelo horário de funcionamento de hoje.
function statusHoje(horarios: HorarioPorLoja[], idLojista: string): LojaMarketplace['status'] {
  const diaSemana = diaSemanaBrasil()
  const agora = agoraBrasilHHMM()
  const h = horarios.find(x => x.id_lojista === idLojista && x.dia_semana === diaSemana && x.ativo)
  if (!h) return { rotulo: 'Fechado hoje', tom: 'danger' }
  if (agora < h.hr_inicio.slice(0, 5)) return { rotulo: `Abre às ${h.hr_inicio.slice(0, 5)}`, tom: 'warning' }
  if (agora < h.hr_fim.slice(0, 5)) return { rotulo: 'Aberto', tom: 'success' }
  return { rotulo: 'Fechado', tom: 'danger' }
}

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const supabase = await createClient()
  const user = await obterUsuario()
  const { aba } = await searchParams

  // Petshops ativos com agendamento online habilitado. A policy "lojista:
  // clientes podem ver lojas ativas" (migration 002) cobre usuários autenticados.
  const [
    { data: lojistasRaw },
    { data: horariosRaw },
    { data: vinculosRaw },
  ] = await Promise.all([
    supabase
      .from('lojista')
      .select('id_lojista, nome_loja, logo_url, descricao, cidade, estado, slug, telefone')
      .eq('ativo', true)
      .eq('aceita_agendamento_online', true)
      .order('nome_loja'),
    supabase.from('horario').select('id_lojista, dia_semana, hr_inicio, hr_fim, ativo'),
    // Lojas em que o cliente já agendou (sobem na lista).
    supabase.from('cliente_lojista').select('id_lojista').eq('id_cliente', user!.id),
  ])

  const horarios = (horariosRaw ?? []) as HorarioPorLoja[]
  const minhas = new Set(((vinculosRaw ?? []) as { id_lojista: string }[]).map(v => v.id_lojista))

  const lojas: LojaMarketplace[] = ((lojistasRaw ?? []) as Lojista[])
    .map(lj => {
      const telefone = (lj.telefone ?? '').replace(/\D/g, '')
      return {
        id: lj.id_lojista,
        nome: lj.nome_loja,
        logoUrl: lj.logo_url,
        descricao: lj.descricao,
        local: [lj.cidade, lj.estado].filter(Boolean).join(', '),
        status: statusHoje(horarios, lj.id_lojista),
        minha: minhas.has(lj.id_lojista),
        linkVitrine: `/${lj.slug ?? lj.id_lojista}`,
        linkAgendar: `/agendamento/${lj.slug ?? lj.id_lojista}`,
        whatsapp: telefone ? `55${telefone}` : null,
      }
    })
    .sort((a, b) => Number(b.minha) - Number(a.minha) || a.nome.localeCompare(b.nome, 'pt-BR'))

  return <TelaPetshops lojas={lojas} abaInicial={aba === 'produtos' ? 'produtos' : 'petshops'} />
}
