'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { criarAgendamentoOnlineAction, atualizarClassificacaoPetAction, completarCadastroClienteNoLinkAction, getGoogleOAuthUrlAction, trocarParaContaClienteAction } from '@/lib/actions'
import { cotarTaxiDogAction } from '@/lib/actions-taxidog'
import NovoPetNoAgendamento from './NovoPetNoAgendamento'
import PlanoNoPedido, { useMeusBeneficios } from './PlanoNoPedido'
import { coberturaDoPlano } from '@/lib/planos'
import { removerHorariosPassados } from '@/lib/agenda'
import { rotuloUnidade } from '@/lib/produto'
import { formatarCpf, formatarEnderecoLoja, formatarTelefone } from '@/lib/format'
import { addDays, format, getDay, isAfter, isBefore, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import SeletorDeData from './SeletorDeData'
import { fechadoODiaTodo, type BloqueioLoja } from '@/lib/bloqueios'
import ConfirmacaoAgendamento from './ConfirmacaoAgendamento'
import { PixDaLoja } from './PagamentoEtapa'
import { ROTULO_FORMA_PAGAMENTO, formasAtivas, type FormaPagamento, type FormasLoja } from '@/lib/pagamento'
import { Estrelas, formatarMedia } from './Estrelas'
import {
  ESTADO_TRANSPORTE_INICIAL,
  TaxiDogCampos,
  escolhaDoTransporte,
  taxiDogParaFormulario,
  transportePronto,
  type EstadoTransporte,
} from './TaxiDogEtapa'
import type { EnderecoTaxiDog } from '@/lib/taxidog'
import { ROTULO_MODALIDADE, formatarReais } from '@/lib/taxidog'
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconInfo,
  IconUser,
  IconUserPlus,
  IconMinus,
  IconPaw,
  IconPlus,
} from '@/components/icons'
import './agendamento-online.css'

interface Lojista {
  id: string
  nome: string
  logoUrl: string | null
  descricao: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  telefone: string
  statusHoje: string
}
interface Horario {
  dia_semana: string
  hr_inicio: string
  hr_fim: string
  ativo: boolean
}
interface Janela {
  minValor: number
  minUnidade: 'horas' | 'dias'
  maxValor: number
  maxUnidade: 'horas' | 'dias'
}
interface Servico {
  id_servico: string
  nome: string
  descricao?: string | null
  preco: number
  duracao: number
}
interface Pet {
  id_pet: string
  nome: string
  raca: string
  especie: 'Cão' | 'Gato' | null
  porte: 'Pequeno' | 'Médio' | 'Grande' | null
  sexo: string
}
// Produtos com disponivel_agendamento_online=true (migration 039) — o
// cliente pode adicionar junto do(s) serviço(s), na revisão.
interface Produto {
  id_produto: string
  nome: string
  preco_venda: number
  unidade_venda: string
  estoque_atual: number
}
interface Cliente {
  nome: string
  telefone: string
  cpf: string
}
// Recorte público das avaliações (fn_avaliacoes_resumo_publico +
// fn_avaliacoes_publicas, migration 034) — só primeiro nome de quem
// avaliou, nunca telefone/e-mail/CPF/id.
interface AvaliacoesPublicas {
  media: number | null
  total: number
  recentes: { nota: number; comentario: string; primeiro_nome: string; created_at: string }[]
}
interface Props {
  lojista: Lojista
  horarios: Horario[]
  // Dias que a loja fechou (feriado, folga — migration 066).
  bloqueios: BloqueioLoja[]
  janela: Janela
  servicos: Servico[]
  produtos: Produto[]
  avaliacoes: AvaliacoesPublicas
  pets: Pet[]
  cliente: Cliente
  autenticado: boolean
  contaInvalida: boolean
  // Entrou com o Google mas ainda não completou o cadastro de cliente.
  cadastroIncompleto?: boolean
  // Nome da conta conectada (do Google) — para a saudação do cadastro.
  nomeConta?: string
  carrinhoInicial: string[]
  // TaxiDog ligado e liberado pro agendamento online (fn_taxidog_publico,
  // migration 042) — decide se aparece a escolha de transporte.
  taxidogDisponivel: boolean
  // lojista.precos_estimados (migration 042) — mostra o aviso de que o
  // preço do serviço pode ser ajustado pela loja.
  precosEstimados: boolean
  // Formas de pagamento aceitas pela loja (migration 057).
  formasPagamento: FormasLoja
}

// Três telas, no lugar das sete de antes:
//   1. o que fazer (serviços — um toque marca/desmarca);
//   2. para quem e quando (pet, dia e horário — tocar no horário já avança);
//   3. revisar e confirmar (transporte, pagamento, produtos e observação
//      ficam ali mesmo, sem etapa própria; os dados do tutor vêm da conta).
// Sem conta de cliente, entre a 1 e a 2 aparece "conta": entrar com o
// Google (um toque), criar conta ou terminar o cadastro ali mesmo — sem
// janela de "você não é cliente" e sem perder o que foi escolhido.
type Step = 'servicos' | 'conta' | 'quando' | 'revisar' | 'feito'
type Slot = { hr_slot: string; disponivel: boolean }

const PASSOS: Exclude<Step, 'feito'>[] = ['servicos', 'quando', 'revisar']
const DIAS_ORDEM = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const NOMES_DIA_POR_INDICE = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
const DIAS_NA_FAIXA = 14

