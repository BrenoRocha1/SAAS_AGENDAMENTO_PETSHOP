'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { criarAgendamentoAction } from '@/lib/actions'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { hojeBrasilISO, removerHorariosPassados } from '@/lib/agenda'
import { normalizarBloqueios, type BloqueioLoja } from '@/lib/bloqueios'
import { rotuloUnidade } from '@/lib/produto'
import { ptBR } from 'date-fns/locale'
import SeletorDeData from './SeletorDeData'
import ConfirmacaoAgendamento from './ConfirmacaoAgendamento'
import PagamentoEtapa, { PixDaLoja } from './PagamentoEtapa'
import PlanoNoPedido, { useMeusBeneficios } from './PlanoNoPedido'
import { coberturaDoPlano } from '@/lib/planos'
import { FORMAS_LOJA_PADRAO, ROTULO_FORMA_PAGAMENTO, normalizarFormasLoja, type FormaPagamento, type FormasLoja } from '@/lib/pagamento'
import TaxiDogEtapa, {
  ESTADO_TRANSPORTE_INICIAL,
  ResumoTaxiDog,
  escolhaDoTransporte,
  taxiDogParaFormulario,
  type EstadoTransporte,
} from './TaxiDogEtapa'
import { ROTULO_MODALIDADE, formatarReais } from '@/lib/taxidog'
import {
  IconAlert, IconCalendar, IconCheck, IconClock, IconDog,
  IconMapPin, IconMoney, IconPackage, IconScissors, IconStore,
} from '@/components/icons'

interface Lojista {
  id_lojista: string
  nome_loja: string
  telefone?: string | null
  cidade?: string | null
  estado?: string | null
  descricao?: string | null
}

interface Pet {
  id_pet: string
  nome: string
  raca: string
  sexo: string
}

interface Servico {
  id_servico: string
  nome: string
  descricao: string | null
  preco: number
  duracao: number
}

// Produtos com disponivel_agendamento_online=true (migration 039) — o
// cliente pode adicionar junto do serviço, na etapa de confirmação.
interface Produto {
  id_produto: string
  nome: string
  preco_venda: number
  unidade_venda: string
  estoque_atual: number
}

interface Slot {
  hr_slot: string
  disponivel: boolean
}

interface Horario {
  dia_semana: string
  ativo: boolean
}

interface Janela {
  minValor: number
  minUnidade: 'horas' | 'dias'
  maxValor: number
  maxUnidade: 'horas' | 'dias'
}

const JANELA_PADRAO: Janela = { minValor: 0, minUnidade: 'horas', maxValor: 30, maxUnidade: 'dias' }

interface Props {
  pets: Pet[]
  lojistas: Lojista[]
}

// Etapas nomeadas: "Transporte" só existe quando a loja escolhida oferece
// TaxiDog no agendamento online (migration 042). "Pagamento" vem logo
// depois do transporte (migration 057).
type Step = 'loja' | 'petservico' | 'transporte' | 'pagamento' | 'datahora' | 'confirmar'

const ROTULO_ETAPA: Record<Step, string> = {
  loja: 'Petshop',
  petservico: 'Pet & Serviço',
  transporte: 'Transporte',
  pagamento: 'Pagamento',
  datahora: 'Data & Hora',
  confirmar: 'Confirmar',
}

