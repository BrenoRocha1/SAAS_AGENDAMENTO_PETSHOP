import type { Metadata } from 'next'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/server'
import { formatarEnderecoLoja, formatarTelefone } from '@/lib/format'
import { ROTULO_MODALIDADE, formatarReais, type ModalidadeTaxiDog } from '@/lib/taxidog'
import { classeBadgeStatus, rotuloStatus } from '@/lib/status-agendamento'
import AtualizarSozinho from '@/components/AtualizarSozinho'
import { IconAlert, IconCar, IconCheck, IconClock, IconMapPin, IconPaw, IconWhatsapp } from '@/components/icons'

// Página pública "Acompanhar agendamento" (migration 056). O link vai pro
// cliente pelo WhatsApp depois de agendar; abre sem login e se atualiza
// sozinha.

interface Props {
  params: Promise<{ id: string }>
}

type Status = 'Pendente' | 'Confirmado' | 'Em andamento' | 'Concluído' | 'Cancelado'

interface Acompanhamento {
  data: string
  loja: {
    nome: string
    logo_url: string | null
    telefone: string | null
    endereco: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cidade: string | null
    estado: string | null
  } | null
  pet: { nome: string; foto_url: string | null } | null
  servicos: { nome: string; hora: string; duracao: number; status: Status; valor: number | string }[]
  taxidog: { modalidade: ModalidadeTaxiDog; status: string; valor: number | string; tem_taxidog: boolean } | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const metadata: Metadata = {
  title: 'Acompanhar agendamento',
  robots: { index: false, follow: false },
}

async function carregar(id: string): Promise<Acompanhamento | null> {
  if (!UUID_RE.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_acompanhar_agendamento', { p_id: id })
  if (error || !data) return null
  return data as Acompanhamento
}

const ORDEM: Status[] = ['Pendente', 'Confirmado', 'Em andamento', 'Concluído']

// Status da visita: o do serviço "mais atrasado" entre os não cancelados
// (mesma regra da tela "Meus agendamentos").
function statusDaVisita(servicos: Acompanhamento['servicos']): Status {
  const ativos = servicos.filter(s => s.status !== 'Cancelado')
  if (ativos.length === 0) return 'Cancelado'
  return ativos.reduce((menor, s) => (ORDEM.indexOf(s.status) < ORDEM.indexOf(menor) ? s.status : menor), ativos[0].status)
}

function textoTaxiDog(t: NonNullable<Acompanhamento['taxidog']>, pet: string, status: Status): string {
  switch (t.status) {
    case 'agendada':
      if (t.modalidade === 'entregar') return `Depois do serviço, o TaxiDog leva ${pet} até você.`
      return status === 'Pendente' ? 'O TaxiDog sai depois que a loja confirmar.' : `O TaxiDog vai buscar ${pet} no horário combinado.`
    case 'a_caminho_cliente': return `O TaxiDog está a caminho para buscar ${pet}.`
    case 'no_endereco': return 'O TaxiDog chegou no seu endereço.'
    case 'pet_embarcado': return `${pet} está com o TaxiDog, a caminho da loja.`
    case 'entregue_loja': return `${pet} chegou na loja.`
    case 'pronto_entrega': return `${pet} está pronto — o TaxiDog vai levar até você.`
    case 'a_caminho_entrega': return `O TaxiDog está a caminho da sua casa com ${pet}.`
    case 'no_endereco_entrega': return `O TaxiDog chegou para entregar ${pet}.`
    case 'concluida': return t.modalidade === 'buscar' ? `${pet} foi levado até a loja.` : `${pet} foi entregue.`
    default: return ''
  }
}

function destaque(status: Status, pet: string, quando: string, taxidog: Acompanhamento['taxidog']): { titulo: string; texto: string } {
  switch (status) {
    case 'Pendente':
      return { titulo: 'Aguardando confirmação', texto: `A loja vai confirmar o horário de ${pet} em breve.` }
    case 'Confirmado':
      return { titulo: 'Agendamento confirmado', texto: `Tudo certo para ${quando}.` }
    case 'Em andamento':
      return { titulo: `${pet} está sendo atendido`, texto: 'Assim que terminar, esta página avisa.' }
    case 'Concluído': {
      // Com entrega do TaxiDog: "vai levar" até a corrida terminar.
      const comEntrega = !!taxidog && taxidog.modalidade !== 'buscar'
      if (comEntrega && taxidog.status !== 'concluida') return { titulo: 'Serviço finalizado!', texto: `${pet} está pronto — o TaxiDog vai levar até você.` }
      if (comEntrega) return { titulo: 'Serviço finalizado!', texto: `${pet} já foi entregue. Obrigado!` }
      return { titulo: 'Serviço finalizado!', texto: `${pet} está pronto — já pode vir buscar.` }
    }
    default:
      return { titulo: 'Agendamento cancelado', texto: 'Se quiser remarcar, fale com a loja.' }
  }
}

export default async function AcompanharPage({ params }: Props) {
  const { id } = await params
  const a = await carregar(id)

  if (!a || !a.servicos?.length) {
    return (
      <div className="agenonline-shell lojista-shell" style={{ display: 'flex', alignItems: 'center' }}>
        <div className="agenonline-content" style={{ width: '100%' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <IconAlert style={{ width: 32, height: 32, color: 'var(--gray-600)', margin: '0 auto var(--space-4)' }} />
            <h1 style={{ fontSize: '1.25rem', marginBottom: 'var(--space-2)' }}>Agendamento não encontrado</h1>
            <p className="text-sm text-muted">Confira se o link está completo ou fale com a loja.</p>
          </div>
        </div>
      </div>
    )
  }

  const pet = a.pet?.nome ?? 'Seu pet'
  const status = statusDaVisita(a.servicos)
  const primeiro = a.servicos.find(s => s.status !== 'Cancelado') ?? a.servicos[0]
  const quando = `${format(parseISO(a.data), "EEEE, dd 'de' MMMM", { locale: ptBR })} às ${primeiro.hora.slice(0, 5)}`
  const d = destaque(status, pet, quando, a.taxidog)
  const total = a.servicos.filter(s => s.status !== 'Cancelado').reduce((soma, s) => soma + Number(s.valor), 0)
  const passo = status === 'Cancelado' ? -1 : ORDEM.indexOf(status)
  const endereco = a.loja ? formatarEnderecoLoja(a.loja) : ''
  const telefone = (a.loja?.telefone ?? '').replace(/\D/g, '')

  return (
    <div className="agenonline-shell lojista-shell">
      <AtualizarSozinho segundos={30} />
      <div className="agenonline-content">
        <div className="agenonline-header">
          {a.loja?.logo_url
            // eslint-disable-next-line @next/next/no-img-element -- URL pública do Storage
            ? <img src={a.loja.logo_url} alt={a.loja.nome} className="agenonline-logo" />
            : <div className="agenonline-logo-fallback"><IconPaw style={{ width: 24, height: 24 }} /></div>}
          <div style={{ minWidth: 0 }}>
            <div className="agenonline-loja-nome">{a.loja?.nome ?? 'Petshop'}</div>
            {endereco && <div className="agenonline-loja-local">{endereco}</div>}
          </div>
        </div>

        <div className={`card acomp-destaque is-${status === 'Cancelado' ? 'cancelado' : status === 'Concluído' ? 'pronto' : 'ativo'}`}>
          <div className="acomp-pet">
            {a.pet?.foto_url
              // eslint-disable-next-line @next/next/no-img-element -- URL pública do Storage
              ? <img src={a.pet.foto_url} alt={pet} className="acomp-pet-foto" />
              : <span className="acomp-pet-foto"><IconPaw style={{ width: 22, height: 22 }} /></span>}
            <div>
              <div className="acomp-titulo">{d.titulo}</div>
              <div className="acomp-texto">{d.texto}</div>
            </div>
          </div>

          {passo >= 0 && (
            <ol className="acomp-passos">
              {['Agendado', 'Confirmado', 'Em atendimento', 'Pronto'].map((rotulo, i) => (
                <li key={rotulo} className={i <= passo ? 'is-feito' : ''}>
                  <span className="acomp-passo-bola">{i < passo || (i === passo && status === 'Concluído') ? <IconCheck style={{ width: 12, height: 12 }} /> : i + 1}</span>
                  <span className="acomp-passo-rotulo">{rotulo}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="card acomp-detalhes">
          <div className="acomp-linha">
            <IconClock style={{ width: 16, height: 16 }} />
            <span style={{ textTransform: 'capitalize' }}>{quando}</span>
          </div>

          <div className="acomp-servicos">
            {a.servicos.map((s, i) => (
              <div key={i} className="acomp-servico">
                <div>
                  <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                  <div className="text-xs text-muted">{s.hora.slice(0, 5)}</div>
                </div>
                <span className={`badge ${classeBadgeStatus(s.status)}`}>{rotuloStatus(s.status)}</span>
              </div>
            ))}
          </div>

          {a.taxidog && (
            <div className="acomp-taxidog">
              <IconCar style={{ width: 18, height: 18, flexShrink: 0 }} />
              <div>
                <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>TaxiDog · {ROTULO_MODALIDADE[a.taxidog.modalidade]}</div>
                <div className="text-sm text-muted">{textoTaxiDog(a.taxidog, pet, status)}</div>
              </div>
            </div>
          )}

          {status !== 'Cancelado' && (
            <div className="acomp-total">
              <span>Total</span>
              <span className="font-semibold text-success">{formatarReais(total)}</span>
            </div>
          )}
        </div>

        <div className="acomp-acoes">
          {telefone && (
            <a
              href={`https://wa.me/55${telefone}?text=${encodeURIComponent(`Olá! Tenho um agendamento de ${pet} (${quando}) e queria falar sobre ele.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <IconWhatsapp style={{ width: 16, height: 16 }} /> Falar com a loja
            </a>
          )}
          {endereco && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco.replaceAll(' · ', ', '))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <IconMapPin style={{ width: 16, height: 16 }} /> Como chegar
            </a>
          )}
          {telefone && <p className="text-xs text-muted" style={{ textAlign: 'center', margin: 0 }}>Loja: {formatarTelefone(telefone)}</p>}
        </div>

        <p className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
          Esta página se atualiza sozinha.
        </p>
      </div>
    </div>
  )
}
