'use client'

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition, type ComponentType, type SVGProps } from 'react'
import { createClient } from '@/lib/supabase/client'
import { atribuirFuncionarioAction, criarAgendamentoLojistaAction, criarPetLojistaAction } from '@/lib/actions'
import { cotarTaxiDogLojaAction } from '@/lib/actions-taxidog'
import { formatarTelefone, iniciais } from '@/lib/format'
import { ROTULO_MODALIDADE, formatarReais } from '@/lib/taxidog'
import { FORMAS_LOJA_PADRAO, ROTULO_FORMA_PAGAMENTO, formasAtivas, normalizarFormasLoja, type FormaPagamento, type FormasLoja } from '@/lib/pagamento'
import {
  ESTADO_TRANSPORTE_INICIAL,
  TaxiDogCampos,
  escolhaDoTransporte,
  taxiDogParaFormulario,
  transportePronto,
  type EstadoTransporte,
} from '@/components/cliente/TaxiDogEtapa'
import { removerHorariosPassados } from '@/lib/agenda'
import { fechadoODiaTodo, textoBloqueioNoDia } from '@/lib/bloqueios'
import { useBloqueiosDoDia } from './useBloqueiosDoDia'
import SeletorDataHora from '@/components/SeletorDataHora'
import type { PlanoDoPet } from '@/lib/planos'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  IconClose,
  IconAlert,
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCreditCard,
  IconSearch,
  IconDog,
  IconMoney,
  IconPlus,
  IconQrCode,
  IconScissors,
  IconCar,
  IconUser,
  IconUserBadge,
} from '@/components/icons'
import type { ClienteComPets, ServicoAtivo } from './DashboardClient'
import './novo-agendamento.css'

interface Slot {
  hr_slot: string
  disponivel: boolean
}

interface NovoAgendamentoCriado {
  id_agendamento: string
  hr_agendamento: string
  nome_cliente: string
  nome_pet: string
  nome_servico: string
  duracao: number
  status: 'Confirmado'
  valor: number
}

interface Props {
  lojistaId: string
  defaultDate: string
  clientes: ClienteComPets[]
  servicos: ServicoAtivo[]
  funcionarios: { id_funcionario: string; nome: string }[]
  // Vem do perfil do cliente ("Novo agendamento") — cliente já sai
  // selecionado e travado, sem precisar buscar de novo quem já está na
  // tela de origem.
  clienteIdFixo?: string
  // Vem do perfil do funcionário ("Novo Agendamento") — só um valor
  // inicial pro select de profissional (esse campo já era opcional e
  // continua editável, diferente do cliente, que vem travado).
  funcionarioIdPadrao?: string
  // Só o responsável pela conta ou um administrador pode escolher o
  // profissional na criação — ver atribuirFuncionarioAction. Default
  // true porque quem usa este modal a partir do Dashboard já só pode
  // chegar lá sendo lojista ou admin (rota bloqueada pro resto no
  // middleware); só a Agenda precisa passar isso explicitamente.
  podeAtribuirProfissional?: boolean
  onClose: () => void
  onCreated: (item: NovoAgendamentoCriado, dataISO: string) => void
}

// A janela segue o padrão do PDV: as escolhas à esquerda, uma etapa por vez
// (escolheu, já passa para a seguinte), e à direita o resumo com o total e o
// botão de confirmar. No celular é uma etapa por tela, e o resumo com o
// pagamento vira a última. Estilos em novo-agendamento.css.
type Etapa = 'cliente' | 'pet' | 'servico' | 'horario' | 'transporte' | 'pagamento'

// `nome`: a etapa na tela grande. `pergunta`: o título dela no celular.
const ETAPAS: Record<Etapa, { nome: string; pergunta: string }> = {
  cliente: { nome: 'Cliente', pergunta: 'Quem é o cliente?' },
  pet: { nome: 'Pet', pergunta: 'Qual pet?' },
  servico: { nome: 'Serviço', pergunta: 'Qual serviço?' },
  horario: { nome: 'Data e horário', pergunta: 'Quando?' },
  transporte: { nome: 'Transporte', pergunta: 'Como o pet vai até a loja?' },
  pagamento: { nome: 'Pagamento', pergunta: 'Resumo e pagamento' },
}

type Icone = ComponentType<SVGProps<SVGSVGElement>>

const ICONE_FORMA: Record<FormaPagamento, Icone> = {
  pix: IconQrCode,
  cartao_credito: IconCreditCard,
  cartao_debito: IconCreditCard,
  dinheiro: IconMoney,
}

// O mesmo corte de celular do globals.css.
const CORTE_CELULAR = '(max-width: 768px)'
function useCelular() {
  return useSyncExternalStore(
    avisar => {
      const mq = window.matchMedia(CORTE_CELULAR)
      mq.addEventListener('change', avisar)
      return () => mq.removeEventListener('change', avisar)
    },
    () => window.matchMedia(CORTE_CELULAR).matches,
    () => false,
  )
}

