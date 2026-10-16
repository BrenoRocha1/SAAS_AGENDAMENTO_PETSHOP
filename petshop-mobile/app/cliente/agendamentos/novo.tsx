import { BotaoGaleriaServico } from '@/components/GaleriaServico'
import { COLUNAS_FOTO_SERVICO, agruparFotosPorServico, type FotoServico } from '@/lib/galeria'
import { useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { QuantidadeProduto } from '@/components/QuantidadeProduto'
import { IconCheck, IconLink, IconPlus, IconWhatsapp } from '@/components/IconesDoSite'
import { adicionalValePara, carregarAdicionaisOnline, type ServicoAdicional } from '@/lib/adicionais'
import { SearchField } from '@/components/SearchField'
import { SeletorDia } from '@/components/SeletorDia'
import { GradeHorarios } from '@/components/GradeHorarios'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Opcao } from '@/components/Opcao'
import { EtapaTransporte } from '@/components/EtapaTransporte'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { agoraBrasil, agoraBrasilHHMM, dataBR, dataExtensaISO, hojeBrasilISO, removerHorariosPassados } from '@/lib/agenda'
import type { Slot } from '@/lib/agendamentos'
import { formatarMoeda, linkWhatsApp } from '@/lib/format'
import { FORMAS_LOJA_PADRAO, ROTULO_FORMA_PAGAMENTO, formasAtivas, normalizarFormasLoja, type FormaPagamento, type FormasLoja } from '@/lib/pagamento'
import { coberturaDoPlano, type BeneficiosDoPet } from '@/lib/planos-cliente'
import { erroQuantidadeInteira, rotuloUnidade } from '@/lib/produto'
import { COLUNAS_PROMOCAO_SERVICO, economia, precoComDesconto, precoPromocionalServico, promoServicoVigente, promoVigente, seloDesconto, type Promocao, type PromocaoServico } from '@/lib/promocao'
import { ROTULO_MODALIDADE } from '@/lib/taxidog'
import { ESTADO_TRANSPORTE_INICIAL, escolhaDoTransporte, taxiDogParaFormulario, transportePronto, type EstadoTransporte } from '@/lib/transporte'
import { urlDoSite } from '@/lib/site'
import { colors, shadow, spacing, typography } from '@/theme/theme'
import { FONTE_TITULO } from '@/theme/fontes'
import { format } from 'date-fns'

interface Loja { id_lojista: string; nome_loja: string; telefone: string | null; cidade: string | null; estado: string | null; descricao: string | null; logo_url: string | null }
interface Pet { id_pet: string; nome: string; raca: string | null }
interface Servico { id_servico: string; nome: string; descricao: string | null; preco: number; duracao: number }
// `preco_venda` já com a promoção do produto (migration 095), quando há;
// `preco_original` é o de antes e `promo` o desconto em %.
interface Produto { id_produto: string; nome: string; preco_venda: number; unidade_venda: string; estoque_atual: number; preco_original?: number; promo?: number }
// Promoções que valem agora na loja (migrations 095 e 096).
interface PromocoesDaLoja { lojaId: string; servicos: Record<string, PromocaoServico>; produtos: Record<string, number> }
interface Bloqueio { dt_inicio: string; dt_fim: string; hr_inicio: string | null; motivo: string }
interface Janela { minValor: number; minUnidade: 'horas' | 'dias'; maxValor: number; maxUnidade: 'horas' | 'dias' }

// As três telas do agendamento pelo link do site (AgendamentoOnlineWizard):
// o que fazer → para quem e quando → revisar e confirmar. Antes delas, no
// app, a escolha do petshop.
type Etapa = 'loja' | 'servicos' | 'quando' | 'revisar'
const PASSOS: Etapa[] = ['servicos', 'quando', 'revisar']

const JANELA_PADRAO: Janela = { minValor: 0, minUnidade: 'horas', maxValor: 30, maxUnidade: 'dias' }
const NOME_DO_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

// Duas por linha: o nome comprido ("Cartão de crédito") não cabe ao lado da
// bolinha — como no site no celular.
const ROTULO_CURTO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Crédito',
  cartao_debito: 'Débito',
}

function nomeDoDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return NOME_DO_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