function ProgressoEtapas({ etapas, atual }: { etapas: Step[]; atual: Step }) {
  const passo = etapas.indexOf(atual) + 1
  const percentual = (passo / etapas.length) * 100
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <div className="flex justify-between" style={{ marginBottom: 'var(--space-2)' }}>
        <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{ROTULO_ETAPA[atual]}</span>
        <span className="text-xs text-muted">Passo {passo} de {etapas.length}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--gray-700)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${percentual}%`,
            borderRadius: 999,
            background: 'var(--primary-500)',
            transition: 'width 0.35s ease',
          }}
        />
      </div>
    </div>
  )
}

export default function NovoAgendamentoWizard({ pets, lojistas }: Props) {
  const supabase = createClient()
  const [step, setStep] = useState<Step>('loja')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [lojistaId, setLojistaId] = useState('')
  const [taxidogDisponivel, setTaxidogDisponivel] = useState(false)
  const [precosEstimados, setPrecosEstimados] = useState(false)
  const [transporte, setTransporte] = useState<EstadoTransporte>(ESTADO_TRANSPORTE_INICIAL)
  const escolhaTaxiDog = escolhaDoTransporte(transporte)
  // Depois de agendar: tela de confirmação (WhatsApp + link pra acompanhar).
  const [agendado, setAgendado] = useState<{
    id: string | null
    plano: { aplicados: number; valorAbatido: number } | null
    aviso: string | null
  } | null>(null)
  // Formas que a loja escolhida aceita e a escolhida pelo cliente.
  const [formasLoja, setFormasLoja] = useState<FormasLoja>(FORMAS_LOJA_PADRAO)
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(null)

  function escolherLojista(id: string) {
    if (id === lojistaId) return
    setLojistaId(id)
    // Endereço/taxa cotados pra outra loja não valem pra esta.
    setTransporte(ESTADO_TRANSPORTE_INICIAL)
    setTaxidogDisponivel(false)
    setPrecosEstimados(false)
    setFormaPagamento(null)
    setFormasLoja(FORMAS_LOJA_PADRAO)
  }
  const [petId, setPetId] = useState('')
  const [servicos, setServicos] = useState<Servico[]>([])
  const [servicoId, setServicoId] = useState('')
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<Produto[]>([])
  const [quantidadesProdutos, setQuantidadesProdutos] = useState<Record<string, string>>({})
  const [horarios, setHorarios] = useState<Horario[]>([])
  // Dias que a loja fechou (feriado, folga — migration 066).
  const [bloqueios, setBloqueios] = useState<BloqueioLoja[]>([])
  const [janela, setJanela] = useState<Janela>(JANELA_PADRAO)
  const [data, setData] = useState('')
  // Horários da data+serviço escolhidos. Guarda a chave pra distinguir
  // "ainda carregando" (outra chave) de "carregou e não há horário" ([]).
  const [slotsCarregados, setSlotsCarregados] = useState<{ chave: string; slots: Slot[] } | null>(null)
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')

  useEffect(() => {
    if (!lojistaId) return
    supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao')
      .eq('id_lojista', lojistaId)
      .eq('status', 'Ativo')
      .then(({ data }) => setServicos(data ?? []))
  }, [lojistaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Produtos que a loja liberou pra venda no agendamento online (migration
  // 039) — só aparecem se tiverem estoque; a etapa de confirmação deixa
  // adicionar junto do serviço.
  useEffect(() => {
    if (!lojistaId) return
    supabase
      .from('produto')
      .select('id_produto, nome, preco_venda, unidade_venda, estoque_atual')
      .eq('id_lojista', lojistaId)
      .eq('status', 'Ativo')
      .eq('disponivel_agendamento_online', true)
      .gt('estoque_atual', 0)
      .order('nome')
      .then(({ data }) => setProdutosDisponiveis(data ?? []))
  }, [lojistaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // TaxiDog + aviso de preço estimado da loja escolhida (migration 042).
  // Sem a migration, as consultas falham e tudo segue como antes.
  useEffect(() => {
    if (!lojistaId) return
    supabase
      .rpc('fn_taxidog_publico', { p_id_lojista: lojistaId })
      .then(({ data }) => setTaxidogDisponivel(!!(data as { disponivel: boolean }[] | null)?.[0]?.disponivel))
    supabase
      .from('lojista')
      .select('precos_estimados')
      .eq('id_lojista', lojistaId)
      .maybeSingle()
      .then(({ data }) => setPrecosEstimados(!!data?.precos_estimados))
    // Formas de pagamento aceitas (migration 057).
    supabase
      .rpc('fn_formas_pagamento_loja', { p_id_lojista: lojistaId })
      .then(({ data }) => setFormasLoja(normalizarFormasLoja(data)))
  }, [lojistaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dias abertos + janela de antecedência da loja escolhida — precisa pra
  // desenhar o calendário (SeletorDeData) desabilitando dias fechados e
  // fora da janela, igual ao Agendamento Online. fn_criar_agendamento já
  // recusa no servidor uma data fora dessas regras; isso aqui é só pra
  // não deixar o cliente escolher uma data que sempre vai ser rejeitada.
  useEffect(() => {
    if (!lojistaId) return
    supabase
      .from('horario')
      .select('dia_semana, ativo')
      .eq('id_lojista', lojistaId)
      .then(({ data }) => setHorarios(data ?? []))
    // Até o fim do ano que vem (o banco limita a ~400 dias).
    const hoje = hojeBrasilISO()
    supabase
      .rpc('fn_bloqueios_loja', { p_id_lojista: lojistaId, p_de: hoje, p_ate: `${Number(hoje.slice(0, 4)) + 1}-12-31` })
      .then(({ data }) => setBloqueios(normalizarBloqueios(data)))
    supabase
      .from('lojista')
      .select('agendamento_min_valor, agendamento_min_unidade, agendamento_max_valor, agendamento_max_unidade')
      .eq('id_lojista', lojistaId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setJanela({
          minValor: data.agendamento_min_valor,
          minUnidade: data.agendamento_min_unidade,
          maxValor: data.agendamento_max_valor,
          maxUnidade: data.agendamento_max_unidade,
        })
      })
  }, [lojistaId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!data || !servicoId || !lojistaId) return
    const servico = servicos.find(s => s.id_servico === servicoId)
    if (!servico) return
    const dataSelecionada = data
    supabase
      .rpc('fn_horarios_disponiveis', {
        p_id_lojista: lojistaId,
        p_data: data,
        p_duracao: servico.duracao,
      })
      .then(({ data: rows }) => {
        setSlotsCarregados({ chave: `${dataSelecionada}|${servico.id_servico}`, slots: removerHorariosPassados(rows ?? [], dataSelecionada) })
        setHora('')
      })
  }, [data, servicoId, lojistaId]) // eslint-disable-line react-hooks/exhaustive-deps

  const servicoSel = servicos.find(s => s.id_servico === servicoId)
  // Preço de cada serviço PARA o pet escolhido (faixas por porte/raça,
  // migration 010) — o mesmo que o banco cobra; o link público já faz isso.
  const [precosDoPet, setPrecosDoPet] = useState<{ petId: string; precos: Record<string, number> } | null>(null)
  useEffect(() => {
    if (!petId || servicos.length === 0) return
    let cancelado = false
    Promise.all(servicos.map(s =>
      supabase.rpc('fn_calcular_preco_servico', { p_id_servico: s.id_servico, p_id_pet: petId })
        .then(({ data: preco, error }) => [s.id_servico, error || preco == null ? Number(s.preco) : Number(preco)] as const)
    )).then(pares => { if (!cancelado) setPrecosDoPet({ petId, precos: Object.fromEntries(pares) }) })
    return () => { cancelado = true }
  }, [petId, servicos]) // eslint-disable-line react-hooks/exhaustive-deps
  const precoDoServico = (s: { id_servico: string; preco: number | string }) =>
    precosDoPet?.petId === petId && precosDoPet.precos[s.id_servico] != null ? precosDoPet.precos[s.id_servico] : Number(s.preco)
  const slots = slotsCarregados?.chave === `${data}|${servicoId}` ? slotsCarregados.slots : null
  const lojistaSel = lojistas.find(l => l.id_lojista === lojistaId)
  const petSel = pets.find(p => p.id_pet === petId)

  const itensCarrinhoProdutos = useMemo(() =>
    produtosDisponiveis
      .map(produto => ({ produto, quantidade: parseFloat(quantidadesProdutos[produto.id_produto] || '0') }))
      .filter(item => item.quantidade > 0),
    [produtosDisponiveis, quantidadesProdutos]
  )
  const totalProdutos = itensCarrinhoProdutos.reduce((acc, i) => acc + i.produto.preco_venda * i.quantidade, 0)
  const valorTaxiDog = escolhaTaxiDog?.cotacao.valor ?? 0
  const totalSemPlano = (servicoSel ? precoDoServico(servicoSel) : 0) + totalProdutos + valorTaxiDog

  // Plano do cliente (migration 075): saldo do pet nesta loja no período
  // da data escolhida (antes de escolher a data, vale o período de hoje).
  const planosDoPet = useMeusBeneficios(lojistaId, petId, data)
  const coberturaServicos = coberturaDoPlano(planosDoPet, servicos.map(s => s.id_servico))
  const cobertura = coberturaDoPlano(planosDoPet, servicoId ? [servicoId] : [])
  const [usarPlano, setUsarPlano] = useState(true)
  const vaiUsarPlano = usarPlano && cobertura.cobertos.length > 0
  const descontoPlano = vaiUsarPlano && servicoSel ? precoDoServico(servicoSel) : 0
  const totalGeral = totalSemPlano - descontoPlano
  // O plano cobre o pedido inteiro (só o serviço dele, sem produto nem
  // TaxiDog): não há o que pagar, então a forma de pagamento nem aparece.
  // Se depois entrar algo cobrado (um produto na confirmação, por exemplo),
  // a etapa volta e é exigida antes de confirmar. É a mesma conta que o
  // servidor refaz (formaSemCobrancaPeloPlano); se ele discordar — o saldo
  // acabou nesse meio-tempo —, `planoNaoCobriu` traz o pagamento de volta.
  const [planoNaoCobriu, setPlanoNaoCobriu] = useState(false)
  const nadaAPagar = vaiUsarPlano && !planoNaoCobriu && itensCarrinhoProdutos.length === 0 && !escolhaTaxiDog

  const todasEtapas: Step[] = taxidogDisponivel
    ? ['loja', 'petservico', 'transporte', 'pagamento', 'datahora', 'confirmar']
    : ['loja', 'petservico', 'pagamento', 'datahora', 'confirmar']
  // A barra de progresso conta o pagamento só quando ele é pedido (ou
  // quando a pessoa já está nele).
  const etapas = todasEtapas.filter(e => e !== 'pagamento' || !nadaAPagar || step === 'pagamento')
  const vizinha = (atual: Step, sentido: 1 | -1) => {
    let i = todasEtapas.indexOf(atual) + sentido
    if (todasEtapas[i] === 'pagamento' && nadaAPagar) i += sentido
    return todasEtapas[i] ?? atual
  }
  const avancar = () => setStep(atual => vizinha(atual, 1))
  const voltar = () => setStep(atual => vizinha(atual, -1))

  function handleSubmit() {
    setError(null)
    const formData = new FormData()
    formData.set('id_lojista', lojistaId)
    formData.set('id_pet', petId)
    formData.set('id_servico', servicoId)
    formData.set('dt_agendamento', data)
    formData.set('hr_agendamento', hora)
    formData.set('obs', obs)
    if (itensCarrinhoProdutos.length > 0) {
      formData.set('produtos', JSON.stringify(itensCarrinhoProdutos.map(i => ({ id_produto: i.produto.id_produto, quantidade: i.quantidade }))))
    }
    if (escolhaTaxiDog) formData.set('taxidog', taxiDogParaFormulario(escolhaTaxiDog))
    if (!nadaAPagar) {
      if (!formaPagamento) {
        setError('Escolha a forma de pagamento.')
        setStep('pagamento')
        return
      }
      formData.set('forma_pagamento', formaPagamento)
    }
    if (vaiUsarPlano) formData.set('usar_plano', '1')

    startTransition(async () => {
      const result = await criarAgendamentoAction(formData)
      if (result?.error) {
        setError(result.error)
        // O servidor não confirmou a cobertura do plano: pede o pagamento.
        if (nadaAPagar && result.error === 'Escolha a forma de pagamento.') {
          setPlanoNaoCobriu(true)
          setStep('pagamento')
        }
        return
      }
      const plano = result && 'plano' in result ? result.plano : undefined
      setAgendado({
        id: result && 'id_agendamento' in result && typeof result.id_agendamento === 'string' ? result.id_agendamento : null,
        plano: plano ? { aplicados: plano.aplicados, valorAbatido: plano.valorAbatido } : null,
        aviso: plano?.aviso ?? null,
      })
    })
  }

  // "agora" via useState(() => ...) — lazy initializer, não chamada direta
  // de Date.now() no corpo do componente (regra de pureza).
  const [agora] = useState(() => Date.now())
  const diasAbertos = useMemo(() => new Set(horarios.filter(h => h.ativo).map(h => h.dia_semana)), [horarios])
  const minInstante = useMemo(() => new Date(agora + (janela.minUnidade === 'dias' ? janela.minValor * 24 : janela.minValor) * 3600_000), [agora, janela])
  const maxInstante = useMemo(() => new Date(agora + (janela.maxUnidade === 'dias' ? janela.maxValor * 24 : janela.maxValor) * 3600_000), [agora, janela])

  if (agendado && lojistaSel && servicoSel) {
    return (
      <div style={{ maxWidth: 680 }}>
        <ConfirmacaoAgendamento
          idAgendamento={agendado.id}
          loja={{ nome: lojistaSel.nome_loja, telefone: lojistaSel.telefone }}
          pet={petSel?.nome ?? ''}
          itens={[
            servicoSel.nome,
            ...itensCarrinhoProdutos.map(i => `${i.produto.nome} (${i.quantidade} ${rotuloUnidade(i.produto.unidade_venda)})`),
            ...(escolhaTaxiDog ? [`TaxiDog: ${ROTULO_MODALIDADE[escolhaTaxiDog.modalidade]} (${formatarReais(escolhaTaxiDog.cotacao.valor)})`] : []),
          ]}
          data={data}
          hora={hora}
          total={Math.max(0, totalSemPlano - (agendado.plano?.valorAbatido ?? 0))}
          pagamento={!nadaAPagar && formaPagamento ? { forma: formaPagamento, pixChave: formasLoja.pix_chave, pixNome: formasLoja.pix_nome } : null}
          plano={agendado.plano}
          aviso={agendado.aviso}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <ProgressoEtapas etapas={etapas} atual={step} />

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Escolher Petshop */}
      {step === 'loja' && (
        <div className="card wizard-etapa">
          <h3 className="so-desktop" style={{ marginBottom: 'var(--space-6)' }}>Escolha o Petshop</h3>
          {lojistas.length === 0 ? (
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
              {lojistas.map(l => (
                <div
                  key={l.id_lojista}
                  onClick={() => escolherLojista(l.id_lojista)}
                  className={`opcao-app ${lojistaId === l.id_lojista ? 'is-selecionada' : ''}`}
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${lojistaId === l.id_lojista ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                    background: lojistaId === l.id_lojista ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-md)', flexShrink: 0,
                        background: 'var(--primary-soft-bg)', border: '1px solid var(--primary-soft-border)',
                        color: 'var(--primary-400)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <IconStore style={{ width: 18, height: 18 }} />
                    </div>
                    <div>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{l.nome_loja}</div>
                      {l.cidade && (
                        <div className="text-sm text-muted flex items-center gap-1">
                          <IconMapPin style={{ width: 12, height: 12 }} /> {l.cidade}{l.estado ? `, ${l.estado}` : ''}
                        </div>
                      )}
                      {l.descricao && <div className="text-sm text-muted" style={{ marginTop: 2 }}>{l.descricao}</div>}
                    </div>
                    {lojistaId === l.id_lojista && (
                      <span style={{ marginLeft: 'auto', color: 'var(--primary-400)' }}>
                        <IconCheck style={{ width: 18, height: 18 }} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end" style={{ marginTop: 'var(--space-6)' }}>
            <button
              className="btn btn-primary"
              disabled={!lojistaId}
              onClick={avancar}
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* Pet e Serviço */}
      {step === 'petservico' && (
        <div className="card wizard-etapa">
          <h3 className="so-desktop" style={{ marginBottom: 'var(--space-6)' }}>Selecione o Pet e Serviço</h3>

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label form-label-required">Qual pet?</label>
            {pets.length === 0 ? (
              <div className="alert alert-warning">
                <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>Você não tem pets cadastrados. <Link href="/cliente/pets/novo">Cadastre um pet</Link> primeiro.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {pets.map(p => (
                  <div
                    key={p.id_pet}
                    onClick={() => setPetId(p.id_pet)}
                    className={`opcao-app ${petId === p.id_pet ? 'is-selecionada' : ''}`}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${petId === p.id_pet ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                      background: petId === p.id_pet ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <IconDog style={{ width: 16, height: 16, color: 'var(--gray-400)' }} />
                    <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</span>
                    <span className="text-sm text-muted">— {p.raca}</span>
                    {petId === p.id_pet && <span style={{ marginLeft: 'auto', color: 'var(--primary-400)' }}><IconCheck style={{ width: 16, height: 16 }} /></span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Qual serviço?</label>
            {servicos.length === 0 ? (
              <p className="text-sm text-muted">Carregando serviços...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {servicos.map(s => {
                  const noPlano = petId ? coberturaServicos.cobertos.find(c => c.id_servico === s.id_servico) : undefined
                  return (
                  <div
                    key={s.id_servico}
                    onClick={() => setServicoId(s.id_servico)}
                    className={`opcao-app ${servicoId === s.id_servico ? 'is-selecionada' : ''}`}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${servicoId === s.id_servico ? 'var(--primary-500)' : 'var(--gray-700)'}`,
                      background: servicoId === s.id_servico ? 'var(--primary-soft-bg)' : 'var(--gray-850)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <IconScissors style={{ width: 16, height: 16, color: 'var(--gray-400)' }} />
                    <div style={{ flex: 1 }}>
                      <div className="font-semibold" style={{ color: 'var(--gray-100)' }}>{s.nome}</div>
                      {s.descricao && <div className="text-sm text-muted">{s.descricao}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="font-semibold text-success">{formatarReais(precoDoServico(s))}</div>
                      <div className="text-xs text-muted">{s.duracao} min</div>
                      {noPlano && (
                        <div className="text-xs font-semibold" style={{ color: 'var(--primary-400)' }}>
                          No seu plano · {noPlano.quantidade - noPlano.usados} de {noPlano.quantidade}
                        </div>
                      )}
                    </div>
                    {servicoId === s.id_servico && <span style={{ color: 'var(--primary-400)' }}><IconCheck style={{ width: 16, height: 16 }} /></span>}
                  </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex justify-between" style={{ marginTop: 'var(--space-6)' }}>
            <button className="btn btn-secondary" onClick={voltar}>Voltar</button>
            <button
              className="btn btn-primary"
              disabled={!petId || !servicoId}
              onClick={avancar}
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* Transporte — só quando a loja oferece TaxiDog */}
      {step === 'transporte' && (
        <>
          <TaxiDogEtapa idLojista={lojistaId} valor={transporte} onChange={setTransporte} onContinuar={avancar} rotuloContinuar="Próximo" />
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={voltar}>Voltar</button>
          </div>
        </>
      )}

      {/* Forma de pagamento — depois do transporte */}
      {step === 'pagamento' && (
        <>
          <PagamentoEtapa
            formas={formasLoja}
            valor={formaPagamento}
            onChange={setFormaPagamento}
            resumoTaxiDog={escolhaTaxiDog ? `TaxiDog · ${ROTULO_MODALIDADE[escolhaTaxiDog.modalidade]} · ${formatarReais(escolhaTaxiDog.cotacao.valor)}` : null}
            onContinuar={avancar}
            rotuloContinuar="Próximo"
          />
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={voltar}>Voltar</button>
          </div>
        </>
      )}

      {/* Data e Hora */}
      {step === 'datahora' && (
        <div className="card wizard-etapa">
          <h3 className="so-desktop" style={{ marginBottom: 'var(--space-6)' }}>Escolha a Data e Horário</h3>

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label form-label-required">Data</label>
            <SeletorDeData
              diasAbertos={diasAbertos}
              minInstante={minInstante}
              maxInstante={maxInstante}
              dataSelecionada={data}
              onSelecionar={setData}
              bloqueios={bloqueios}
            />
          </div>

          {data && (
            <div className="form-group">
              <label className="form-label form-label-required">Horário disponível</label>
              {slots === null ? (
                <div className="alert alert-info">
                  <IconClock style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>Carregando horários disponíveis...</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="alert alert-info">
                  <IconClock style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <span>Nenhum horário disponível nesse dia. Escolha outra data.</span>
                </div>
              ) : (
                <div className="slots-grid">
                  {slots.map(slot => {
                    const horaCurta = slot.hr_slot.slice(0, 5)
                    return (
                      <button
                        key={slot.hr_slot}
                        type="button"
                        className={`slot ${!slot.disponivel ? 'slot-unavailable' : ''} ${hora === horaCurta ? 'slot-selected' : ''}`}
                        onClick={() => slot.disponivel && setHora(horaCurta)}
                        disabled={!slot.disponivel}
                      >
                        {horaCurta}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between" style={{ marginTop: 'var(--space-6)' }}>
            <button className="btn btn-secondary" onClick={voltar}>Voltar</button>
            <button
              className="btn btn-primary"
              disabled={!data || !hora}
              onClick={avancar}
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* Confirmação */}
      {step === 'confirmar' && (
        <div className="card wizard-etapa">
          <h3 className="so-desktop" style={{ marginBottom: 'var(--space-6)' }}>Confirmar Agendamento</h3>

          <PlanoNoPedido
            cobertura={cobertura}
            nomes={servicoSel ? { [servicoSel.id_servico]: servicoSel.nome } : {}}
            data={data}
            usar={usarPlano}
            onUsar={setUsarPlano}
            disabled={isPending}
          />

          <div
            style={{
              background: 'var(--gray-850)',
              border: '1px solid var(--gray-800)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            {[
              { Icon: IconStore, label: 'Petshop', value: lojistaSel?.nome_loja },
              { Icon: IconDog, label: 'Pet', value: `${petSel?.nome} — ${petSel?.raca}` },
              { Icon: IconScissors, label: 'Serviço', value: servicoSel?.nome },
              { Icon: IconCalendar, label: 'Data', value: format(new Date(data + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) },
              { Icon: IconClock, label: 'Horário', value: hora?.slice(0, 5) },
              { Icon: IconClock, label: 'Duração', value: `${servicoSel?.duracao} minutos` },
              { Icon: IconMoney, label: 'Valor do serviço', value: formatarReais(servicoSel ? precoDoServico(servicoSel) : 0) },
            ].map(item => (
              <div key={item.label} className="flex justify-between">
                <span className="text-sm text-muted flex items-center gap-1">
                  <item.Icon style={{ width: 13, height: 13 }} /> {item.label}
                </span>
                <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{item.value}</span>
              </div>
            ))}

            <ResumoTaxiDog escolha={escolhaTaxiDog} disponivel={taxidogDisponivel} />

            {totalProdutos > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-muted flex items-center gap-1"><IconPackage style={{ width: 13, height: 13 }} /> Produtos</span>
                <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{formatarReais(totalProdutos)}</span>
              </div>
            )}

            {descontoPlano > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-muted">Saldo do plano</span>
                <span className="font-semibold" style={{ color: 'var(--primary-400)' }}>− {formatarReais(descontoPlano)}</span>
              </div>
            )}

            <div className="flex justify-between" style={{ paddingTop: 'var(--space-3)', borderTop: '1px solid var(--gray-800)' }}>
              <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>{descontoPlano > 0 ? 'Total a pagar' : 'Total'}</span>
              <span className="font-semibold text-success">{formatarReais(totalGeral)}</span>
            </div>
            {!nadaAPagar && (
              <div className="flex justify-between">
                <span className="text-sm text-muted">Pagamento</span>
                <span className="font-semibold" style={{ color: 'var(--gray-100)' }}>
                  {formaPagamento ? ROTULO_FORMA_PAGAMENTO[formaPagamento] : '—'}{' '}
                  <button type="button" className="text-accent text-sm" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 400 }} onClick={() => setStep('pagamento')}>
                    {formaPagamento ? 'Trocar' : 'Escolher'}
                  </button>
                </span>
              </div>
            )}
            {!nadaAPagar && formaPagamento === 'pix' && <PixDaLoja chave={formasLoja.pix_chave} nome={formasLoja.pix_nome} />}
            {precosEstimados && (
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                O valor do serviço é uma estimativa: a loja pode ajustar o preço final conforme a pelagem e as condições do pet no dia.
                {escolhaTaxiDog && ' A taxa do TaxiDog não muda.'}
              </p>
            )}
          </div>

          {produtosDisponiveis.length > 0 && (
            <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
              <label className="form-label">Adicionar produtos (opcional)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {produtosDisponiveis.map(p => (
                  <div
                    key={p.id_produto}
                    className="flex items-center gap-3"
                    style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--gray-850)', border: '1px solid var(--gray-800)', borderRadius: 'var(--radius-sm)' }}
                  >
                    <IconPackage style={{ width: 15, height: 15, color: 'var(--gray-500)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div className="text-sm font-semibold" style={{ color: 'var(--gray-100)' }}>{p.nome}</div>
                      <div className="text-xs text-muted">{formatarReais(p.preco_venda)} / {rotuloUnidade(p.unidade_venda)}</div>
                    </div>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: 90 }}
                      min="0"
                      max={p.estoque_atual}
                      step={p.unidade_venda === 'kg' || p.unidade_venda === 'litro' ? '0.1' : '1'}
                      placeholder="0"
                      value={quantidadesProdutos[p.id_produto] ?? ''}
                      onChange={e => setQuantidadesProdutos(prev => ({ ...prev, [p.id_produto]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {totalProdutos > 0 && (
                <p className="text-sm text-success font-semibold" style={{ marginTop: 'var(--space-2)' }}>
                  Subtotal produtos: {formatarReais(totalProdutos)}
                </p>
              )}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label">Observações (opcional)</label>
            <textarea
              className="form-textarea"
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Ex: pet é nervoso com barulho"
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="flex justify-between">
            <button className="btn btn-secondary" onClick={voltar}>Voltar</button>
            <button
              className={`btn btn-primary btn-lg ${isPending ? 'btn-loading' : ''}`}
              disabled={isPending}
              onClick={handleSubmit}
            >
              {isPending ? 'Agendando...' : 'Confirmar Agendamento'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