const TRANSPORTE_INICIAL: EstadoTransporte = { ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar' }

// Uma linha do resumo: o que já foi escolhido (ou o que falta) e, ao tocar,
// a etapa onde se troca.
function ItemDoResumo({ icone: Icone, texto, detalhe, vazio, valor, onClick, desativado }: {
  icone: Icone
  texto?: string | null
  detalhe?: string | null
  vazio: string
  valor?: string | null
  onClick?: () => void
  desativado?: boolean
}) {
  return (
    <button type="button" className={`na-item ${texto ? '' : 'is-vazio'}`} onClick={onClick} disabled={desativado || !onClick}>
      <Icone />
      <span className="na-item-texto">
        {texto ?? vazio}
        {texto && detalhe ? <small> · {detalhe}</small> : null}
      </span>
      {valor && <span className="na-item-valor">{valor}</span>}
      {onClick && <IconChevronRight className="na-seta" />}
    </button>
  )
}

export default function NovoAgendamentoModal({ lojistaId, defaultDate, clientes, servicos, funcionarios, clienteIdFixo, funcionarioIdPadrao, podeAtribuirProfissional = true, onClose, onCreated }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()
  const [isPendingPet, startPetTransition] = useTransition()

  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteId, setClienteId] = useState(clienteIdFixo ?? '')
  // Cliente com um pet só: o pet já sai escolhido (aqui e em escolherCliente).
  const [petId, setPetId] = useState(() => {
    const pets = clientes.find(c => c.id_cliente === clienteIdFixo)?.pets ?? []
    return pets.length === 1 ? pets[0].id_pet : ''
  })
  const [etapaEscolhida, setEtapa] = useState<Etapa>(!clienteIdFixo ? 'cliente' : petId ? 'servico' : 'pet')
  const celular = useCelular()
  const [obsAberta, setObsAberta] = useState(false)
  const [servicoId, setServicoId] = useState('')
  const [data, setData] = useState(defaultDate)
  const [hora, setHora] = useState('')
  const [obs, setObs] = useState('')
  // Opcional — não bloqueia o agendamento. Se escolhido, é atribuído logo
  // depois de criar (reaproveita atribuirFuncionarioAction, a mesma usada
  // na Agenda/Kanban); se não escolhido, o agendamento nasce sem
  // profissional, igual já acontecia antes desta opção existir.
  const [funcionarioId, setFuncionarioId] = useState(funcionarioIdPadrao ?? '')

  // TaxiDog no agendamento da loja (migration 047). Começa em "o cliente
  // leva o pet" — a maioria dos agendamentos de balcão não usa transporte.
  const [taxidogAtivo, setTaxidogAtivo] = useState(false)
  const [transporte, setTransporte] = useState<EstadoTransporte>(TRANSPORTE_INICIAL)
  const escolhaTaxiDog = escolhaDoTransporte(transporte)

  // Pagamento do pedido (migration 057) — obrigatório; a loja pode lançar
  // já "Pago" (cliente pagou no balcão).
  const [formasLoja, setFormasLoja] = useState<FormasLoja>(FORMAS_LOJA_PADRAO)
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('')
  const [statusPagamento, setStatusPagamento] = useState<'pendente' | 'pago'>('pendente')

  useEffect(() => {
    let cancelado = false
    supabase
      .from('taxidog_config')
      .select('ativo')
      .eq('id_lojista', lojistaId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelado) setTaxidogAtivo(!!data?.ativo) })
    supabase
      .rpc('fn_formas_pagamento_loja', { p_id_lojista: lojistaId })
      .then(({ data }) => { if (!cancelado) setFormasLoja(normalizarFormasLoja(data)) })
    return () => { cancelado = true }
  }, [supabase, lojistaId])

  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoadedKey, setSlotsLoadedKey] = useState<string | null>(null)
  // A consulta dos horários falhou — não confundir com "dia sem expediente".
  const [slotsErro, setSlotsErro] = useState(false)
  // Recarrega os horários depois de uma recusa (ex.: o horário foi
  // ocupado ou fechado enquanto o modal estava aberto).
  const [recargaSlots, setRecargaSlots] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Pets cadastrados aqui mesmo, no meio do fluxo (cliente novo, sem
  // nenhum pet ainda) — somados aos pets que já vieram do servidor.
  const [petsExtras, setPetsExtras] = useState<Record<string, { id_pet: string; nome: string; raca: string }[]>>({})
  const [showNovoPet, setShowNovoPet] = useState(false)
  const [petErro, setPetErro] = useState<string | null>(null)
  const [petNome, setPetNome] = useState('')
  const [petRaca, setPetRaca] = useState('')
  const [petSexo, setPetSexo] = useState<'Macho' | 'Fêmea'>('Macho')
  const [petDtNasc, setPetDtNasc] = useState('')

  // Foto de cada pet do cliente escolhido — a lista que vem da página traz
  // só o nome e a raça.
  const [fotosDosPets, setFotosDosPets] = useState<Record<string, string | null>>({})
  useEffect(() => {
    if (!clienteId) return
    let cancelado = false
    supabase.from('pet').select('id_pet, foto_url').eq('id_cliente', clienteId).then(({ data: rows }) => {
      if (cancelado || !rows) return
      setFotosDosPets(atual => ({ ...atual, ...Object.fromEntries((rows as { id_pet: string; foto_url: string | null }[]).map(p => [p.id_pet, p.foto_url])) }))
    })
    return () => { cancelado = true }
  }, [clienteId, supabase])

  const clienteSel = clientes.find(c => c.id_cliente === clienteId)
  const petsDoCliente = [...(clienteSel?.pets ?? []), ...(petsExtras[clienteId] ?? [])]
  const servicoSel = servicos.find(s => s.id_servico === servicoId)
  // Preço de cada serviço PARA o pet escolhido (faixas por porte/raça,
  // migration 010) — o mesmo cálculo que o banco faz ao criar.
  const [precosDoPet, setPrecosDoPet] = useState<{ petId: string; precos: Record<string, number> } | null>(null)
  // Planos do pet no dia escolhido (migration 060). Sem plano (ou sem a
  // migration), nada muda: o serviço é cobrado avulso como sempre.
  const [planosDoPet, setPlanosDoPet] = useState<{ chave: string; planos: PlanoDoPet[] } | null>(null)
  const [usarBeneficio, setUsarBeneficio] = useState(true)
  const [avisoPlano, setAvisoPlano] = useState<string | null>(null)
  useEffect(() => {
    if (!petId || !data) return
    let cancelado = false
    const chave = `${petId}|${data}`
    supabase.rpc('fn_beneficios_do_pet', { p_id_pet: petId, p_data: data }).then(({ data: rows, error }) => {
      if (!cancelado) setPlanosDoPet({ chave, planos: error ? [] : ((rows ?? []) as PlanoDoPet[]) })
    })
    return () => { cancelado = true }
  }, [petId, data, supabase])
  const planosValidos = planosDoPet?.chave === `${petId}|${data}` ? planosDoPet.planos : []
  // Serviço que o plano do pet ainda cobre neste período (selo na lista).
  const cobertoPeloPlano = (idServico: string) =>
    planosValidos.some(p => p.beneficios.some(b => b.id_servico === idServico && b.quantidade > Number(b.usados)))
  // O benefício deste serviço com mais saldo (se o pet tiver mais de um plano).
  const beneficioServico = servicoId
    ? planosValidos
        .flatMap(p => p.beneficios.filter(b => b.id_servico === servicoId).map(b => ({ plano: p.plano, quantidade: b.quantidade, usados: Number(b.usados) })))
        .sort((a, b) => (b.quantidade - b.usados) - (a.quantidade - a.usados))[0] ?? null
    : null
  const beneficioDisponivel = !!beneficioServico && beneficioServico.quantidade > beneficioServico.usados
  const vaiUsarBeneficio = beneficioDisponivel && usarBeneficio
  // O plano cobre o agendamento inteiro (só o serviço dele, sem TaxiDog):
  // não há o que pagar, então a forma de pagamento nem aparece. É a mesma
  // conta que o servidor refaz (formaSemCobrancaPeloPlano); se ele
  // discordar — o saldo acabou nesse meio-tempo —, `planoNaoCobriu` traz o
  // pagamento de volta.
  const [planoNaoCobriu, setPlanoNaoCobriu] = useState(false)
  const comTaxiDog = taxidogAtivo && transporte.opcao === 'taxidog'
  const nadaAPagar = vaiUsarBeneficio && !comTaxiDog && !planoNaoCobriu
  const precoDoServico = (s: { id_servico: string; preco: number | string }) =>
    precosDoPet?.petId === petId && precosDoPet.precos[s.id_servico] != null ? precosDoPet.precos[s.id_servico] : Number(s.preco)
  useEffect(() => {
    if (!petId || servicos.length === 0) return
    let cancelado = false
    Promise.all(servicos.map(s =>
      supabase.rpc('fn_calcular_preco_servico', { p_id_servico: s.id_servico, p_id_pet: petId })
        .then(({ data: preco, error }) => [s.id_servico, error || preco == null ? Number(s.preco) : Number(preco)] as const)
    )).then(pares => {
      if (!cancelado) setPrecosDoPet({ petId, precos: Object.fromEntries(pares) })
    })
    return () => { cancelado = true }
  }, [petId, servicos, supabase])
  const petSel = petsDoCliente.find(p => p.id_pet === petId)

  function handleCriarPet() {
    if (!clienteId) return
    if (!petNome.trim() || !petRaca.trim()) {
      setPetErro('Informe o nome e a raça do pet.')
      return
    }
    if (!petDtNasc) {
      setPetErro('A data de nascimento do pet é obrigatória.')
      return
    }
    setPetErro(null)
    const formData = new FormData()
    formData.set('id_cliente', clienteId)
    formData.set('nome', petNome.trim())
    formData.set('raca', petRaca.trim())
    formData.set('sexo', petSexo)
    formData.set('dt_nasc', petDtNasc)

    startPetTransition(async () => {
      const result = await criarPetLojistaAction(formData)
      if (result?.error) {
        setPetErro(result.error)
        return
      }
      const novoPet = { id_pet: result!.id_pet!, nome: petNome.trim(), raca: petRaca.trim() }
      setPetsExtras(prev => ({ ...prev, [clienteId]: [...(prev[clienteId] ?? []), novoPet] }))
      setPetId(novoPet.id_pet)
      setEtapa('servico')
      setShowNovoPet(false)
      setPetNome('')
      setPetRaca('')
      setPetSexo('Macho')
      setPetDtNasc('')
    })
  }

  const termo = buscaCliente.trim().toLowerCase()
  const digitosDoTermo = termo.replace(/\D/g, '')
  const clientesFiltrados = termo
    ? clientes.filter(c =>
        c.nome.toLowerCase().includes(termo) ||
        (digitosDoTermo.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(digitosDoTermo)))
    : clientes

  // Trocar de cliente limpa o que era do anterior: o pet e o endereço/taxa
  // do TaxiDog.
  function escolherCliente(id: string) {
    if (id === clienteId) return setEtapa('pet')
    const pets = [...(clientes.find(c => c.id_cliente === id)?.pets ?? []), ...(petsExtras[id] ?? [])]
    setClienteId(id)
    setPetId(pets.length === 1 ? pets[0].id_pet : '')
    setTransporte(TRANSPORTE_INICIAL)
    setShowNovoPet(false)
    setPetErro(null)
    setEtapa(pets.length === 1 ? 'servico' : 'pet')
  }

  // horário escolhido é limpo sempre que a data ou o serviço mudam
  // (ajuste de estado durante a renderização)
  const [slotsKeyAnterior, setSlotsKeyAnterior] = useState(`${data}|${servicoId}`)
  const slotsKeyAtual = `${data}|${servicoId}`
  if (slotsKeyAtual !== slotsKeyAnterior) {
    setSlotsKeyAnterior(slotsKeyAtual)
    setHora('')
  }

  const loadingSlots = !!(data && servicoSel) && slotsLoadedKey !== slotsKeyAtual

  // Loja fechada no dia (feriado, folga — migration 066): explica por
  // que não há horário ou por que parte dos horários está bloqueada.
  const bloqueiosDia = useBloqueiosDoDia(lojistaId, data) ?? []
  const diaFechado = fechadoODiaTodo(bloqueiosDia, data)

  // Carregar horários disponíveis quando data + serviço estão definidos
  useEffect(() => {
    if (!data || !servicoSel) return
    let cancelado = false
    const key = `${data}|${servicoId}`

    supabase
      .rpc('fn_horarios_disponiveis', {
        p_id_lojista: lojistaId,
        p_data: data,
        p_duracao: servicoSel.duracao,
      })
      .then(({ data: rows, error }) => {
        if (cancelado) return
        const lista = removerHorariosPassados((rows as Slot[]) ?? [], data)
        setSlotsErro(!!error)
        setSlots(lista)
        setSlotsLoadedKey(key)
        // O horário escolhido deixou de estar livre: desmarca.
        setHora(h => lista.some(s => s.disponivel && s.hr_slot.slice(0, 5) === h) ? h : '')
      })

    return () => { cancelado = true }
  }, [data, servicoId, recargaSlots]) // eslint-disable-line react-hooks/exhaustive-deps

  // Loja com uma forma de pagamento só: ela já vai escolhida.
  const formas = formasAtivas(formasLoja)
  const forma: FormaPagamento | '' = formaPagamento || (formas.length === 1 ? formas[0] : '')

  function handleSubmit() {
    if (!clienteId || !petId || !servicoId || !data || !hora) return
    setError(null)
    const formData = new FormData()
    formData.set('id_cliente', clienteId)
    formData.set('id_pet', petId)
    formData.set('id_servico', servicoId)
    formData.set('dt_agendamento', data)
    formData.set('hr_agendamento', hora)
    formData.set('obs', obs)
    if (taxidogAtivo && escolhaTaxiDog) formData.set('taxidog', taxiDogParaFormulario(escolhaTaxiDog))
    if (!nadaAPagar) {
      if (!forma) {
        setError('Escolha a forma de pagamento.')
        return
      }
      formData.set('forma_pagamento', forma)
      formData.set('status_pagamento', statusPagamento)
    }
    if (vaiUsarBeneficio) formData.set('usar_beneficio', '1')

    startTransition(async () => {
      const result = await criarAgendamentoLojistaAction(formData)
      if (result?.error) {
        setError(result.error)
        // O servidor não confirmou a cobertura do plano: pede o pagamento.
        if (nadaAPagar && result.error === 'Escolha a forma de pagamento.') setPlanoNaoCobriu(true)
        setRecargaSlots(n => n + 1)
        return
      }
      // Profissional é opcional e não faz parte da criação em si — se foi
      // escolhido, atribui logo em seguida. Best-effort: mesmo se essa
      // atribuição falhar, o agendamento já foi criado com sucesso (dá
      // pra atribuir depois pela Agenda/Kanban), então não trava a tela
      // de sucesso por causa disso.
      if (funcionarioId && result?.id_agendamento) {
        const resultAtribuicao = await atribuirFuncionarioAction(result.id_agendamento, funcionarioId)
        if (resultAtribuicao?.error) {
          console.error('[NovoAgendamentoModal] falha ao atribuir profissional:', resultAtribuicao.error)
        }
      }
      setSuccess(true)
      if (result?.aviso) setAvisoPlano(result.aviso)
      onCreated(
        {
          id_agendamento: result?.id_agendamento ?? crypto.randomUUID(),
          hr_agendamento: hora,
          nome_cliente: clienteSel!.nome,
          nome_pet: petSel!.nome,
          nome_servico: servicoSel!.nome,
          duracao: servicoSel!.duracao,
          status: 'Confirmado',
          valor: (vaiUsarBeneficio && !result?.aviso ? 0 : precoDoServico(servicoSel!)) + (taxidogAtivo && escolhaTaxiDog ? Number(escolhaTaxiDog.cotacao.valor ?? 0) : 0),
        },
        data
      )
      // Com aviso do plano, a tela fica aberta pra pessoa ler.
      if (!result?.aviso) setTimeout(onClose, 1200)
    })
  }

  const podeSubmeter = !!(clienteId && petId && servicoId && data && hora && (forma || nadaAPagar)) && (!taxidogAtivo || transportePronto(transporte)) && !isPending && !success

  // ---------- Etapas ----------
  const etapas: Etapa[] = [
    ...(clienteIdFixo ? [] : ['cliente' as const]),
    'pet', 'servico', 'horario',
    ...(taxidogAtivo ? ['transporte' as const] : []),
    // Na tela grande o resumo com o pagamento fica sempre à direita.
    ...(celular ? ['pagamento' as const] : []),
  ]
  const etapa = etapas.includes(etapaEscolhida) ? etapaEscolhida : etapas[etapas.length - 1]
  const indice = etapas.indexOf(etapa)
  const feita: Record<Etapa, boolean> = {
    cliente: !!clienteSel,
    pet: !!petSel,
    servico: !!servicoSel,
    horario: !!hora,
    transporte: transportePronto(transporte),
    pagamento: !!forma || nadaAPagar,
  }
  // Uma etapa abre quando as de antes já foram feitas.
  const liberada = (e: Etapa) => etapas.slice(0, etapas.indexOf(e)).every(a => feita[a])
  const depoisDe = (e: Etapa): Etapa | undefined => etapas[etapas.indexOf(e) + 1]
  const irPara = (e: Etapa) => { if (!isPending && liberada(e)) setEtapa(e) }

  function escolherPet(id: string) {
    setPetId(id)
    setEtapa('servico')
  }
  function escolherServico(id: string) {
    setServicoId(id)
    setEtapa('horario')
  }
  function escolherHora(h: string) {
    setHora(h)
    const proxima = depoisDe('horario')
    if (proxima) setEtapa(proxima)
  }

  // ---------- Textos do resumo ----------
  const dia = new Date(`${data}T12:00:00`)
  const quandoCurto = hora ? `${format(dia, "EEE, d 'de' MMM", { locale: ptBR }).replace(/^./, l => l.toUpperCase())} · ${hora}` : null
  const valorServico = servicoSel ? (vaiUsarBeneficio ? 0 : precoDoServico(servicoSel)) : 0
  const valorTaxiDog = taxidogAtivo && escolhaTaxiDog ? Number(escolhaTaxiDog.cotacao.valor ?? 0) : 0
  const total = valorServico + valorTaxiDog
  const faltas = [
    !clienteSel && 'cliente',
    !petSel && 'pet',
    !servicoSel && 'serviço',
    !hora && 'horário',
    taxidogAtivo && !transportePronto(transporte) && 'endereço do TaxiDog',
    !nadaAPagar && !forma && 'forma de pagamento',
  ].filter((f): f is string => !!f)
  // No celular, o que já foi escolhido nas etapas de antes.
  const escolhido: Partial<Record<Etapa, string | null | undefined>> = {
    cliente: clienteSel?.nome,
    pet: petSel?.nome,
    servico: servicoSel?.nome,
    horario: quandoCurto,
  }
  const trilha = etapa === 'pagamento' ? '' : [
    clienteIdFixo ? clienteSel?.nome : null,
    ...etapas.slice(0, indice).map(e => escolhido[e]),
  ].filter(Boolean).join(' · ')

  if (success) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal na is-feito" onClick={e => e.stopPropagation()} role="dialog" aria-label="Agendamento criado">
          <div className="na-sucesso">
            <span className="na-sucesso-icone"><IconCheck /></span>
            <h3>Agendamento confirmado</h3>
            <p>
              <strong>{petSel?.nome}</strong> · {servicoSel?.nome}
              <br />
              {format(dia, "EEEE, d 'de' MMMM", { locale: ptBR })} às {hora}
            </p>
            {vaiUsarBeneficio && !avisoPlano && <p>O benefício do plano foi usado.</p>}
            {avisoPlano && (
              <>
                <div className="na-erro">
                  <IconAlert />
                  <span>{avisoPlano}</span>
                </div>
                <button type="button" className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={onClose}>Fechar</button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Total, erro e o botão de confirmar — embaixo do resumo na tela grande,
  // fixo no pé da janela no celular.
  const rodape = (
    <div className="na-rodape">
      {error && (
        <div className="na-erro" role="alert">
          <IconAlert />
          <span>{error}</span>
        </div>
      )}
      <div className="na-total">
        <span>Total</span>
        <strong>{formatarReais(total)}</strong>
      </div>
      <button
        type="button"
        className={`btn btn-primary na-confirmar ${isPending ? 'btn-loading' : ''}`}
        onClick={handleSubmit}
        disabled={!podeSubmeter}
      >
        {isPending ? 'Agendando...' : 'Confirmar agendamento'}
      </button>
      {faltas.length > 0 && <p className="na-falta">Falta: {faltas.join(', ')}.</p>}
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal na" onClick={e => e.stopPropagation()} role="dialog" aria-label="Novo agendamento">
        <div className="na-topo">
          {/* Só no celular: volta uma etapa (na primeira, fecha). */}
          <button
            type="button"
            className="na-voltar"
            onClick={() => (indice === 0 ? onClose() : setEtapa(etapas[indice - 1]))}
            disabled={isPending}
            aria-label={indice === 0 ? 'Fechar' : 'Voltar para a etapa anterior'}
          >
            <IconChevronLeft />
          </button>
          <h3 className="modal-title">Novo agendamento</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar" disabled={isPending}>
            <IconClose style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Só no celular: em que etapa está e o que já foi escolhido. */}
        <div className="na-progresso" aria-hidden="true">
          {etapas.map((e, i) => <span key={e} className={i <= indice ? 'is-feito' : ''} />)}
        </div>
        <div className="na-etapa">
          <div className="na-etapa-linha">
            <h4>{ETAPAS[etapa].pergunta}</h4>
            <span>{indice + 1} de {etapas.length}</span>
          </div>
          {trilha && <p>{trilha}</p>}
        </div>

        <div className="na-corpo">
          {etapa !== 'pagamento' && (
            <div className="na-principal">
              <div className="na-passos">
                {etapas.map((e, i) => (
                  <button
                    key={e}
                    type="button"
                    className={`na-passo ${e === etapa ? 'is-ativo' : ''}`}
                    onClick={() => irPara(e)}
                    disabled={!liberada(e) || isPending}
                    aria-current={e === etapa ? 'step' : undefined}
                  >
                    <span>{feita[e] && liberada(e) && e !== etapa ? <IconCheck /> : i + 1}</span>
                    {ETAPAS[e].nome}
                  </button>
                ))}
              </div>

              <div className="na-conteudo">
                {/* Cliente */}
                {etapa === 'cliente' && (clientes.length === 0 ? (
                  <div className="alert alert-warning">
                    <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                    <span>
                      Você ainda não tem nenhum cliente cadastrado. Cadastre um em{' '}
                      <strong>Clientes → Novo Cliente</strong> antes de criar o agendamento.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="na-busca">
                      <IconSearch />
                      <input
                        type="text"
                        placeholder="Buscar por nome ou telefone"
                        value={buscaCliente}
                        onChange={e => setBuscaCliente(e.target.value)}
                        onKeyDown={e => {
                          // Enter fica com o primeiro da lista.
                          if (e.key === 'Enter' && clientesFiltrados.length > 0) escolherCliente(clientesFiltrados[0].id_cliente)
                        }}
                        autoFocus={!celular}
                        disabled={isPending}
                        aria-label="Buscar cliente por nome ou telefone"
                      />
                    </div>
                    <div className="na-lista">
                      {clientesFiltrados.map(c => (
                        <button
                          type="button"
                          key={c.id_cliente}
                          className={`na-opcao ${clienteId === c.id_cliente ? 'is-selecionado' : ''}`}
                          onClick={() => escolherCliente(c.id_cliente)}
                          disabled={isPending}
                        >
                          <span className="na-avatar">{iniciais(c.nome)}</span>
                          <span className="na-opcao-texto">
                            <strong>{c.nome}</strong>
                            <small>
                              {formatarTelefone(c.telefone)}
                              {c.pets.length > 0 && ` · ${c.pets.length} pet${c.pets.length > 1 ? 's' : ''}`}
                            </small>
                          </span>
                          {clienteId === c.id_cliente && <IconCheck className="na-certo" />}
                        </button>
                      ))}
                    </div>
                    {clientesFiltrados.length === 0 && (
                      <p className="na-msg">Nenhum cliente encontrado para &quot;{buscaCliente}&quot;.</p>
                    )}
                  </>
                ))}

                {/* Pet — sem nenhum pet, já abre o cadastro rápido */}
                {etapa === 'pet' && (showNovoPet || petsDoCliente.length === 0 ? (
                  <div className="na-novo-pet">
                    <h4>
                      <IconDog />
                      Novo pet de {clienteSel?.nome.split(' ')[0]}
                    </h4>
                    {petsDoCliente.length === 0 && <p className="tdc-nota">Este cliente ainda não tem pet cadastrado.</p>}
                    {petErro && (
                      <div className="na-erro" role="alert">
                        <IconAlert />
                        <span>{petErro}</span>
                      </div>
                    )}
                    <div className="na-dois">
                      <div className="form-group">
                        <label className="form-label form-label-required" htmlFor="na-pet-nome">Nome do pet</label>
                        <input id="na-pet-nome" type="text" className="form-input" value={petNome} onChange={e => setPetNome(e.target.value)} placeholder="Rex" disabled={isPendingPet} />
                      </div>
                      <div className="form-group">
                        <label className="form-label form-label-required" htmlFor="na-pet-raca">Raça</label>
                        <input id="na-pet-raca" type="text" className="form-input" value={petRaca} onChange={e => setPetRaca(e.target.value)} placeholder="SRD, Poodle..." disabled={isPendingPet} />
                      </div>
                    </div>
                    <div className="na-dois">
                      <div className="form-group">
                        <span className="form-label form-label-required">Sexo</span>
                        <div className="na-seg is-largo" role="group" aria-label="Sexo">
                          {(['Macho', 'Fêmea'] as const).map(sexo => (
                            <button key={sexo} type="button" className={petSexo === sexo ? 'is-ativo' : ''} onClick={() => setPetSexo(sexo)} disabled={isPendingPet} aria-pressed={petSexo === sexo}>
                              {sexo}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label form-label-required" htmlFor="na-pet-nasc">Nascimento</label>
                        <input id="na-pet-nasc" type="date" className="form-input" value={petDtNasc} max={format(new Date(), 'yyyy-MM-dd')} onChange={e => setPetDtNasc(e.target.value)} disabled={isPendingPet} />
                      </div>
                    </div>
                    <div className="na-acoes">
                      {petsDoCliente.length > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowNovoPet(false); setPetErro(null) }} disabled={isPendingPet}>
                          Cancelar
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn btn-primary btn-sm ${isPendingPet ? 'btn-loading' : ''}`}
                        onClick={handleCriarPet}
                        disabled={isPendingPet || !petNome.trim() || !petRaca.trim() || !petDtNasc}
                      >
                        {isPendingPet ? 'Cadastrando...' : 'Salvar pet'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="na-lista">
                    {petsDoCliente.map(p => (
                      <button
                        type="button"
                        key={p.id_pet}
                        className={`na-opcao ${petId === p.id_pet ? 'is-selecionado' : ''}`}
                        onClick={() => escolherPet(p.id_pet)}
                        disabled={isPending}
                      >
                        <span className="na-avatar is-grande">
                          {fotosDosPets[p.id_pet] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- URL pública dinâmica do Storage, fora dos domínios de imagem do Next
                            <img src={fotosDosPets[p.id_pet]!} alt="" loading="lazy" />
                          ) : <IconDog />}
                        </span>
                        <span className="na-opcao-texto">
                          <strong>{p.nome}</strong>
                          <small>{p.raca}</small>
                        </span>
                        {petId === p.id_pet && <IconCheck className="na-certo" />}
                      </button>
                    ))}
                    <button type="button" className="na-opcao is-novo" onClick={() => setShowNovoPet(true)} disabled={isPending}>
                      <span className="na-avatar is-grande"><IconPlus /></span>
                      <span className="na-opcao-texto"><strong>Cadastrar novo pet</strong></span>
                    </button>
                  </div>
                ))}

                {/* Serviço — com o preço para o pet escolhido */}
                {etapa === 'servico' && (servicos.length === 0 ? (
                  <p className="na-msg">Nenhum serviço ativo cadastrado. Cadastre um em Serviços antes de agendar.</p>
                ) : (
                  <div className="na-lista">
                    {servicos.map(s => (
                      <button
                        type="button"
                        key={s.id_servico}
                        className={`na-opcao ${servicoId === s.id_servico ? 'is-selecionado' : ''}`}
                        onClick={() => escolherServico(s.id_servico)}
                        disabled={isPending}
                      >
                        <span className="na-avatar"><IconScissors /></span>
                        <span className="na-opcao-texto">
                          <strong>{s.nome}</strong>
                          <small>
                            {s.duracao} min
                            {cobertoPeloPlano(s.id_servico) && <b> · no plano do cliente</b>}
                          </small>
                        </span>
                        <span className="na-opcao-valor">{formatarReais(precoDoServico(s))}</span>
                      </button>
                    ))}
                  </div>
                ))}

                {/* Data e horário */}
                {etapa === 'horario' && (
                  <SeletorDataHora
                    idLojista={lojistaId}
                    data={data}
                    onData={setData}
                    hora={hora}
                    onHora={escolherHora}
                    slots={loadingSlots ? null : slots}
                    aviso={
                      diaFechado ? `Loja fechada neste dia (${diaFechado.motivo}). Escolha outra data.`
                        : slotsErro ? 'Não foi possível carregar os horários. Escolha outro dia e volte, ou tente de novo em instantes.'
                        : slots.length === 0 ? 'Sem horário livre neste dia. Escolha outra data.'
                        : undefined
                    }
                    notas={bloqueiosDia.map(textoBloqueioNoDia)}
                    dataMin={format(new Date(), 'yyyy-MM-dd')}
                    disabled={isPending}
                  />
                )}

                {/* Transporte — só com o TaxiDog ativado na loja */}
                {etapa === 'transporte' && (
                  <TaxiDogCampos
                    key={clienteId}
                    valor={transporte}
                    onChange={setTransporte}
                    cotar={cotarTaxiDogLojaAction}
                    modoLoja
                    idCliente={clienteId}
                    compacto
                  />
                )}
              </div>
            </div>
          )}

          {(!celular || etapa === 'pagamento') && (
            <aside className="na-resumo" aria-label="Resumo do agendamento">
              <div className="na-resumo-corpo">
                <div className="na-itens">
                  <ItemDoResumo
                    icone={IconUser}
                    texto={clienteSel?.nome}
                    vazio="Escolher cliente"
                    onClick={clienteIdFixo ? undefined : () => irPara('cliente')}
                  />
                  <ItemDoResumo icone={IconDog} texto={petSel?.nome} detalhe={petSel?.raca} vazio="Escolher pet" onClick={() => irPara('pet')} desativado={!liberada('pet')} />
                  <ItemDoResumo
                    icone={IconScissors}
                    texto={servicoSel?.nome}
                    vazio="Escolher serviço"
                    valor={servicoSel ? (vaiUsarBeneficio ? 'Pelo plano' : formatarReais(precoDoServico(servicoSel))) : null}
                    onClick={() => irPara('servico')}
                    desativado={!liberada('servico')}
                  />
                  <ItemDoResumo icone={IconCalendar} texto={quandoCurto} vazio="Escolher data e horário" onClick={() => irPara('horario')} desativado={!liberada('horario')} />
                  {taxidogAtivo && (
                    <ItemDoResumo
                      icone={IconCar}
                      texto={transporte.opcao === 'taxidog' ? 'TaxiDog' : 'Cliente leva o pet'}
                      detalhe={transporte.opcao === 'taxidog' ? ROTULO_MODALIDADE[transporte.modalidade] : null}
                      vazio=""
                      valor={escolhaTaxiDog ? formatarReais(valorTaxiDog) : transporte.opcao === 'taxidog' ? 'Falta o endereço' : null}
                      onClick={() => irPara('transporte')}
                      desativado={!liberada('transporte')}
                    />
                  )}
                  {/* Profissional — opcional, dá pra deixar sem e atribuir depois.
                      Só aparece pra quem pode atribuir (responsável pela conta ou
                      administrador) — um funcionário comum não escolhe. */}
                  {funcionarios.length > 0 && podeAtribuirProfissional && (
                    <label className={`na-item ${funcionarioId ? '' : 'is-vazio'}`}>
                      <IconUserBadge />
                      <select value={funcionarioId} onChange={e => setFuncionarioId(e.target.value)} disabled={isPending} aria-label="Profissional (opcional)">
                        <option value="">Sem profissional definido</option>
                        {funcionarios.map(f => (
                          <option key={f.id_funcionario} value={f.id_funcionario}>{f.nome}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                {/* Plano do pet (migration 060) */}
                {servicoId && beneficioServico && (beneficioDisponivel ? (
                  <label className="na-plano">
                    <input type="checkbox" checked={usarBeneficio} onChange={e => setUsarBeneficio(e.target.checked)} disabled={isPending} />
                    <span>
                      <strong>Usar o benefício do plano</strong> — {beneficioServico.plano}: {beneficioServico.quantidade - beneficioServico.usados} de {beneficioServico.quantidade} restante{beneficioServico.quantidade - beneficioServico.usados !== 1 ? 's' : ''} no período. O serviço não é cobrado neste agendamento.
                    </span>
                  </label>
                ) : (
                  <div className="na-plano is-esgotado">
                    Os usos deste serviço no plano {beneficioServico.plano} acabaram neste período ({beneficioServico.usados} de {beneficioServico.quantidade}) — ele será cobrado como avulso.
                  </div>
                ))}

                {/* Pagamento — obrigatório (migration 057), menos quando o
                    plano cobre o agendamento inteiro: aí não há o que pagar. */}
                {nadaAPagar ? (
                  <div className="na-coberto">
                    <IconCheck />
                    O plano cobre este agendamento: não há o que pagar.
                  </div>
                ) : (
                  <div className="na-bloco">
                    <div className="na-bloco-topo">
                      <span className="na-rotulo">Pagamento</span>
                      <div className="na-seg" role="group" aria-label="Status do pagamento">
                        <button type="button" className={statusPagamento === 'pendente' ? 'is-ativo' : ''} onClick={() => setStatusPagamento('pendente')} disabled={isPending} aria-pressed={statusPagamento === 'pendente'}>Pendente</button>
                        <button type="button" className={statusPagamento === 'pago' ? 'is-ativo' : ''} onClick={() => setStatusPagamento('pago')} disabled={isPending} aria-pressed={statusPagamento === 'pago'}>Pago</button>
                      </div>
                    </div>
                    <div className="na-formas">
                      {formas.map(f => {
                        const IconeDaForma = ICONE_FORMA[f]
                        return (
                          <button key={f} type="button" className={`na-forma ${forma === f ? 'is-ativa' : ''}`} onClick={() => setFormaPagamento(f)} disabled={isPending} aria-pressed={forma === f}>
                            <IconeDaForma />
                            {ROTULO_FORMA_PAGAMENTO[f]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Observações */}
                {obsAberta || obs ? (
                  <textarea
                    className="form-textarea na-obs"
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                    placeholder="Observações. Ex: pet é nervoso com barulho"
                    rows={2}
                    maxLength={500}
                    disabled={isPending}
                    autoFocus={obsAberta && !obs}
                    aria-label="Observações (opcional)"
                  />
                ) : (
                  <button type="button" className="na-link" onClick={() => setObsAberta(true)} disabled={isPending}>
                    <IconPlus />
                    Adicionar observação
                  </button>
                )}
              </div>

              {!celular && rodape}
            </aside>
          )}
        </div>

        {/* Só no celular: o botão da etapa, fixo embaixo. */}
        {celular && (etapa === 'pagamento' ? (
          <div className="na-barra is-final">{rodape}</div>
        ) : (
          <div className="na-barra">
            {servicoSel && (
              <div className="na-barra-total">
                <small>Total</small>
                <strong>{formatarReais(total)}</strong>
              </div>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { const proxima = depoisDe(etapa); if (proxima) setEtapa(proxima) }}
              disabled={!feita[etapa] || isPending}
            >
              Continuar
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