const duracaoTexto = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min} min`)

interface Feito {
  id: string | null
  total: number
  plano: { aplicados: number; valorAbatido: number } | null
  aviso: string | null
}

type RespostaDoAgendamento = {
  id_agendamento?: string
  ids_agendamento?: string[]
  // O preço de um serviço mudou desde que o cliente viu (promoção que
  // terminou ou começou): os de agora, com e sem a promoção.
  precos_atuais?: Record<string, { preco: number; cheio: number }>
  plano?: { aplicados: number; valorAbatido: number; aviso?: string }
  aviso_adicionais?: string
  adicionais_atuais?: ServicoAdicional[]
}

// Novo agendamento feito pelo cliente — o MESMO fluxo do link da loja no
// site: escolhe um ou mais serviços, depois o pet, o dia e o horário (tocar
// no horário já leva à revisão) e, numa tela só, transporte, pagamento,
// adicionais, produtos e recado, com o resumo e o total em cima. Quem cria é
// o servidor (criarAgendamentoAction para um serviço, criarAgendamentoOnlineAction
// para vários), que calcula de novo preço, taxa do TaxiDog, adicionais e plano.
export default function NovoAgendamentoClienteScreen() {
  // produto: veio da busca de produtos (Petshops → Produtos → Comprar ao
  // agendar, migration 098) — já entra no pedido.
  const params = useLocalSearchParams<{ loja?: string; produto?: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const idCliente = user?.id

  const [etapa, setEtapa] = useState<Etapa>(params.loja ? 'servicos' : 'loja')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<Feito | null>(null)

  // Dados fixos.
  const [lojas, setLojas] = useState<Loja[] | null>(null)
  const [minhasLojas, setMinhasLojas] = useState<Set<string>>(new Set())
  const [pets, setPets] = useState<Pet[] | null>(null)
  const [busca, setBusca] = useState('')

  // Escolhas.
  const [lojaId, setLojaId] = useState(params.loja ?? '')
  const [petId, setPetId] = useState('')
  const [carrinho, setCarrinho] = useState<string[]>([])
  const [transporte, setTransporte] = useState<EstadoTransporte>({ ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar' })
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  // Por produto: quanto vai no pedido (0 ou sem entrada = não vai).
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [usarPlano, setUsarPlano] = useState(true)
  // O servidor não confirmou que o plano cobre o pedido: volta a pedir o pagamento.
  const [planoNaoCobriu, setPlanoNaoCobriu] = useState(false)
  const [obs, setObs] = useState('')

  // Dados da loja escolhida.
  const [servicos, setServicos] = useState<Servico[] | null>(null)
  // Fotos de referência de cada serviço (migration 101) — sem ela, vazio.
  const [fotosServicos, setFotosServicos] = useState<Record<string, FotoServico[]>>({})
  const [produtos, setProdutos] = useState<Produto[]>([])
  // Serviços adicionais que a loja liberou para o agendamento (migration
  // 095) e os que o cliente marcou, por serviço do pedido.
  const [adicionaisLoja, setAdicionaisLoja] = useState<ServicoAdicional[]>([])
  const [adicionaisMarcados, setAdicionaisMarcados] = useState<Record<string, string[]>>({})
  const [taxidogDisponivel, setTaxidogDisponivel] = useState(false)
  const [precosEstimados, setPrecosEstimados] = useState(false)
  const [formasLoja, setFormasLoja] = useState<FormasLoja>(FORMAS_LOJA_PADRAO)
  const [diasAbertos, setDiasAbertos] = useState<Set<string> | null>(null)
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [janela, setJanela] = useState<Janela>(JANELA_PADRAO)
  const [precos, setPrecos] = useState<{ petId: string; valores: Record<string, number>; cheios: Record<string, number> } | null>(null)
  const [promocoes, setPromocoes] = useState<PromocoesDaLoja | null>(null)
  // Sobe quando o servidor avisa que um preço mudou: relê promoções e preços.
  const [recargaPrecos, setRecargaPrecos] = useState(0)
  const [slots, setSlots] = useState<{ chave: string; lista: Slot[] } | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [planos, setPlanos] = useState<{ chave: string; lista: BeneficiosDoPet[] } | null>(null)

  // Petshops que aceitam agendamento online, os do cliente primeiro, e os pets dele.
  useEffect(() => {
    if (!idCliente) return
    let cancelado = false
    Promise.all([
      supabase
        .from('lojista')
        .select('id_lojista, nome_loja, cidade, estado, descricao, telefone, logo_url')
        .eq('ativo', true)
        .eq('aceita_agendamento_online', true)
        .order('nome_loja'),
      supabase.from('cliente_lojista').select('id_lojista').eq('id_cliente', idCliente),
      supabase.from('pet').select('id_pet, nome, raca').eq('id_cliente', idCliente).eq('ativo', true).order('nome'),
    ]).then(([lj, vinc, pt]) => {
      if (cancelado) return
      setLojas((lj.data ?? []) as Loja[])
      setMinhasLojas(new Set(((vinc.data ?? []) as { id_lojista: string }[]).map(v => v.id_lojista)))
      const listaPets = (pt.data ?? []) as Pet[]
      setPets(listaPets)
      if (listaPets.length === 1) setPetId(listaPets[0].id_pet)
    })
    return () => { cancelado = true }
  }, [idCliente])

  // Tudo o que depende da loja escolhida.
  useEffect(() => {
    if (!lojaId) return
    let cancelado = false
    const hojeISO = format(agoraBrasil(), 'yyyy-MM-dd')
    carregarAdicionaisOnline(lojaId).then(lista => { if (!cancelado) setAdicionaisLoja(lista) })
    supabase.from('servico_foto').select(COLUNAS_FOTO_SERVICO).eq('id_lojista', lojaId).order('ordem')
      .then(({ data }) => { if (!cancelado) setFotosServicos(agruparFotosPorServico(data)) })
    Promise.all([
      supabase.from('servico').select('id_servico, nome, descricao, preco, duracao').eq('id_lojista', lojaId).eq('status', 'Ativo').order('nome'),
      // Produtos liberados pra venda no agendamento online (migration 039), com estoque.
      supabase
        .from('produto')
        .select('id_produto, nome, preco_venda, unidade_venda, estoque_atual')
        .eq('id_lojista', lojaId)
        .eq('status', 'Ativo')
        .eq('disponivel_agendamento_online', true)
        .gt('estoque_atual', 0)
        .order('nome'),
      supabase.rpc('fn_taxidog_publico', { p_id_lojista: lojaId }),
      supabase.from('lojista').select('precos_estimados').eq('id_lojista', lojaId).maybeSingle(),
      supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: lojaId }),
      supabase.from('horario').select('dia_semana, ativo').eq('id_lojista', lojaId),
      // Até o fim do ano que vem (o banco limita a ~400 dias).
      supabase.rpc('fn_bloqueios_loja', { p_id_lojista: lojaId, p_de: hojeISO, p_ate: `${Number(hojeISO.slice(0, 4)) + 1}-12-31` }),
      supabase.from('lojista').select('agendamento_min_valor, agendamento_min_unidade, agendamento_max_valor, agendamento_max_unidade').eq('id_lojista', lojaId).maybeSingle(),
    ]).then(([srv, prod, taxi, est, formas, hrs, blq, jan]) => {
      if (cancelado) return
      setServicos(((srv.data ?? []) as Servico[]).map(s => ({ ...s, preco: Number(s.preco) })))
      const listaProdutos = ((prod.data ?? []) as Produto[]).map(p => ({ ...p, preco_venda: Number(p.preco_venda), estoque_atual: Number(p.estoque_atual) }))
      setProdutos(listaProdutos)
      const inicial = params.produto
      if (inicial && lojaId === params.loja && listaProdutos.some(p => p.id_produto === inicial)) {
        setQuantidades(q => (q[inicial] ? q : { ...q, [inicial]: 1 }))
      }
      setTaxidogDisponivel(!!(taxi.data as { disponivel: boolean }[] | null)?.[0]?.disponivel)
      setPrecosEstimados(!!(est.data as { precos_estimados?: boolean } | null)?.precos_estimados)
      const f = normalizarFormasLoja(formas.data)
      setFormasLoja(f)
      const ativas = formasAtivas(f)
      setForma(ativas.length === 1 ? ativas[0] : '')
      setDiasAbertos(new Set(((hrs.data ?? []) as { dia_semana: string; ativo: boolean }[]).filter(h => h.ativo).map(h => h.dia_semana)))
      setBloqueios(blq.error ? [] : ((blq.data ?? []) as Bloqueio[]))
      const j = jan.data as { agendamento_min_valor: number; agendamento_min_unidade: Janela['minUnidade']; agendamento_max_valor: number; agendamento_max_unidade: Janela['maxUnidade'] } | null
      setJanela(j ? { minValor: j.agendamento_min_valor, minUnidade: j.agendamento_min_unidade, maxValor: j.agendamento_max_valor, maxUnidade: j.agendamento_max_unidade } : JANELA_PADRAO)
    })
    return () => { cancelado = true }
  }, [lojaId])

  // Promoções da loja que valem agora. Serviço: só as oferecidas no
  // agendamento online (a mesma regra com que o banco cobra o cliente).
  // Consultas à parte e tolerantes: sem as migrations, segue sem promoção.
  useEffect(() => {
    if (!lojaId) return
    let cancelado = false
    const agora = { data: hojeBrasilISO(), hora: agoraBrasilHHMM() }
    const promoServicos = async () => {
      const completa = await supabase.from('servico').select(`id_servico, ${COLUNAS_PROMOCAO_SERVICO}`).eq('id_lojista', lojaId).not('promo_percentual', 'is', null)
      if (!completa.error) return completa.data
      // Sem a 096: a promoção da 095, só percentual e datas.
      const simples = await supabase.from('servico').select('id_servico, promo_percentual, promo_inicio, promo_fim').eq('id_lojista', lojaId).not('promo_percentual', 'is', null)
      return simples.error ? [] : simples.data
    }
    Promise.all([
      promoServicos(),
      supabase.from('produto').select('id_produto, promo_percentual, promo_inicio, promo_fim').eq('id_lojista', lojaId).not('promo_percentual', 'is', null),
    ]).then(([srv, prod]) => {
      if (cancelado) return
      const servicosEmPromo = ((srv ?? []) as unknown as (PromocaoServico & { id_servico: string })[])
        .filter(x => promoServicoVigente(x, agora, { online: true }))
      const produtosEmPromo = ((prod.error ? [] : prod.data ?? []) as (Promocao & { id_produto: string })[])
        .map(x => [x.id_produto, promoVigente(x, agora.data)] as const)
        .filter(par => par[1] > 0)
      setPromocoes({ lojaId, servicos: Object.fromEntries(servicosEmPromo.map(x => [x.id_servico, x])), produtos: Object.fromEntries(produtosEmPromo) })
    })
    return () => { cancelado = true }
  }, [lojaId, recargaPrecos])

  // Preço de cada serviço PARA o pet escolhido (faixas por porte/raça), já
  // com a promoção — e o preço sem ela (migration 096), para o "de/por".
  useEffect(() => {
    if (!petId || !servicos || servicos.length === 0) return
    let cancelado = false
    Promise.all(servicos.map(async s => {
      const [atual, cheio] = await Promise.all([
        supabase.rpc('fn_calcular_preco_servico', { p_id_servico: s.id_servico, p_id_pet: petId }),
        supabase.rpc('fn_preco_servico_cheio', { p_id_servico: s.id_servico, p_id_pet: petId }),
      ])
      const preco = atual.error || atual.data == null ? s.preco : Number(atual.data)
      return [s.id_servico, preco, cheio.error || cheio.data == null ? preco : Number(cheio.data)] as const
    })).then(trios => {
      if (cancelado) return
      setPrecos({ petId, valores: Object.fromEntries(trios.map(t => [t[0], t[1]])), cheios: Object.fromEntries(trios.map(t => [t[0], t[2]])) })
    })
    return () => { cancelado = true }
  }, [petId, servicos, recargaPrecos])

  // Saldo do plano do pet nesta loja, no período da data escolhida
  // (fn_meus_beneficios, migration 075). Sem a migration, segue sem plano.
  useEffect(() => {
    if (!lojaId || !petId) return
    let cancelado = false
    const chave = `${lojaId}|${petId}|${data}`
    supabase.rpc('fn_meus_beneficios', { p_id_lojista: lojaId, p_id_pet: petId, p_data: data || null }).then(({ data: rows, error }) => {
      if (!cancelado) setPlanos({ chave, lista: error || !Array.isArray(rows) ? [] : (rows as BeneficiosDoPet[]) })
    })
    return () => { cancelado = true }
  }, [lojaId, petId, data])

  // O pedido: os serviços marcados, na ordem da lista da loja.
  const servicosCarrinho = useMemo(() => (servicos ?? []).filter(s => carrinho.includes(s.id_servico)), [servicos, carrinho])
  const duracaoTotal = servicosCarrinho.reduce((soma, s) => soma + s.duracao, 0)

  // Horários do dia para a duração do pedido inteiro.
  const chaveSlots = `${lojaId}|${data}|${duracaoTotal}|${recarga}`
  useEffect(() => {
    if (!lojaId || !data || !duracaoTotal) return
    let cancelado = false
    const chave = `${lojaId}|${data}|${duracaoTotal}|${recarga}`
    supabase.rpc('fn_horarios_disponiveis', { p_id_lojista: lojaId, p_data: data, p_duracao: duracaoTotal }).then(({ data: rows }) => {
      if (cancelado) return
      const lista = removerHorariosPassados((rows ?? []) as Slot[], data)
      setSlots({ chave, lista })
      setHora(h => (lista.some(s => s.disponivel && s.hr_slot.slice(0, 5) === h) ? h : ''))
    })
    return () => { cancelado = true }
  }, [lojaId, data, duracaoTotal, recarga])

  // Faixa de datas que a loja aceita (antecedência mínima e máxima).
  const faixa = useMemo(() => {
    const agora = agoraBrasil().getTime()
    const horas = (valor: number, unidade: 'horas' | 'dias') => (unidade === 'dias' ? valor * 24 : valor)
    const inicio = format(new Date(agora + horas(janela.minValor, janela.minUnidade) * 3600_000), 'yyyy-MM-dd')
    const fim = format(new Date(agora + horas(janela.maxValor, janela.maxUnidade) * 3600_000), 'yyyy-MM-dd')
    const dias = Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1
    return { inicio, dias: Math.min(Math.max(dias, 1), 400) }
  }, [janela])

  const diaFechado = (iso: string) =>
    (diasAbertos !== null && !diasAbertos.has(nomeDoDia(iso))) || bloqueios.some(b => !b.hr_inicio && b.dt_inicio <= iso && iso <= b.dt_fim)

  const lojasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (lojas ?? [])
      .filter(l => !termo || l.nome_loja.toLowerCase().includes(termo) || (l.cidade ?? '').toLowerCase().includes(termo))
      // As lojas do cliente primeiro.
      .sort((a, b) => Number(minhasLojas.has(b.id_lojista)) - Number(minhasLojas.has(a.id_lojista)) || a.nome_loja.localeCompare(b.nome_loja, 'pt-BR'))
  }, [lojas, busca, minhasLojas])

  const loja = lojas?.find(l => l.id_lojista === lojaId) ?? null
  const pet = pets?.find(p => p.id_pet === petId) ?? null
  // Promoção do serviço que vale agora para o cliente (ou nada).
  const promoDe = (s: Servico) => (promocoes?.lojaId === lojaId ? promocoes.servicos[s.id_servico] ?? null : null)
  const precoDoPet = (s: Servico) => (precos?.petId === petId && precos.valores[s.id_servico] != null ? precos.valores[s.id_servico] : null)
  // O que o cliente paga: o preço do banco para o pet e, antes de haver
  // pet, o "a partir de" já com a promoção.
  const precoDe = (s: Servico) => precoDoPet(s) ?? (promoDe(s) ? precoPromocionalServico(s.preco, s.preco, promoDe(s)) : s.preco)
  // O preço sem a promoção (para riscar e para a economia).
  const cheioDe = (s: Servico) => (precoDoPet(s) != null ? precos?.cheios[s.id_servico] ?? precoDe(s) : s.preco)
  const economiaPromo = servicosCarrinho.reduce((soma, s) => soma + economia(cheioDe(s), precoDe(s)), 0)
  // Produtos com o preço da promoção, como o banco cobra.
  const produtosVenda = useMemo<Produto[]>(() => produtos.map(p => {
    const pct = promocoes?.lojaId === lojaId ? promocoes.produtos[p.id_produto] ?? 0 : 0
    return pct > 0 ? { ...p, preco_venda: precoComDesconto(p.preco_venda, pct), preco_original: p.preco_venda, promo: pct } : p
  }), [produtos, promocoes, lojaId])
  const servicosEmPromo = (servicos ?? []).filter(s => cheioDe(s) > precoDe(s))
  const produtosEmPromo = produtosVenda.filter(p => !!p.promo)
  const valorServicos = servicosCarrinho.reduce((soma, s) => soma + precoDe(s), 0)
  const escolhaTaxi = escolhaDoTransporte(transporte)
  const itensProdutos = produtosVenda
    .map(p => ({ produto: p, quantidade: quantidades[p.id_produto] ?? 0 }))
    .filter(i => Number.isFinite(i.quantidade) && i.quantidade > 0)
  const totalProdutos = itensProdutos.reduce((soma, i) => soma + i.produto.preco_venda * i.quantidade, 0)
  const valorTaxi = escolhaTaxi?.cotacao.valor ?? 0
  // Adicionais: o que vale para cada serviço do pedido e o que foi marcado.
  // Tirar o serviço do pedido derruba a marca dos adicionais dele.
  const gruposAdicionais = servicosCarrinho
    .map(s => ({ servico: s, opcoes: adicionaisLoja.filter(a => adicionalValePara(a, s.id_servico)) }))
    .filter(g => g.opcoes.length > 0)
  const itensAdicionais = gruposAdicionais.flatMap(g =>
    g.opcoes
      .filter(a => (adicionaisMarcados[g.servico.id_servico] ?? []).includes(a.id_adicional))
      .map(a => ({ id_servico: g.servico.id_servico, id_adicional: a.id_adicional, nome: a.nome, preco: a.preco })),
  )
  const totalAdicionais = itensAdicionais.reduce((soma, a) => soma + a.preco, 0)
  const totalSemPlano = valorServicos + totalProdutos + valorTaxi + totalAdicionais
  const planosDoPet = planos?.chave === `${lojaId}|${petId}|${data}` ? planos.lista : null
  const cobertura = coberturaDoPlano(planosDoPet, carrinho)
  const vaiUsarPlano = usarPlano && cobertura.cobertos.length > 0
  const descontoPlano = vaiUsarPlano
    ? servicosCarrinho.filter(s => cobertura.cobertos.some(c => c.id_servico === s.id_servico)).reduce((soma, s) => soma + precoDe(s), 0)
    : 0
  const totalGeral = Math.max(0, totalSemPlano - descontoPlano)
  // O plano cobre o pedido inteiro (só serviços do plano, sem produto,
  // TaxiDog nem adicional): não há o que pagar, e o pagamento nem aparece.
  // O servidor refaz a conta; se discordar, `planoNaoCobriu` traz de volta.
  const planoCobreTudo = vaiUsarPlano && !planoNaoCobriu
    && carrinho.length > 0 && carrinho.every(id => cobertura.cobertos.some(c => c.id_servico === id))
    && itensProdutos.length === 0 && !escolhaTaxi && itensAdicionais.length === 0
  const carregandoSlots = duracaoTotal > 0 && !!data && slots?.chave !== chaveSlots

  function escolherLoja(id: string) {
    if (id !== lojaId) {
      setLojaId(id)
      // O que foi escolhido pra outra loja não vale pra esta.
      setServicos(null)
      setCarrinho([])
      setAdicionaisMarcados({})
      setTransporte({ ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar' })
      setTaxidogDisponivel(false)
      setForma('')
      setData('')
      setHora('')
      setQuantidades({})
      setDiasAbertos(null)
    }
    setErro(null)
    setEtapa('servicos')
  }

  function alternarServico(id: string) {
    setCarrinho(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]))
    // A duração do pedido mudou: o horário escolhido pode não caber mais.
    setHora('')
  }

  function escolherHora(h: string) {
    setHora(h)
    if (!h) return
    if (!petId) return setErro('Escolha o pet.')
    setErro(null)
    setEtapa('revisar')
  }

  function voltar() {
    setErro(null)
    if (etapa === 'revisar') return setEtapa('quando')
    if (etapa === 'quando') return setEtapa('servicos')
    if (etapa === 'servicos' && !params.loja) return setEtapa('loja')
    router.back()
  }

  async function agendar() {
    if (!transportePronto(transporte)) return setErro('Complete o endereço do TaxiDog ou escolha levar o pet.')
    if (!planoCobreTudo && !forma) return setErro('Escolha a forma de pagamento.')
    for (const i of itensProdutos) {
      const erroInteiro = erroQuantidadeInteira(i.produto.unidade_venda, i.quantidade)
      if (erroInteiro) return setErro(`${i.produto.nome}: use um número inteiro.`)
      if (i.quantidade > i.produto.estoque_atual) return setErro(`${i.produto.nome}: só há ${i.produto.estoque_atual} em estoque.`)
    }
    setErro(null)
    setEnviando(true)
    const campos = {
      id_lojista: lojaId,
      id_pet: petId,
      dt_agendamento: data,
      hr_agendamento: hora,
      obs: obs.trim(),
      produtos: itensProdutos.length > 0 ? JSON.stringify(itensProdutos.map(i => ({ id_produto: i.produto.id_produto, quantidade: i.quantidade }))) : null,
      taxidog: escolhaTaxi ? taxiDogParaFormulario(escolhaTaxi) : null,
      adicionais: itensAdicionais.length > 0
        ? JSON.stringify(itensAdicionais.map(a => ({ id_servico: a.id_servico, id_adicional: a.id_adicional, preco: a.preco })))
        : null,
      forma_pagamento: planoCobreTudo ? null : forma,
      usar_plano: vaiUsarPlano ? '1' : null,
      // Os preços que estão na tela: se algum mudou, o site não cria nada e
      // devolve os de agora.
      precos_vistos: JSON.stringify(servicosCarrinho.map(s => ({ id_servico: s.id_servico, preco: precoDe(s), promo: cheioDe(s) > precoDe(s) }))),
    }
    // Um serviço: a action de sempre. Vários: a do link do site, que cria um
    // agendamento por serviço, encadeados, numa transação só.
    const r = carrinho.length === 1
      ? await chamarAcao<RespostaDoAgendamento>('criarAgendamentoAction', form({ ...campos, id_servico: carrinho[0] }))
      : await chamarAcao<RespostaDoAgendamento>('criarAgendamentoOnlineAction', form({ ...campos, servicos: JSON.stringify(servicosCarrinho.map(s => s.id_servico)) }))
    setEnviando(false)
    if (r.error) {
      setErro(r.error)
      // Um adicional saiu do ar ou mudou de preço: o resumo passa a mostrar
      // a lista atual, e o cliente confirma de novo.
      if (r.adicionais_atuais) setAdicionaisLoja(r.adicionais_atuais)
      // O preço de um serviço mudou (a promoção terminou ou começou): o
      // resumo passa a mostrar o de agora e o cliente confirma de novo com o
      // novo total, ou volta em "Editar".
      if (r.precos_atuais) {
        const atuais = r.precos_atuais
        setPrecos(p => (p && p.petId === petId
          ? {
              petId,
              valores: { ...p.valores, ...Object.fromEntries(Object.entries(atuais).map(([id, v]) => [id, v.preco])) },
              cheios: { ...p.cheios, ...Object.fromEntries(Object.entries(atuais).map(([id, v]) => [id, v.cheio])) },
            }
          : p))
        setRecargaPrecos(n => n + 1)
      }
      // O servidor não confirmou a cobertura do plano: pede o pagamento.
      if (planoCobreTudo && r.error === 'Escolha a forma de pagamento.') setPlanoNaoCobriu(true)
      // O horário pode ter sido ocupado enquanto a pessoa confirmava.
      setRecarga(n => n + 1)
      return
    }
    const id = typeof r.id_agendamento === 'string' ? r.id_agendamento : r.ids_agendamento?.[0] ?? null
    setFeito({
      id,
      total: Math.max(0, totalSemPlano - (r.plano?.valorAbatido ?? 0)),
      plano: r.plano ? { aplicados: r.plano.aplicados, valorAbatido: r.plano.valorAbatido } : null,
      aviso: [r.plano?.aviso, r.aviso_adicionais].filter(Boolean).join(' ') || null,
    })
  }

  // Linhas do pedido (recibo e mensagem do WhatsApp).
  const itensDoPedido = [
    ...servicosCarrinho.map(s => s.nome),
    ...itensAdicionais.map(a => `${a.nome} (${formatarMoeda(a.preco)})`),
    ...itensProdutos.map(i => `${i.produto.nome} (${String(i.quantidade).replace('.', ',')} ${rotuloUnidade(i.produto.unidade_venda).toLowerCase()})`),
    ...(escolhaTaxi ? [`TaxiDog: ${ROTULO_MODALIDADE[escolhaTaxi.modalidade]} (${formatarMoeda(escolhaTaxi.cotacao.valor)})`] : []),
  ]

  // ── Agendado: o recibo, como no site ──
  if (feito && loja) {
    const usouPlano = !!feito.plano && feito.plano.aplicados > 0
    const nadaAPagar = usouPlano && feito.total <= 0
    const acompanhar = feito.id ? urlDoSite(`/acompanhar/${feito.id}`) : null
    const resumo = [
      `Olá! Acabei de agendar em ${loja.nome_loja}:`,
      ...itensDoPedido.map(i => `- ${i}`),
      `Pet: ${pet?.nome ?? ''}`,
      `Data: ${dataBR(data)} às ${hora}`,
      ...(usouPlano ? [`Plano: ${formatarMoeda(feito.plano!.valorAbatido)} cobertos pelo saldo do plano`] : []),
      `Total: ${formatarMoeda(feito.total)}`,
      ...(forma && !nadaAPagar ? [`Pagamento: ${ROTULO_FORMA_PAGAMENTO[forma]}`] : []),
      ...(acompanhar ? [`Acompanhe o agendamento: ${acompanhar}`] : []),
    ].join('\n')
    const whats = linkWhatsApp(loja.telefone, resumo)
    return (
      <ScreenContainer>
        <View style={styles.confTopo}>
          <View style={styles.confSeloHalo}><View style={styles.confSelo}><IconCheck size={28} color={colors.white} /></View></View>
          <Text style={styles.confTitulo}>Serviço agendado!</Text>
          <Text style={styles.confSub}>A loja {loja.nome_loja} já recebeu o seu pedido.</Text>
        </View>
        {feito.aviso && <Aviso tipo="alerta" texto={feito.aviso} style={{ marginBottom: spacing.md }} />}

        <View style={styles.recibo}>
          <LinhaRecibo rotulo="Pet" valor={pet?.nome ?? ''} primeira />
          <LinhaRecibo rotulo="Quando" valor={`${dataExtensaISO(data)} às ${hora}`} />
          <LinhaRecibo rotulo="Pedido" valor={itensDoPedido.join('\n')} />
          {usouPlano && <LinhaRecibo rotulo="Plano" valor={`− ${formatarMoeda(feito.plano!.valorAbatido)}`} cor={colors.primary300} />}
          {forma !== '' && !nadaAPagar && <LinhaRecibo rotulo="Pagamento" valor={ROTULO_FORMA_PAGAMENTO[forma]} />}
          <View style={[styles.reciboLinha, styles.reciboSeparada, { alignItems: 'center' }]}>
            <Text style={styles.reciboTotalRotulo}>{nadaAPagar ? 'Coberto pelo plano' : 'Total'}</Text>
            <Text style={styles.reciboTotal}>{formatarMoeda(feito.total)}</Text>
          </View>
        </View>

        {forma === 'pix' && !nadaAPagar && formasLoja.pix_chave && (
          <View style={styles.pix}>
            <Text style={styles.textoPequeno}>Chave Pix da loja{formasLoja.pix_nome ? ` (${formasLoja.pix_nome})` : ''}</Text>
            <Text style={styles.pixChave} selectable>{formasLoja.pix_chave}</Text>
          </View>
        )}

        <View style={styles.confAcoes}>
          {whats && (
            <Pressable onPress={() => Linking.openURL(whats)} accessibilityRole="button" style={({ pressed }) => [styles.cta, pressed && styles.apertado]}>
              <IconWhatsapp size={17} color={colors.white} />
              <Text style={styles.ctaTexto}>Enviar no WhatsApp da loja</Text>
            </Pressable>
          )}
          {acompanhar && (
            <Pressable onPress={() => Linking.openURL(acompanhar)} accessibilityRole="button" style={({ pressed }) => [styles.botaoClaro, pressed && styles.apertado]}>
              <IconLink size={17} color={colors.primary400} />
              <Text style={styles.botaoClaroTexto}>Acompanhar agendamento</Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.replace('/cliente/agendamentos' as never)} accessibilityRole="link" style={styles.confLink}>
            <Text style={styles.confLinkTexto}>Ver meus agendamentos</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    )
  }

  const indice = PASSOS.indexOf(etapa)
  const formas = formasAtivas(formasLoja)

  return (
    <ScreenContainer>
      <DetailHeader title="Novo agendamento" onVoltar={voltar} />

      {/* Os três passos do fluxo, como os traços do topo no site. */}
      {indice >= 0 && (
        <View style={styles.passos} accessibilityLabel={`Passo ${indice + 1} de ${PASSOS.length}`}>
          {PASSOS.map((p, i) => <View key={p} style={[styles.passo, i <= indice && styles.passoFeito]} />)}
        </View>
      )}

      {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} style={{ marginBottom: spacing.md }} />}
      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {/* Petshop */}
      {etapa === 'loja' && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.h1}>Em qual petshop?</Text>
          {lojas === null ? (
            <ActivityIndicator color={colors.primary600} />
          ) : lojas.length === 0 ? (
            <Aviso tipo="info" texto="Nenhum petshop está aceitando agendamento online agora." />
          ) : (
            <>
              {lojas.length > 5 && <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar petshop ou cidade..." />}
              {lojasFiltradas.map(l => (
                <Opcao
                  key={l.id_lojista}
                  titulo={l.nome_loja}
                  detalhe={[minhasLojas.has(l.id_lojista) ? 'Você já agendou aqui' : null, [l.cidade, l.estado].filter(Boolean).join(', ') || null].filter(Boolean).join(' · ') || undefined}
                  selecionada={lojaId === l.id_lojista}
                  onPress={() => escolherLoja(l.id_lojista)}
                  foto={l.logo_url}
                />
              ))}
              {lojasFiltradas.length === 0 && <Text style={styles.texto}>Nenhum petshop com esse nome.</Text>}
            </>
          )}
        </View>
      )}

      {/* 1. O que fazer — um toque marca ou desmarca; dá para marcar mais de um. */}
      {etapa === 'servicos' && (
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <Text style={styles.h1}>O que seu pet precisa hoje?</Text>
            <Text style={styles.texto}>
              {loja ? `${loja.nome_loja} · ` : ''}Toque para escolher — dá para marcar mais de um. Os preços são “a partir de”: o valor final depende do porte do pet.
            </Text>
          </View>
          {carrinho.length === 0 && itensProdutos.length > 0 && (
            <Aviso
              tipo="info"
              texto={`${itensProdutos.map(i => i.produto.nome).join(', ')} ${itensProdutos.length === 1 ? 'já está' : 'já estão'} no seu pedido. Escolha um serviço para agendar e levar junto.`}
            />
          )}
          {servicos === null ? (
            <ActivityIndicator color={colors.primary600} />
          ) : servicos.length === 0 ? (
            <Aviso tipo="info" texto="Este petshop ainda não tem serviços disponíveis." />
          ) : (
            <>
            {/* Em promoção: serviços e produtos com desconto agora — um toque põe no pedido. */}
            {(servicosEmPromo.length > 0 || produtosEmPromo.length > 0) && (
              <View style={{ gap: 8 }}>
                <Text style={styles.promosTitulo}>Em promoção</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promos}>
                  {servicosEmPromo.map(s => {
                    const marcado = carrinho.includes(s.id_servico)
                    return (
                      <Pressable key={s.id_servico} onPress={() => alternarServico(s.id_servico)} accessibilityRole="button" accessibilityState={{ selected: marcado }} style={[styles.promo, marcado && styles.promoMarcada]}>
                        <View style={styles.selo}><Text style={styles.seloTexto}>-{seloDesconto(cheioDe(s), precoDe(s))}%</Text></View>
                        <Text style={styles.promoNome} numberOfLines={2}>{s.nome}</Text>
                        <Text style={styles.promoPreco}><Text style={styles.riscado}>{formatarMoeda(cheioDe(s))}</Text>  {formatarMoeda(precoDe(s))}</Text>
                        <Text style={styles.promoEconomia}>Você economiza {formatarMoeda(economia(cheioDe(s), precoDe(s)))}</Text>
                        <Text style={styles.promoAcao}>{marcado ? 'No pedido ✓' : 'Adicionar'}</Text>
                      </Pressable>
                    )
                  })}
                  {produtosEmPromo.map(pr => {
                    const marcado = (quantidades[pr.id_produto] ?? 0) > 0
                    return (
                      <Pressable
                        key={pr.id_produto}
                        onPress={() => setQuantidades(atual => ({ ...atual, [pr.id_produto]: marcado ? 0 : Math.min(1, pr.estoque_atual) }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: marcado }}
                        style={[styles.promo, marcado && styles.promoMarcada]}
                      >
                        <View style={styles.selo}><Text style={styles.seloTexto}>-{pr.promo}%</Text></View>
                        <Text style={styles.promoNome} numberOfLines={2}>{pr.nome}</Text>
                        <Text style={styles.promoPreco}><Text style={styles.riscado}>{formatarMoeda(pr.preco_original ?? pr.preco_venda)}</Text>  {formatarMoeda(pr.preco_venda)}</Text>
                        <Text style={styles.promoAcao}>{marcado ? 'No pedido ✓' : 'Levar junto'}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            )}
            <View style={styles.grade}>
              {servicos.map(s => {
                const marcado = carrinho.includes(s.id_servico)
                const emPromo = cheioDe(s) > precoDe(s)
                return (
                  <View key={s.id_servico} style={styles.gradeCaixa}>
                    <Pressable
                      onPress={() => alternarServico(s.id_servico)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: marcado }}
                      accessibilityLabel={s.nome}
                      style={[styles.servico, marcado && styles.servicoMarcado, !!fotosServicos[s.id_servico]?.length && styles.servicoComGaleria]}
                    >
                      <View style={[styles.check, marcado && styles.checkMarcado]}>{marcado && <IconCheck size={14} color={colors.white} />}</View>
                      {emPromo && <View style={styles.selo}><Text style={styles.seloTexto}>-{seloDesconto(cheioDe(s), precoDe(s))}%</Text></View>}
                      <Text style={styles.servicoNome} numberOfLines={2}>{s.nome}</Text>
                      <Text style={styles.textoPequeno}>{duracaoTexto(s.duracao)}</Text>
                      <Text style={styles.servicoPreco}>
                        {emPromo && <><Text style={styles.riscado}>{formatarMoeda(cheioDe(s))}</Text>{'  '}</>}
                        {formatarMoeda(precoDe(s))}
                      </Text>
                    </Pressable>
                    {/* Fotos de referência: abrir não marca o serviço. */}
                    {fotosServicos[s.id_servico]?.length ? (
                      <View style={styles.servicoGaleria}><BotaoGaleriaServico fotos={fotosServicos[s.id_servico]} nomeServico={s.nome} /></View>
                    ) : null}
                  </View>
                )
              })}
            </View>
            </>
          )}
          <Pressable
            onPress={() => { setErro(null); setEtapa('quando') }}
            disabled={carrinho.length === 0}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, carrinho.length === 0 && styles.ctaParado, pressed && styles.apertado]}
          >
            <Text style={[styles.ctaTexto, carrinho.length === 0 && styles.ctaTextoParado]}>
              {carrinho.length === 0 ? 'Escolha um serviço' : 'Continuar'}
            </Text>
            {carrinho.length > 0 && (
              <Text style={styles.ctaExtra}>{carrinho.length} · {duracaoTexto(duracaoTotal)} · {formatarMoeda(valorServicos)}</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* 2. Para quem e quando — tocar no horário já leva à revisão. */}
      {etapa === 'quando' && (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.h1}>Para quem{'\n'}e quando?</Text>

          <Text style={styles.rotulo}>Pet</Text>
          {pets === null ? (
            <ActivityIndicator color={colors.primary600} />
          ) : pets.length === 0 ? (
            <>
              <Aviso tipo="alerta" texto="Você ainda não tem pet cadastrado." />
              <Botao rotulo="Cadastrar pet" icone="add" variante="secundario" onPress={() => router.push('/cliente/pets/novo' as never)} />
            </>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pets}>
              {pets.map(p => {
                const ativo = petId === p.id_pet
                return (
                  <Pressable key={p.id_pet} onPress={() => { setPetId(p.id_pet); setErro(null) }} accessibilityRole="radio" accessibilityState={{ selected: ativo }} style={[styles.pet, ativo && styles.petAtivo]}>
                    <View style={[styles.petInicial, ativo && styles.petInicialAtiva]}>
                      <Text style={[styles.petInicialTexto, ativo && { color: colors.white }]}>{p.nome.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.petNome, ativo && { color: colors.white }]} numberOfLines={1}>{p.nome}</Text>
                  </Pressable>
                )
              })}
              <Pressable onPress={() => router.push('/cliente/pets/novo' as never)} accessibilityRole="button" style={styles.pet}>
                <IconPlus size={16} color={colors.primary400} />
                <Text style={styles.petNome}>Novo pet</Text>
              </Pressable>
            </ScrollView>
          )}

          <Text style={styles.rotulo}>Dia</Text>
          <SeletorDia inicio={faixa.inicio} dias={faixa.dias} valor={data} onChange={d => { setData(d); setHora('') }} fechado={diaFechado} />

          <Text style={styles.rotulo}>Horário{data ? <Text style={styles.rotuloLeve}>  {dataExtensaISO(data)}</Text> : null}</Text>
          {data === '' ? (
            <Text style={styles.texto}>Toque no dia. Os riscados são dias em que a loja não abre.</Text>
          ) : (
            <GradeHorarios slots={slots?.lista ?? []} carregando={carregandoSlots} valor={hora} onChange={escolherHora} vazio="Nenhum horário disponível nesse dia. Escolha outra data." />
          )}

          <Pressable
            onPress={() => escolherHora(hora)}
            disabled={!hora || !petId}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, (!hora || !petId) && styles.ctaParado, pressed && styles.apertado]}
          >
            <Text style={[styles.ctaTexto, (!hora || !petId) && styles.ctaTextoParado]}>
              {!petId ? 'Escolha o pet' : !hora ? 'Escolha o horário' : 'Revisar'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* 3. Revisar e confirmar — o resumo em cima e o resto ali mesmo. */}
      {etapa === 'revisar' && (
        <View style={{ gap: spacing.md }}>
          <View style={styles.bloco}>
            <View style={styles.resumoLinha}>
              <View style={styles.entre}>
                <Text style={styles.resumoRotulo}>{servicosCarrinho.length > 1 ? 'Serviços' : 'Serviço'}</Text>
                <Pressable onPress={() => setEtapa('servicos')} hitSlop={8} accessibilityRole="link"><Text style={styles.link}>Editar</Text></Pressable>
              </View>
              {servicosCarrinho.map(s => (
                <ItemResumo key={s.id_servico} nome={s.nome} valor={formatarMoeda(precoDe(s))} riscado={cheioDe(s) > precoDe(s) ? formatarMoeda(cheioDe(s)) : undefined} />
              ))}
              {economiaPromo > 0 && <Text style={styles.resumoEconomia}>Você economiza {formatarMoeda(economiaPromo)} com a promoção</Text>}
            </View>
            <View style={[styles.resumoLinha, styles.resumoSeparada]}>
              <View style={styles.entre}>
                <Text style={styles.resumoRotulo}>Pet e horário</Text>
                <Pressable onPress={() => setEtapa('quando')} hitSlop={8} accessibilityRole="link"><Text style={styles.link}>Editar</Text></Pressable>
              </View>
              <ItemResumo nome={pet?.nome ?? ''} valor={duracaoTexto(duracaoTotal)} />
              <Text style={styles.textoPequeno}>{data ? dataExtensaISO(data) : ''}, {hora}</Text>
            </View>
            {(escolhaTaxi || totalProdutos > 0 || descontoPlano > 0 || itensAdicionais.length > 0) && (
              <View style={[styles.resumoLinha, styles.resumoSeparada]}>
                {itensAdicionais.map(a => <ItemResumo key={`${a.id_servico}:${a.id_adicional}`} nome={a.nome} valor={formatarMoeda(a.preco)} />)}
                {escolhaTaxi && <ItemResumo nome={`TaxiDog · ${ROTULO_MODALIDADE[escolhaTaxi.modalidade]}`} valor={formatarMoeda(escolhaTaxi.cotacao.valor)} />}
                {totalProdutos > 0 && <ItemResumo nome="Produtos" valor={formatarMoeda(totalProdutos)} />}
                {descontoPlano > 0 && <ItemResumo nome="Saldo do plano" valor={`− ${formatarMoeda(descontoPlano)}`} cor={colors.primary300} />}
              </View>
            )}
            <View style={[styles.entre, styles.resumoSeparada, { alignItems: 'center', paddingTop: 12 }]}>
              <Text style={styles.resumoTotalRotulo}>{planoCobreTudo ? 'Coberto pelo plano' : descontoPlano > 0 ? 'Total a pagar' : 'Total'}</Text>
              <Text style={styles.resumoTotal}>{formatarMoeda(totalGeral)}</Text>
            </View>
            {precosEstimados && (
              <Text style={styles.textoPequeno}>O valor dos serviços é uma estimativa: a loja pode ajustar conforme a pelagem e as condições do pet.</Text>
            )}
          </View>

          <Text style={styles.h1}>Revise e confirme</Text>

          {taxidogDisponivel && (
            <View style={styles.bloco}>
              <View style={styles.entre}>
                <Text style={styles.blocoTitulo}>Como o pet vai até a loja?</Text>
                {escolhaTaxi && <Text style={styles.blocoValor}>+ {formatarMoeda(escolhaTaxi.cotacao.valor)}</Text>}
              </View>
              <EtapaTransporte idLojista={lojaId} valor={transporte} onChange={setTransporte} compacto />
            </View>
          )}

          {cobertura.cobertos.length > 0 && (
            <View style={styles.bloco}>
              <Text style={styles.blocoTitulo}>{cobertura.cobertos.length > 1 ? 'Serviços no seu plano' : 'Este serviço está no seu plano'}</Text>
              {cobertura.cobertos.map(c => {
                const restam = c.quantidade - c.usados
                const nome = servicosCarrinho.find(s => s.id_servico === c.id_servico)?.nome ?? 'Serviço'
                return <Text key={c.id_servico} style={styles.texto}>{nome} — {c.plano}: {restam} de {c.quantidade} neste período</Text>
              })}
              <LinhaSwitch titulo="Usar o saldo do meu plano" detalhe="O serviço não é cobrado neste agendamento." valor={usarPlano} onChange={setUsarPlano} desativado={enviando} />
            </View>
          )}

          {!planoCobreTudo && (
            <View style={styles.bloco}>
              <Text style={styles.blocoTitulo}>Como você vai pagar?</Text>
              {formas.length === 0 ? (
                <Text style={styles.textoPequeno}>A loja ainda não configurou as formas de pagamento. Fale com ela.</Text>
              ) : (
                <View style={styles.formas}>
                  {formas.map(f => {
                    const ativa = forma === f
                    return (
                      <View key={f} style={styles.formaCaixa}>
                        <Pressable
                          onPress={() => setForma(f)}
                          disabled={enviando}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: ativa }}
                          accessibilityLabel={ROTULO_FORMA_PAGAMENTO[f]}
                          style={[styles.forma, ativa && styles.formaAtiva]}
                        >
                          <View style={[styles.radio, ativa && styles.radioAtivo]}>{ativa && <View style={styles.radioMiolo} />}</View>
                          <Text style={[styles.formaTexto, ativa && { color: colors.primary300 }]} numberOfLines={1}>{ROTULO_CURTO_FORMA[f]}</Text>
                        </Pressable>
                      </View>
                    )
                  })}
                </View>
              )}
              {forma === 'pix' && formasLoja.pix_chave && (
                <Text style={styles.textoPequeno}>Chave Pix da loja{formasLoja.pix_nome ? ` (${formasLoja.pix_nome})` : ''}: <Text style={styles.forte} selectable>{formasLoja.pix_chave}</Text></Text>
              )}
              <Text style={styles.textoPequeno}>Você paga direto para a loja{escolhaTaxi ? ', serviços e TaxiDog juntos' : ''}.</Text>
            </View>
          )}

          {gruposAdicionais.length > 0 && (
            <View style={styles.bloco}>
              <View style={styles.entre}>
                <Text style={styles.blocoTitulo}>Algo a mais para o pet?</Text>
                {/* O "opcional" dá lugar ao valor: a linha não muda de altura. */}
                {totalAdicionais > 0
                  ? <Text style={styles.blocoValor}>+ {formatarMoeda(totalAdicionais)}</Text>
                  : <Text style={styles.opcional}>opcional</Text>}
              </View>
              {gruposAdicionais.map(g => (
                <View key={g.servico.id_servico} style={{ gap: 8 }}>
                  <Text style={styles.textoPequeno}>Serviços adicionais para {g.servico.nome}</Text>
                  {g.opcoes.map(a => {
                    const marcado = (adicionaisMarcados[g.servico.id_servico] ?? []).includes(a.id_adicional)
                    return (
                      <Pressable
                        key={a.id_adicional}
                        onPress={() => setAdicionaisMarcados(m => {
                          const atuais = m[g.servico.id_servico] ?? []
                          return { ...m, [g.servico.id_servico]: atuais.includes(a.id_adicional) ? atuais.filter(x => x !== a.id_adicional) : [...atuais, a.id_adicional] }
                        })}
                        disabled={enviando}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: marcado }}
                        style={[styles.adicional, marcado && styles.adicionalAtivo]}
                      >
                        <View style={styles.adicionalTopo}>
                          <View style={[styles.caixa, marcado && styles.caixaAtiva]}>{marcado && <IconCheck size={12} color={colors.white} />}</View>
                          <Text style={styles.adicionalNome}>{a.nome}</Text>
                          <Text style={styles.adicionalPreco}>+ {formatarMoeda(a.preco)}</Text>
                        </View>
                        {a.descricao ? <Text style={styles.adicionalDesc}>{a.descricao}</Text> : null}
                      </Pressable>
                    )
                  })}
                </View>
              ))}
            </View>
          )}

          {produtosVenda.length > 0 && (
            <View style={styles.bloco}>
              <View style={styles.entre}>
                <Text style={styles.blocoTitulo}>Quer levar algum produto?</Text>
                {totalProdutos > 0 && <Text style={styles.blocoValor}>+ {formatarMoeda(totalProdutos)}</Text>}
              </View>
              {produtosVenda.map(p => {
                const q = quantidades[p.id_produto] ?? 0
                return (
                  <View key={p.id_produto} style={styles.produto}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.produtoNome} numberOfLines={2}>{p.nome}</Text>
                      <Text style={styles.textoPequeno}>
                        {!!p.promo && <><Text style={styles.riscado}>{formatarMoeda(p.preco_original ?? p.preco_venda)}</Text>{' '}</>}
                        {formatarMoeda(p.preco_venda)} / {rotuloUnidade(p.unidade_venda).toLowerCase()}
                        {!!p.promo && <Text style={styles.subtotal}> · -{p.promo}%</Text>}
                        {q > 0 ? <Text style={styles.subtotal}> · {formatarMoeda(p.preco_venda * q)}</Text> : null}
                      </Text>
                    </View>
                    {/* Mais e menos para o que se conta inteiro; por peso ou
                        litro, abre a janela de digitar a quantidade. */}
                    <QuantidadeProduto
                      nome={p.nome}
                      unidade={p.unidade_venda}
                      quantidade={q}
                      estoque={p.estoque_atual}
                      onChange={v => setQuantidades(atual => ({ ...atual, [p.id_produto]: v }))}
                      desativado={enviando}
                    />
                  </View>
                )
              })}
            </View>
          )}

          <View style={styles.bloco}>
            <Campo rotulo="Algum recado para a loja?" opcional value={obs} onChangeText={setObs} placeholder="Ex.: ele fica nervoso com barulho" maxLength={500} multiline />
          </View>

          <Pressable onPress={agendar} disabled={enviando} accessibilityRole="button" style={({ pressed }) => [styles.cta, (pressed || enviando) && styles.apertado]}>
            {enviando ? <ActivityIndicator color={colors.white} /> : (
              <>
                <Text style={styles.ctaTexto}>Confirmar agendamento</Text>
                <Text style={styles.ctaExtra}>{formatarMoeda(totalGeral)}</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </ScreenContainer>
  )
}

// `riscado`: o preço sem a promoção, antes do valor.
function ItemResumo({ nome, valor, cor, riscado }: { nome: string; valor: string; cor?: string; riscado?: string }) {
  return (
    <View style={styles.entre}>
      <Text style={[styles.resumoItem, cor ? { color: cor } : null]}>{nome}</Text>
      <Text style={[styles.resumoItemValor, cor ? { color: cor } : null]}>
        {riscado ? <><Text style={styles.riscado}>{riscado}</Text>{'  '}</> : null}
        {valor}
      </Text>
    </View>
  )
}

function LinhaRecibo({ rotulo, valor, cor, primeira }: { rotulo: string; valor: string; cor?: string; primeira?: boolean }) {
  return (
    <View style={[styles.reciboLinha, !primeira && styles.reciboSeparada]}>
      <Text style={styles.reciboRotulo}>{rotulo}</Text>
      <Text style={[styles.reciboValor, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  )
}

// Medidas do agendamento online do site (`.ag2-*`) em 375 de largura.
const styles = StyleSheet.create({
  passos: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: spacing.lg },
  passo: { width: 22, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  passoFeito: { backgroundColor: colors.primary600 },
  h1: { fontFamily: FONTE_TITULO, fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  rotulo: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.textDim },
  rotuloLeve: { fontWeight: '400', color: colors.textMuted },
  texto: { ...typography.body.md, color: colors.textMuted },
  textoPequeno: { fontSize: 13, lineHeight: 19.5, color: colors.textMuted },
  forte: { fontWeight: '700', color: colors.text },
  entre: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.primary400 },
  apertado: { opacity: 0.85 },

  // Serviços em grade, dois por linha.
  grade: { flexDirection: 'row', flexWrap: 'wrap', margin: -5 },
  gradeCaixa: { width: '50%', padding: 5 },
  // No canto de baixo, à direita (como .ag2-servico-galeria do site).
  servicoGaleria: { position: 'absolute', right: 15, bottom: 15 },
  servicoComGaleria: { paddingBottom: 44 },
  servico: { flex: 1, minHeight: 118, padding: 14, gap: 2, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 14 },
  servicoMarcado: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.08)' },
  check: { position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.borderStrong },
  checkMarcado: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  servicoNome: { paddingRight: 30, fontSize: 15, lineHeight: 19.5, fontWeight: '600', color: colors.text },
  servicoPreco: { marginTop: 'auto', paddingTop: 6, fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.text },

  // Promoções (`.ag2-promo*` do site).
  promosTitulo: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.successFg },
  promos: { gap: 10, paddingRight: 8 },
  promo: { width: 200, gap: 2, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.successBg, borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.35)' },
  promoMarcada: { borderColor: colors.success, backgroundColor: '#dcfce7' },
  promoNome: { fontSize: 15, lineHeight: 19.5, fontWeight: '700', color: colors.text },
  promoPreco: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  promoEconomia: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.successFg },
  promoAcao: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.successFg },
  selo: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, marginBottom: 4, backgroundColor: colors.success },
  seloTexto: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.2, color: colors.white },
  riscado: { fontSize: 13, fontWeight: '500', color: '#858d99', textDecorationLine: 'line-through' },
  resumoEconomia: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.successFg },

  // Botão principal (`.ag2-cta`).
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 54, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.primary600, ...shadow.sm },
  ctaParado: { backgroundColor: colors.border },
  ctaTexto: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.white },
  ctaTextoParado: { color: colors.textMuted },
  ctaExtra: { fontSize: 16, lineHeight: 21, fontWeight: '500', color: 'rgba(255,255,255,0.85)' },
  botaoClaro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  botaoClaroTexto: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },

  // Pets em fila, como as pílulas do site.
  pets: { gap: 8, paddingRight: 8 },
  pet: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 6, paddingRight: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  petAtivo: { borderColor: colors.primary600, backgroundColor: colors.primary600 },
  petInicial: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary100 },
  petInicialAtiva: { backgroundColor: 'rgba(255,255,255,0.22)' },
  petInicialTexto: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.primary300 },
  petNome: { maxWidth: 140, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },

  // Blocos da revisão (`.ag2-bloco`).
  bloco: { gap: 12, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  blocoTitulo: { flexShrink: 1, fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 20, fontWeight: '700', color: colors.text },
  blocoValor: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.primary300 },
  opcional: { fontSize: 13, lineHeight: 20, fontWeight: '500', color: colors.textMuted },

  // Resumo do pedido (`.ag2-resumo`).
  resumoLinha: { gap: 4 },
  resumoSeparada: { paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  resumoRotulo: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  resumoItem: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.text },
  resumoItemValor: { fontSize: 15, lineHeight: 21, color: colors.textDim },
  resumoTotalRotulo: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.textDim },
  resumoTotal: { fontFamily: FONTE_TITULO, fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.text },

  // Formas de pagamento, duas por linha.
  formas: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  formaCaixa: { width: '50%', padding: 4 },
  forma: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  formaAtiva: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.08)' },
  formaTexto: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  radio: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.textFaint },
  radioAtivo: { borderColor: colors.primary600 },
  radioMiolo: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary600 },

  // Adicionais: nome e preço na linha de cima, a descrição na largura toda.
  adicional: { gap: 2, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  adicionalAtivo: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.08)' },
  adicionalTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  adicionalNome: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  adicionalPreco: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.primary300 },
  adicionalDesc: { marginLeft: 30, fontSize: 13, lineHeight: 19.5, color: colors.textMuted },
  caixa: { width: 18, height: 18, marginTop: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.textFaint, borderRadius: 5 },
  caixaAtiva: { backgroundColor: colors.primary600, borderColor: colors.primary600 },

  produto: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  produtoNome: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  subtotal: { fontWeight: '600', color: colors.successFg },

  // "Serviço agendado!" (`.conf-*` do site).
  confTopo: { alignItems: 'center', gap: 6, paddingTop: 20, paddingBottom: 16 },
  confSeloHalo: { width: 76, height: 76, borderRadius: 38, marginBottom: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(79,70,229,0.12)' },
  confSelo: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary600 },
  confTitulo: { fontFamily: FONTE_TITULO, fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  confSub: { fontSize: 15, lineHeight: 21.75, textAlign: 'center', color: colors.textMuted },
  recibo: { paddingVertical: 4, paddingHorizontal: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  reciboLinha: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  reciboSeparada: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  reciboRotulo: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  reciboValor: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '600', textAlign: 'right', color: colors.text },
  reciboTotalRotulo: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.textDim },
  reciboTotal: { fontFamily: FONTE_TITULO, fontSize: 24, lineHeight: 29, fontWeight: '800', color: colors.text },
  pix: { gap: 2, marginTop: spacing.md, padding: 14, borderRadius: 12, backgroundColor: colors.primary50 },
  pixChave: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.text },
  confAcoes: { gap: 10, marginTop: spacing.lg },
  confLink: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  confLinkTexto: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.primary400 },
})