const duracaoTexto = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min} min`)

export default function AgendamentoOnlineWizard({
  lojista, horarios, bloqueios, janela, servicos, produtos, avaliacoes, pets: petsIniciais, cliente, autenticado, contaInvalida, cadastroIncompleto = false, nomeConta = '', carrinhoInicial,
  taxidogDisponivel, precosEstimados, formasPagamento,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  // Quem volta do Google (ou do login) já escolheu os serviços: cai direto
  // no passo seguinte em vez de ver a lista de novo.
  const [step, setStep] = useState<Step>(() =>
    carrinhoInicial.length === 0 ? 'servicos' : autenticado ? 'quando' : (cadastroIncompleto || contaInvalida) ? 'conta' : 'servicos')
  // Sem TaxiDog na loja (ou até a pessoa escolher), o tutor leva o pet.
  const [transporte, setTransporte] = useState<EstadoTransporte>({ ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar' })
  const escolhaTaxiDog = escolhaDoTransporte(transporte)
  const opcoesPagamento = formasAtivas(formasPagamento)
  // Forma de pagamento do pedido inteiro (migration 057). Com uma forma só,
  // já vem escolhida.
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(opcoesPagamento.length === 1 ? opcoesPagamento[0] : null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Tela "conta": Google abrindo / cadastro sendo gravado / erro.
  const [abrindoGoogle, setAbrindoGoogle] = useState(false)
  const [telefoneConta, setTelefoneConta] = useState('')
  const [cpfConta, setCpfConta] = useState('')
  const [aceitaTermos, setAceitaTermos] = useState(false)
  const [mostrarDetalheLoja, setMostrarDetalheLoja] = useState(false)
  const [servicoDetalhe, setServicoDetalhe] = useState<Servico | null>(null)
  const [calendarioAberto, setCalendarioAberto] = useState(false)
  const [transporteAberto, setTransporteAberto] = useState(false)
  const [produtosAbertos, setProdutosAbertos] = useState(false)
  const [obsAberta, setObsAberta] = useState(false)

  const [carrinho, setCarrinho] = useState<string[]>(carrinhoInicial)
  const [pets, setPets] = useState<Pet[]>(petsIniciais)
  // Um pet só: já vem escolhido.
  const [petId, setPetId] = useState(petsIniciais.length === 1 ? petsIniciais[0].id_pet : '')
  // Sem pet nenhum, o formulário de cadastro já vem aberto.
  const [novoPetAberto, setNovoPetAberto] = useState(false)
  const [data, setData] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [obs, setObs] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [precos, setPrecos] = useState<Record<string, number>>({})
  const [quantidadesProdutos, setQuantidadesProdutos] = useState<Record<string, number>>({})

  // Espécie/porte do pet escolhido, quando faltam (o preço depende disso).
  const [especieForm, setEspecieForm] = useState<'Cão' | 'Gato' | ''>(petsIniciais.length === 1 ? petsIniciais[0].especie ?? '' : '')
  const [porteForm, setPorteForm] = useState<'Pequeno' | 'Médio' | 'Grande' | ''>(petsIniciais.length === 1 ? petsIniciais[0].porte ?? '' : '')
  const [salvandoClassificacao, setSalvandoClassificacao] = useState(false)

  const [resultado, setResultado] = useState<{
    ids: string[]
    plano: { aplicados: number; valorAbatido: number } | null
    aviso: string | null
  } | null>(null)

  const petSel = pets.find(p => p.id_pet === petId) ?? null
  const servicosCarrinho = servicos.filter(s => carrinho.includes(s.id_servico))
  const duracaoTotal = servicosCarrinho.reduce((acc, s) => acc + s.duracao, 0)
  const valorTotal = servicosCarrinho.reduce((acc, s) => acc + Number(precos[s.id_servico] ?? s.preco), 0)
  const precisaClassificar = !!petSel && (!petSel.especie || !petSel.porte)
  const itensCarrinhoProdutos = useMemo(() =>
    produtos
      .map(produto => ({ produto, quantidade: quantidadesProdutos[produto.id_produto] ?? 0 }))
      .filter(item => item.quantidade > 0),
    [produtos, quantidadesProdutos]
  )
  const totalProdutos = itensCarrinhoProdutos.reduce((acc, i) => acc + i.produto.preco_venda * i.quantidade, 0)
  const valorTaxiDog = escolhaTaxiDog?.cotacao.valor ?? 0
  const totalSemPlano = valorTotal + totalProdutos + valorTaxiDog

  // Plano do cliente (migration 075): saldo do pet nesta loja no período
  // da data escolhida — cobre os serviços do carrinho que estão no plano.
  const planosDoPet = useMeusBeneficios(autenticado ? lojista.id : '', petId, data)
  const cobertura = coberturaDoPlano(planosDoPet, carrinho)
  const [usarPlano, setUsarPlano] = useState(true)
  const vaiUsarPlano = usarPlano && cobertura.cobertos.length > 0
  const descontoPlano = vaiUsarPlano
    ? servicosCarrinho
        .filter(s => cobertura.cobertos.some(c => c.id_servico === s.id_servico))
        .reduce((acc, s) => acc + Number(precos[s.id_servico] ?? s.preco), 0)
    : 0
  const totalGeral = totalSemPlano - descontoPlano
  // O plano cobre o pedido inteiro (só serviços do plano, sem produto nem
  // TaxiDog): não há o que pagar, e a forma de pagamento some. É a mesma
  // conta que o servidor refaz; se ele discordar (o saldo acabou nesse
  // meio-tempo), `planoNaoCobriu` traz o pagamento de volta.
  const [planoNaoCobriu, setPlanoNaoCobriu] = useState(false)
  const nadaAPagar = vaiUsarPlano && !planoNaoCobriu
    && carrinho.length > 0 && carrinho.every(id => cobertura.cobertos.some(c => c.id_servico === id))
    && itensCarrinhoProdutos.length === 0 && !escolhaTaxiDog

  // Preço real (considerando variação por porte/raça) assim que há pet + carrinho
  useEffect(() => {
    if (!petId || carrinho.length === 0) return
    let cancelado = false
    Promise.all(
      carrinho.map(async id_servico => {
        const { data } = await supabase.rpc('fn_calcular_preco_servico', { p_id_servico: id_servico, p_id_pet: petId })
        // NUMERIC do Postgres pode voltar como string via PostgREST — nunca usar direto num cálculo.
        return [id_servico, data == null ? null : Number(data)] as const
      })
    ).then(pares => {
      if (cancelado) return
      setPrecos(prev => ({ ...prev, ...Object.fromEntries(pares.filter((par): par is [string, number] => par[1] != null)) }))
    })
    return () => { cancelado = true }
  }, [petId, carrinho, supabase])

  // Horários disponíveis — o cliente não escolhe o profissional (a loja
  // atribui depois), então a RPC vai sem esse filtro.
  useEffect(() => {
    if (!data || duracaoTotal === 0) return
    let cancelado = false
    const dataSelecionada = data
    supabase
      .rpc('fn_horarios_disponiveis_funcionario', {
        p_id_lojista: lojista.id,
        p_data: data,
        p_duracao: duracaoTotal,
      })
      .then(({ data: rows }) => {
        if (cancelado) return
        setSlots(removerHorariosPassados((rows ?? []) as Slot[], dataSelecionada))
      })
    return () => { cancelado = true }
  }, [data, duracaoTotal, lojista.id, supabase])

  // Pets que chegam depois (o cadastro terminou aqui e a página recarregou os
  // dados): entram na lista sem perder o que já foi escolhido.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com os dados novos vindos do servidor (router.refresh)
    setPets(prev => [...prev, ...petsIniciais.filter(p => !prev.some(x => x.id_pet === p.id_pet))])
  }, [petsIniciais])

  // Virou cliente nesta tela (cadastro terminado aqui): segue sozinho.
  useEffect(() => {
    if (autenticado && step === 'conta') {
      irParaQuando()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à mudança de autenticado
  }, [autenticado])

  // Volta ao topo a cada tela (no celular a anterior podia estar rolada).
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [step])

  // Só pra desenhar os dias (a checagem que vale é a do servidor, que usa o
  // horário de Brasília certo). "agora" via lazy initializer (regra de pureza).
  const [agora] = useState(() => Date.now())
  const diasAbertos = useMemo(() => new Set(horarios.filter(h => h.ativo).map(h => h.dia_semana)), [horarios])
  const minInstante = useMemo(() => new Date(agora + (janela.minUnidade === 'dias' ? janela.minValor * 24 : janela.minValor) * 3600_000), [agora, janela])
  const maxInstante = useMemo(() => new Date(agora + (janela.maxUnidade === 'dias' ? janela.maxValor * 24 : janela.maxValor) * 3600_000), [agora, janela])

  // Os próximos dias em que dá pra agendar (abertos, sem fechamento, dentro
  // da antecedência da loja) — a faixa de dias da tela 2.
  const proximosDias = useMemo(() => {
    const lista: string[] = []
    const minDia = startOfDay(minInstante)
    const maxDia = startOfDay(maxInstante)
    for (let i = 0; i < 120 && lista.length < DIAS_NA_FAIXA; i++) {
      const d = startOfDay(addDays(new Date(agora), i))
      if (isBefore(d, minDia)) continue
      if (isAfter(d, maxDia)) break
      const iso = format(d, 'yyyy-MM-dd')
      if (!diasAbertos.has(NOMES_DIA_POR_INDICE[getDay(d)]) || fechadoODiaTodo(bloqueios, iso)) continue
      lista.push(iso)
    }
    return lista
  }, [agora, minInstante, maxInstante, diasAbertos, bloqueios])

  function alternarServico(id: string) {
    setCarrinho(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function escolherDia(iso: string) {
    if (iso === data) return
    setData(iso)
    setSlots(null)
    setHoraInicio('')
  }

  function irParaQuando() {
    setErro(null)
    if (!autenticado) {
      setStep('conta')
      return
    }
    // Já abre no primeiro dia livre: os horários aparecem sem precisar tocar em nada.
    if (!data && proximosDias[0]) escolherDia(proximosDias[0])
    if (pets.length === 0) setNovoPetAberto(true)
    setStep('quando')
  }

  const podeRevisar = !!petId && !precisaClassificar && !!data && !!horaInicio

  function escolherHorario(hora: string) {
    setHoraInicio(hora)
    // Tudo pronto: tocar no horário já leva à revisão (um toque a menos).
    if (petId && !precisaClassificar && data) {
      setErro(null)
      setStep('revisar')
    }
  }

  function voltar() {
    setErro(null)
    setStep(atual => (atual === 'revisar' ? 'quando' : 'servicos'))
  }

  const voltarParaCa = `/agendamento/${lojista.id}${carrinho.length ? `?servicos=${carrinho.join(',')}` : ''}`

  async function entrarComGoogle() {
    setErro(null)
    setAbrindoGoogle(true)
    const r = contaInvalida ? await trocarParaContaClienteAction(voltarParaCa) : await getGoogleOAuthUrlAction('cliente', voltarParaCa)
    if (r.error || !r.url) {
      setAbrindoGoogle(false)
      setErro(r.error ?? 'Não foi possível abrir o Google. Tente de novo.')
      return
    }
    window.location.href = r.url
  }

  function terminarCadastro(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const fd = new FormData()
    fd.set('telefone', telefoneConta)
    fd.set('cpf', cpfConta)
    if (aceitaTermos) fd.set('aceita_termos', 'on')
    startTransition(async () => {
      const r = await completarCadastroClienteNoLinkAction(fd)
      if (r.error) { setErro(r.error); return }
      // Recarrega os dados da página (agora como cliente); o efeito acima segue.
      router.refresh()
    })
  }

  function selecionarPet(p: Pet) {
    setPetId(p.id_pet)
    setEspecieForm(p.especie ?? '')
    setPorteForm(p.porte ?? '')
    setNovoPetAberto(false)
  }

  // Pet cadastrado aqui mesmo: entra na lista já escolhido.
  function aoCriarPet(p: Pet) {
    setPets(prev => [...prev, p])
    selecionarPet(p)
  }

  // Espécie e porte se salvam sozinhos assim que os dois estão marcados.
  function classificar(especie: 'Cão' | 'Gato' | '', porte: 'Pequeno' | 'Médio' | 'Grande' | '') {
    setEspecieForm(especie)
    setPorteForm(porte)
    if (!petSel || !especie || !porte) return
    setErro(null)
    setSalvandoClassificacao(true)
    const fd = new FormData()
    fd.set('especie', especie)
    fd.set('porte', porte)
    const id = petSel.id_pet
    startTransition(async () => {
      const result = await atualizarClassificacaoPetAction(id, fd)
      setSalvandoClassificacao(false)
      if (result?.error) { setErro(result.error); return }
      setPets(prev => prev.map(p => p.id_pet === id ? { ...p, especie, porte } : p))
    })
  }

  const cotar = useCallback((endereco: EnderecoTaxiDog) => cotarTaxiDogAction(lojista.id, endereco), [lojista.id])

  function mudarQuantidade(p: Produto, delta: number) {
    const passo = p.unidade_venda === 'kg' || p.unidade_venda === 'litro' ? 0.5 : 1
    setQuantidadesProdutos(prev => {
      const atual = prev[p.id_produto] ?? 0
      const nova = Math.max(0, Math.min(p.estoque_atual, Math.round((atual + delta * passo) * 100) / 100))
      return { ...prev, [p.id_produto]: nova }
    })
  }

  function handleAgendar() {
    setErro(null)
    if (!transportePronto(transporte)) {
      setErro('Complete o endereço do TaxiDog ou escolha levar o pet.')
      setTransporteAberto(true)
      return
    }
    if (!nadaAPagar && !formaPagamento) {
      setErro('Escolha como vai pagar.')
      return
    }
    const fd = new FormData()
    fd.set('id_lojista', lojista.id)
    fd.set('id_pet', petId)
    fd.set('servicos', JSON.stringify(carrinho))
    fd.set('dt_agendamento', data)
    fd.set('hr_agendamento', horaInicio)
    fd.set('obs', obs)
    if (itensCarrinhoProdutos.length > 0) {
      fd.set('produtos', JSON.stringify(itensCarrinhoProdutos.map(i => ({ id_produto: i.produto.id_produto, quantidade: i.quantidade }))))
    }
    if (escolhaTaxiDog) fd.set('taxidog', taxiDogParaFormulario(escolhaTaxiDog))
    if (!nadaAPagar && formaPagamento) fd.set('forma_pagamento', formaPagamento)
    if (vaiUsarPlano) fd.set('usar_plano', '1')

    startTransition(async () => {
      const result = await criarAgendamentoOnlineAction(fd)
      if (result?.error) {
        setErro(result.error)
        // O servidor não confirmou a cobertura do plano: pede o pagamento.
        if (nadaAPagar && result.error === 'Escolha a forma de pagamento.') setPlanoNaoCobriu(true)
        return
      }
      setResultado({
        ids: result?.ids_agendamento ?? [],
        plano: result?.plano ? { aplicados: result.plano.aplicados, valorAbatido: result.plano.valorAbatido } : null,
        aviso: result?.plano?.aviso ?? null,
      })
      setStep('feito')
    })
  }

  // Linhas do resumo da confirmação / mensagem do WhatsApp.
  const itensResumo = [
    ...servicosCarrinho.map(s => s.nome),
    ...itensCarrinhoProdutos.map(i => `${i.produto.nome} (${i.quantidade} ${rotuloUnidade(i.produto.unidade_venda)})`),
    ...(escolhaTaxiDog ? [`TaxiDog: ${ROTULO_MODALIDADE[escolhaTaxiDog.modalidade]} (${formatarReais(escolhaTaxiDog.cotacao.valor)})`] : []),
  ]

  const enderecoCompleto = formatarEnderecoLoja(lojista)
  const dataLonga = data ? format(new Date(`${data}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR }) : ''
  const dataLongaMaiuscula = dataLonga ? dataLonga[0].toUpperCase() + dataLonga.slice(1) : ''
  const indicePasso = step === 'feito' ? -1 : step === 'conta' ? 1 : PASSOS.indexOf(step)
  const primeiroNome = (nomeConta || cliente.nome || '').split(' ')[0]

  return (
    <div className={`ag2 ${step === 'servicos' ? 'is-largo' : ''}`}>
      {/* Topo: voltar, os três pontinhos do progresso e a loja */}
      {step !== 'feito' && (
        <div className="ag2-topo">
          {step !== 'servicos' ? (
            <button type="button" className="ag2-icone-btn" onClick={voltar} aria-label="Voltar">
              <IconChevronLeft style={{ width: 18, height: 18 }} />
            </button>
          ) : <span className="ag2-icone-btn is-vazio" />}
          <div className="ag2-pontos" aria-label={`Passo ${indicePasso + 1} de ${PASSOS.length}`}>
            {PASSOS.map((p, i) => <span key={p} className={i <= indicePasso ? 'is-ativo' : ''} />)}
          </div>
          <span className="ag2-icone-btn is-vazio" />
        </div>
      )}

      {step === 'servicos' && (
        // A loja é a identidade da página (não um seletor): logo, nome e o
        // "Sobre a loja" discreto que abre os detalhes.
        <header className="ag2-loja">
          {lojista.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL pública do Storage
            <img src={lojista.logoUrl} alt="" className="ag2-loja-logo" />
          ) : (
            <span className="ag2-loja-logo is-vazio"><IconPaw style={{ width: 22, height: 22 }} /></span>
          )}
          <span className="ag2-loja-nome">{lojista.nome}</span>
          <span className="ag2-loja-info">
            {lojista.statusHoje}
            {avaliacoes.total > 0 && avaliacoes.media != null && <> · ★ {formatarMedia(avaliacoes.media)}</>}
            {' · '}
            <button type="button" className="ag2-loja-sobre" onClick={() => setMostrarDetalheLoja(true)}>
              <IconInfo style={{ width: 13, height: 13 }} /> Sobre a loja
            </button>
          </span>
        </header>
      )}

      {erro && (
        <div className="alert alert-error" style={{ marginBottom: 'var(--space-4)' }}>
          <IconAlert style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
          <span>{erro}</span>
        </div>
      )}

      {/* ============ 1. O que fazer ============ */}
      {step === 'servicos' && (
        <div className="ag2-servicos-layout">
          <div className="ag2-servicos-principal">
            <h1 className="ag2-titulo">O que seu pet precisa hoje?</h1>
            <p className="ag2-sub">Toque para escolher — dá para marcar mais de um. Os preços são “a partir de”: o valor final depende do porte do pet.</p>

            {servicos.length === 0 ? (
              <p className="ag2-vazio">Esta loja ainda não cadastrou serviços.</p>
            ) : (
              <ul className="ag2-lista">
                {servicos.map(s => {
                  const marcado = carrinho.includes(s.id_servico)
                  return (
                    <li key={s.id_servico} className={`ag2-servico-item ${marcado ? 'is-marcado' : ''} ${s.descricao ? 'tem-detalhe' : ''}`}>
                      <button
                        type="button"
                        className={`ag2-servico ${marcado ? 'is-marcado' : ''}`}
                        onClick={() => alternarServico(s.id_servico)}
                        aria-pressed={marcado}
                      >
                        <span className="ag2-servico-texto">
                          <span className="ag2-servico-nome">{s.nome}</span>
                          <span className="ag2-servico-info">{duracaoTexto(s.duracao)}</span>
                          <span className="ag2-servico-preco">{formatarReais(s.preco)}</span>
                        </span>
                        <span className="ag2-check" aria-hidden="true">{marcado && <IconCheck style={{ width: 14, height: 14 }} />}</span>
                      </button>
                      {s.descricao && (
                        <button type="button" className="ag2-link ag2-servico-detalhe" onClick={() => setServicoDetalhe(s)}>
                          O que inclui
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Computador: o pedido fica fixo ao lado, sem precisar rolar. */}
          <aside className="ag2-pedido" aria-label="Seu pedido">
            <div className="ag2-pedido-topo">
              <span className="ag2-pedido-titulo">Seu pedido</span>
              {servicosCarrinho.length > 0 && (
                <span className="ag2-pedido-contagem">{servicosCarrinho.length} {servicosCarrinho.length === 1 ? 'serviço' : 'serviços'}</span>
              )}
            </div>

            {servicosCarrinho.length === 0 ? (
              <div className="ag2-pedido-vazio">
                <span className="ag2-pedido-vazio-icone" aria-hidden="true"><IconPaw style={{ width: 22, height: 22 }} /></span>
                <strong>Nada escolhido ainda</strong>
                <span>Toque nos serviços ao lado para montar o pedido. Dá para escolher mais de um.</span>
              </div>
            ) : (
              <ul className="ag2-pedido-itens">
                {servicosCarrinho.map(s => (
                  <li key={s.id_servico}>
                    <div className="ag2-pedido-item-topo">
                      <span className="ag2-pedido-item-nome">{s.nome}</span>
                      <button type="button" className="ag2-pedido-tirar" onClick={() => alternarServico(s.id_servico)} aria-label={`Tirar ${s.nome}`}>
                        <IconClose style={{ width: 12, height: 12 }} />
                      </button>
                    </div>
                    {s.descricao && <p className="ag2-pedido-item-desc">{s.descricao}</p>}
                    <div className="ag2-pedido-item-rodape">
                      <span><IconClock style={{ width: 13, height: 13 }} /> {duracaoTexto(s.duracao)}</span>
                      <span className="ag2-pedido-item-preco">a partir de <strong>{formatarReais(s.preco)}</strong></span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="ag2-pedido-fim">
              {servicosCarrinho.length > 0 && (
                <>
                  <div className="ag2-pedido-linha"><span>Tempo total</span><span>{duracaoTexto(duracaoTotal)}</span></div>
                  <div className="ag2-pedido-linha is-total"><span>Total</span><strong>{formatarReais(valorTotal)}</strong></div>
                  <p className="ag2-pedido-nota">Valor a partir de: o final depende do porte do pet. A seguir você escolhe o pet, o dia e o horário.</p>
                </>
              )}
              <button type="button" className="ag2-cta" disabled={carrinho.length === 0} onClick={irParaQuando}>
                {carrinho.length === 0 ? 'Escolha um serviço' : 'Continuar'}
              </button>
            </div>
          </aside>

          <div className="ag2-rodape is-so-celular">
            <button type="button" className="ag2-cta" disabled={carrinho.length === 0} onClick={irParaQuando}>
              {carrinho.length === 0
                ? 'Escolha um serviço'
                : <>Continuar <span className="ag2-cta-extra">{carrinho.length} · {duracaoTexto(duracaoTotal)} · {formatarReais(valorTotal)}</span></>}
            </button>
          </div>
        </div>
      )}

      {/* ============ Conta (só para quem ainda não é cliente) ============ */}
      {step === 'conta' && (
        <div className="ag2-conta">
          <div className="ag2-resumo-mini">
            <span>{servicosCarrinho.map(s => s.nome).join(' + ')}</span>
            <strong>{formatarReais(valorTotal)}</strong>
          </div>

          {cadastroIncompleto ? (
            <>
              <h1 className="ag2-titulo">Prazer{primeiroNome ? `, ${primeiroNome}` : ''}! Só mais dois dados.</h1>
              <p className="ag2-sub">É o que a {lojista.nome} precisa para confirmar o horário e falar com você. Fazemos isso uma vez só.</p>
              <form className="ag2-form" onSubmit={terminarCadastro}>
                <label className="ag2-campo">
                  <span>Celular (WhatsApp)</span>
                  <input inputMode="tel" autoComplete="tel-national" placeholder="(11) 99999-9999" value={telefoneConta}
                    onChange={e => setTelefoneConta(formatarTelefone(e.target.value.replace(/\D/g, '').slice(0, 11)))} required />
                </label>
                <label className="ag2-campo">
                  <span>CPF</span>
                  <input inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={cpfConta}
                    onChange={e => setCpfConta(formatarCpf(e.target.value.replace(/\D/g, '').slice(0, 11)))} required />
                </label>
                <label className="ag2-termos">
                  <input type="checkbox" checked={aceitaTermos} onChange={e => setAceitaTermos(e.target.checked)} required />
                  <span>Li e aceito os <a href="/termos" target="_blank">Termos de Uso</a> e a <a href="/privacidade" target="_blank">Política de Privacidade</a>.</span>
                </label>
                <button type="submit" className={`ag2-cta ${isPending ? 'is-carregando' : ''}`} disabled={isPending}>
                  {isPending ? 'Salvando…' : 'Continuar para o horário'}
                </button>
              </form>
            </>
          ) : contaInvalida ? (
            <>
              <div className="ag2-cartao ag2-entrada-cartao">
                <span className="ag2-entrada-selo" aria-hidden="true"><IconUser style={{ width: 22, height: 22 }} /></span>
                <h1 className="ag2-entrada-titulo">Agende com a sua conta pessoal</h1>
                <p className="ag2-entrada-texto">Você está conectado com a conta de uma loja. Escolha a sua conta Google — se ela ainda não for cliente, é criada na hora.</p>
                <button type="button" className="ag2-cta is-google" onClick={entrarComGoogle} disabled={abrindoGoogle}>
                  <IconeGoogle /> {abrindoGoogle ? 'Abrindo o Google…' : 'Continuar com outra conta Google'}
                </button>
                <p className="ag2-nota ag2-centro">Você volta para cá com tudo o que escolheu na {lojista.nome}.</p>
              </div>
            </>
          ) : (
            <>
              <div className="ag2-cartao ag2-entrada-cartao">
                <span className="ag2-entrada-selo" aria-hidden="true"><IconPaw style={{ width: 22, height: 22 }} /></span>
                <h1 className="ag2-entrada-titulo">Entre para confirmar seu agendamento</h1>
                <p className="ag2-entrada-texto">É só com a sua conta Google — sem senha e sem formulário.</p>
                <ul className="ag2-entrada-casos">
                  <li>
                    <span className="ag2-entrada-icone"><IconCheck style={{ width: 16, height: 16 }} /></span>
                    <span><strong>Já tem conta?</strong> O sistema reconhece e você entra direto.</span>
                  </li>
                  <li>
                    <span className="ag2-entrada-icone"><IconUserPlus style={{ width: 16, height: 16 }} /></span>
                    <span><strong>Primeira vez?</strong> Sua conta é criada na hora.</span>
                  </li>
                </ul>
                <button type="button" className="ag2-cta is-google" onClick={entrarComGoogle} disabled={abrindoGoogle}>
                  <IconeGoogle /> {abrindoGoogle ? 'Abrindo o Google…' : 'Continuar com o Google'}
                </button>
                <p className="ag2-nota ag2-centro">Você volta para cá com tudo o que escolheu na {lojista.nome}.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ 2. Para quem e quando ============ */}
      {step === 'quando' && (
        <>
          <h1 className="ag2-titulo">Para quem<br />e quando?</h1>

          <section className="ag2-secao">
            <h2 className="ag2-secao-titulo">Pet</h2>
            <div className="ag2-chips ag2-rolagem">
              {pets.map(p => (
                <button key={p.id_pet} type="button" className={`ag2-chip ag2-chip-pet ${petId === p.id_pet ? 'is-ativo' : ''}`} onClick={() => selecionarPet(p)} aria-pressed={petId === p.id_pet}>
                  <span className="ag2-avatar" aria-hidden="true">{p.nome[0]?.toUpperCase()}</span>
                  {p.nome}
                </button>
              ))}
              <button type="button" className={`ag2-chip ${novoPetAberto ? 'is-ativo' : ''}`} onClick={() => setNovoPetAberto(v => !v)}>
                <IconPlus style={{ width: 14, height: 14 }} /> Novo pet
              </button>
            </div>

            {novoPetAberto && (
              <div className="ag2-cartao">
                <NovoPetNoAgendamento onCriado={aoCriarPet} onCancelar={pets.length > 0 ? () => setNovoPetAberto(false) : undefined} />
              </div>
            )}

            {petSel && precisaClassificar && !novoPetAberto && (
              <div className="ag2-cartao">
                <p className="ag2-nota">Conta pra gente sobre {petSel.nome} — o preço depende disso.</p>
                <div className="ag2-chips">
                  {(['Cão', 'Gato'] as const).map(e => (
                    <button key={e} type="button" className={`ag2-chip ${especieForm === e ? 'is-ativo' : ''}`} onClick={() => classificar(e, porteForm)} disabled={salvandoClassificacao}>{e}</button>
                  ))}
                </div>
                <div className="ag2-chips">
                  {(['Pequeno', 'Médio', 'Grande'] as const).map(p => (
                    <button key={p} type="button" className={`ag2-chip ${porteForm === p ? 'is-ativo' : ''}`} onClick={() => classificar(especieForm, p)} disabled={salvandoClassificacao}>{p}</button>
                  ))}
                </div>
                {salvandoClassificacao && <p className="ag2-nota">Salvando…</p>}
              </div>
            )}
          </section>

          <section className="ag2-secao">
            <h2 className="ag2-secao-titulo">Dia</h2>
            {proximosDias.length === 0 ? (
              <p className="ag2-vazio">Sem dias livres nas próximas semanas.</p>
            ) : (
              <div className="ag2-chips ag2-rolagem">
                {proximosDias.map(iso => {
                  const d = new Date(`${iso}T12:00:00`)
                  return (
                    <button key={iso} type="button" className={`ag2-dia ${data === iso ? 'is-ativo' : ''}`} onClick={() => escolherDia(iso)} aria-pressed={data === iso}>
                      <span className="ag2-dia-semana">{format(d, 'EEEEEE', { locale: ptBR }).replace('.', '').slice(0, 3)}</span>
                      <span className="ag2-dia-numero">{format(d, 'd')}</span>
                      <span className="ag2-dia-mes">{format(d, 'MMM', { locale: ptBR }).replace('.', '')}</span>
                    </button>
                  )
                })}
                <button type="button" className="ag2-dia is-outra" onClick={() => setCalendarioAberto(true)}>
                  <span className="ag2-dia-numero">+</span>
                  <span className="ag2-dia-mes">outra data</span>
                </button>
              </div>
            )}
          </section>

          {data && (
            <section className="ag2-secao">
              <h2 className="ag2-secao-titulo">Horário <span className="ag2-secao-extra">{dataLonga}</span></h2>
              {slots === null ? (
                <p className="ag2-nota">Buscando horários…</p>
              ) : slots.filter(s => s.disponivel).length === 0 ? (
                <p className="ag2-vazio">Nenhum horário livre nesse dia. Tente outro.</p>
              ) : (
                <div className="ag2-horarios">
                  {slots.filter(s => s.disponivel).map(slot => {
                    const hora = slot.hr_slot.slice(0, 5)
                    return (
                      <button key={slot.hr_slot} type="button" className={`ag2-chip ag2-hora ${horaInicio === hora ? 'is-ativo' : ''}`} onClick={() => escolherHorario(hora)} aria-pressed={horaInicio === hora}>
                        {hora}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          <div className="ag2-rodape">
            <button type="button" className="ag2-cta" disabled={!podeRevisar} onClick={() => { setErro(null); setStep('revisar') }}>
              {!petId ? 'Escolha o pet' : precisaClassificar ? `Complete os dados de ${petSel?.nome}` : !horaInicio ? 'Escolha o horário' : 'Revisar'}
            </button>
          </div>
        </>
      )}

      {/* ============ 3. Revisar e confirmar ============ */}
      {step === 'revisar' && (
        <>
          <div className="ag2-total">
            <span className="ag2-total-rotulo">{nadaAPagar ? 'Coberto pelo plano' : descontoPlano > 0 ? 'Total a pagar' : 'Total'}</span>
            <span className="ag2-total-valor">{formatarReais(Math.max(0, totalGeral))}</span>
            <span className="ag2-total-sub">{petSel?.nome} · {dataLonga} às {horaInicio}</span>
          </div>

          <div className="ag2-cartao ag2-linhas">
            <button type="button" className="ag2-linha" onClick={() => setStep('servicos')}>
              <span className="ag2-linha-rotulo">{servicosCarrinho.length > 1 ? 'Serviços' : 'Serviço'}</span>
              <span className="ag2-linha-valor">
                {servicosCarrinho.map(s => (
                  <span key={s.id_servico} className="ag2-linha-item">
                    {s.nome}<span>{formatarReais(precos[s.id_servico] ?? s.preco)}</span>
                  </span>
                ))}
              </span>
              <IconChevronRight className="ag2-linha-seta" />
            </button>
            <button type="button" className="ag2-linha" onClick={() => setStep('quando')}>
              <span className="ag2-linha-rotulo">Quando</span>
              <span className="ag2-linha-valor">
                <span className="ag2-linha-item">{dataLongaMaiuscula}, {horaInicio}<span>{duracaoTexto(duracaoTotal)}</span></span>
              </span>
              <IconChevronRight className="ag2-linha-seta" />
            </button>

            {taxidogDisponivel && (
              <div className="ag2-linha is-bloco">
                <button type="button" className="ag2-linha-topo" onClick={() => setTransporteAberto(v => !v)} aria-expanded={transporteAberto}>
                  <span className="ag2-linha-rotulo">Transporte</span>
                  <span className="ag2-linha-valor">
                    <span className="ag2-linha-item">
                      {escolhaTaxiDog ? `TaxiDog · ${ROTULO_MODALIDADE[escolhaTaxiDog.modalidade]}` : transporte.opcao === 'taxidog' ? 'TaxiDog · falta o endereço' : 'Eu levo o pet'}
                      {escolhaTaxiDog && <span>{formatarReais(escolhaTaxiDog.cotacao.valor)}</span>}
                    </span>
                  </span>
                  <span className="ag2-link">{transporteAberto ? 'Fechar' : 'Trocar'}</span>
                </button>
                {transporteAberto && (
                  <div className="ag2-linha-conteudo">
                    <TaxiDogCampos valor={transporte} onChange={setTransporte} cotar={cotar} compacto rotuloLevar="Eu levo o pet" />
                  </div>
                )}
              </div>
            )}

            {!nadaAPagar && (
              <div className="ag2-linha is-bloco">
                <span className="ag2-linha-rotulo">Pagamento</span>
                {opcoesPagamento.length === 0 ? (
                  <p className="ag2-nota">A loja ainda não configurou as formas de pagamento. Fale com ela.</p>
                ) : (
                  <div className="ag2-chips">
                    {opcoesPagamento.map(f => (
                      <button key={f} type="button" className={`ag2-chip ${formaPagamento === f ? 'is-ativo' : ''}`} onClick={() => setFormaPagamento(f)} aria-pressed={formaPagamento === f}>
                        {ROTULO_FORMA_PAGAMENTO[f]}
                      </button>
                    ))}
                  </div>
                )}
                {formaPagamento === 'pix' && <PixDaLoja chave={formasPagamento.pix_chave} nome={formasPagamento.pix_nome} />}
                <p className="ag2-nota">Você paga direto para a loja.</p>
              </div>
            )}

            {produtos.length > 0 && (
              <div className="ag2-linha is-bloco">
                <button type="button" className="ag2-linha-topo" onClick={() => setProdutosAbertos(v => !v)} aria-expanded={produtosAbertos}>
                  <span className="ag2-linha-rotulo">Produtos</span>
                  <span className="ag2-linha-valor">
                    <span className="ag2-linha-item">
                      {itensCarrinhoProdutos.length ? `${itensCarrinhoProdutos.length} ${itensCarrinhoProdutos.length === 1 ? 'item' : 'itens'}` : 'Nenhum'}
                      {totalProdutos > 0 && <span>{formatarReais(totalProdutos)}</span>}
                    </span>
                  </span>
                  <span className="ag2-link">{produtosAbertos ? 'Fechar' : 'Adicionar'}</span>
                </button>
                {produtosAbertos && (
                  <ul className="ag2-produtos">
                    {produtos.map(p => {
                      const q = quantidadesProdutos[p.id_produto] ?? 0
                      return (
                        <li key={p.id_produto}>
                          <span className="ag2-produto-texto">
                            <span className="ag2-servico-nome">{p.nome}</span>
                            <span className="ag2-servico-info">{formatarReais(p.preco_venda)} / {rotuloUnidade(p.unidade_venda)}</span>
                          </span>
                          <span className="ag2-stepper">
                            <button type="button" onClick={() => mudarQuantidade(p, -1)} disabled={q <= 0} aria-label={`Menos ${p.nome}`}><IconMinus style={{ width: 14, height: 14 }} /></button>
                            <span>{String(q).replace('.', ',')}</span>
                            <button type="button" onClick={() => mudarQuantidade(p, 1)} disabled={q >= p.estoque_atual} aria-label={`Mais ${p.nome}`}><IconPlus style={{ width: 14, height: 14 }} /></button>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="ag2-linha is-bloco">
              {obsAberta || obs ? (
                <>
                  <span className="ag2-linha-rotulo">Observação</span>
                  <textarea className="ag2-textarea" value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={500} placeholder="Ex.: ele fica nervoso com barulho" autoFocus={obsAberta && !obs} />
                </>
              ) : (
                <button type="button" className="ag2-link" onClick={() => setObsAberta(true)}>+ Adicionar observação para a loja</button>
              )}
            </div>
          </div>

          <PlanoNoPedido
            cobertura={cobertura}
            nomes={Object.fromEntries(servicosCarrinho.map(s => [s.id_servico, s.nome]))}
            data={data}
            usar={usarPlano}
            onUsar={setUsarPlano}
            disabled={isPending}
          />

          <p className="ag2-nota ag2-centro">
            Agendando como <strong>{cliente.nome}</strong>.
            {precosEstimados && ' O valor dos serviços é uma estimativa: a loja pode ajustar conforme a pelagem e as condições do pet.'}
          </p>

          <div className="ag2-rodape">
            <button type="button" className={`ag2-cta ${isPending ? 'is-carregando' : ''}`} disabled={isPending} onClick={handleAgendar}>
              {isPending ? 'Agendando…' : <>Confirmar agendamento <span className="ag2-cta-extra">{formatarReais(Math.max(0, totalGeral))}</span></>}
            </button>
          </div>
        </>
      )}

      {/* Confirmação */}
      {step === 'feito' && resultado && (
        <ConfirmacaoAgendamento
          idAgendamento={resultado.ids[0] ?? null}
          loja={{ nome: lojista.nome, telefone: lojista.telefone }}
          pet={petSel?.nome ?? ''}
          itens={itensResumo}
          data={data}
          hora={horaInicio}
          total={Math.max(0, totalSemPlano - (resultado.plano?.valorAbatido ?? 0))}
          pagamento={!nadaAPagar && formaPagamento ? { forma: formaPagamento, pixChave: formasPagamento.pix_chave, pixNome: formasPagamento.pix_nome } : null}
          plano={resultado.plano}
          aviso={resultado.aviso}
        />
      )}

      {/* Folha — calendário completo ("outra data") */}
      {calendarioAberto && (
        <Folha titulo="Escolha a data" onFechar={() => setCalendarioAberto(false)}>
          <SeletorDeData
            diasAbertos={diasAbertos}
            minInstante={minInstante}
            maxInstante={maxInstante}
            dataSelecionada={data}
            onSelecionar={iso => { escolherDia(iso); setCalendarioAberto(false) }}
            bloqueios={bloqueios}
          />
        </Folha>
      )}

      {/* Folha — o que o serviço inclui */}
      {servicoDetalhe && (
        <Folha titulo={servicoDetalhe.nome} onFechar={() => setServicoDetalhe(null)}>
          {servicoDetalhe.descricao && <p className="ag2-sub" style={{ marginBottom: 'var(--space-4)' }}>{servicoDetalhe.descricao}</p>}
          <p className="ag2-nota">{duracaoTexto(servicoDetalhe.duracao)} · a partir de {formatarReais(servicoDetalhe.preco)}</p>
          <button
            type="button"
            className="ag2-cta"
            style={{ marginTop: 'var(--space-5)' }}
            onClick={() => { alternarServico(servicoDetalhe.id_servico); setServicoDetalhe(null) }}
          >
            {carrinho.includes(servicoDetalhe.id_servico) ? 'Tirar do pedido' : 'Quero este'}
          </button>
        </Folha>
      )}

      {/* Folha — a loja */}
      {mostrarDetalheLoja && (
        <Folha titulo={lojista.nome} onFechar={() => setMostrarDetalheLoja(false)}>
          {lojista.descricao && <p className="ag2-sub" style={{ marginBottom: 'var(--space-5)' }}>{lojista.descricao}</p>}

          {enderecoCompleto && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div className="ag2-secao-titulo">Endereço</div>
              <div className="ag2-nota">{enderecoCompleto}{lojista.cep ? ` — CEP ${lojista.cep}` : ''}</div>
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div className="ag2-secao-titulo flex items-center gap-2"><IconClock style={{ width: 14, height: 14 }} /> Horário de funcionamento</div>
            {DIAS_ORDEM.map(dia => {
              const h = horarios.find(h => h.dia_semana === dia && h.ativo)
              return (
                <div key={dia} className="flex justify-between text-sm" style={{ padding: '3px 0' }}>
                  <span className="text-muted">{dia}</span>
                  <span style={{ color: h ? 'var(--gray-100)' : 'var(--gray-500)' }}>{h ? `${h.hr_inicio.slice(0, 5)} — ${h.hr_fim.slice(0, 5)}` : 'Fechado'}</span>
                </div>
              )
            })}
          </div>

          <div>
            <div className="ag2-secao-titulo">Avaliações</div>
            {avaliacoes.total === 0 || avaliacoes.media == null ? (
              <p className="ag2-nota">Ainda não há avaliações para esta loja.</p>
            ) : (
              <>
                <div className="avaliacao-media" style={{ marginBottom: 'var(--space-2)' }}>
                  <Estrelas nota={avaliacoes.media} />
                  <span className="avaliacao-media-valor" style={{ fontSize: '1.125rem' }}>{formatarMedia(avaliacoes.media)}</span>
                  <span className="text-sm text-muted">{avaliacoes.total} {avaliacoes.total === 1 ? 'avaliação' : 'avaliações'}</span>
                </div>
                {avaliacoes.recentes.map((a, i) => (
                  <div key={i} className="avaliacao-item" style={{ padding: 'var(--space-3) 0' }}>
                    <div className="avaliacao-item-topo" style={{ marginBottom: 'var(--space-1)' }}>
                      <Estrelas nota={a.nota} tamanho={13} />
                      <span className="text-xs text-muted">{a.primeiro_nome || 'Cliente'} · {format(new Date(a.created_at), 'dd/MM/yyyy')}</span>
                    </div>
                    <p className="avaliacao-item-comentario" style={{ fontSize: '0.875rem', marginBottom: 0 }}>&ldquo;{a.comentario}&rdquo;</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </Folha>
      )}
    </div>
  )
}

// Folha que sobe de baixo no celular (e vira janela central no computador).
function Folha({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])
  return (
    <div className="ag2-folha-fundo" onClick={onFechar}>
      <div className="ag2-folha" role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <div className="ag2-folha-topo">
          <h2 className="ag2-folha-titulo">{titulo}</h2>
          <button type="button" className="ag2-icone-btn" onClick={onFechar} aria-label="Fechar"><IconClose style={{ width: 16, height: 16 }} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function IconeGoogle() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7C21.8 18.9 23 15.9 23 12.3Z" />
      <path fill="#34A853" d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.6-2-6.5-4.8H1.7v3C3.6 20.5 7.5 23 12 23Z" />
      <path fill="#FBBC05" d="M5.5 13.6a6.6 6.6 0 0 1 0-4.2v-3H1.7a11 11 0 0 0 0 10.2l3.8-3Z" />
      <path fill="#EA4335" d="M12 4.6c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.1 15.1 0 12 0 7.5 0 3.6 2.5 1.7 6.4l3.8 3C6.4 6.6 9 4.6 12 4.6Z" />
    </svg>
  )
}
