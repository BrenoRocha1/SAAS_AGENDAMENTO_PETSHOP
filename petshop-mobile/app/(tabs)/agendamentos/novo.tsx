import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { FormasDePagamento, Segmentos } from '@/components/EscolhaPagamento'
import { EtapaTransporte } from '@/components/EtapaTransporte'
import { Folha } from '@/components/Folha'
import {
  IconAlert, IconCalendar, IconCar, IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconDog,
  IconPlus, IconScissors, IconSearch, IconUser, IconUserBadge, type IconeProps,
} from '@/components/IconesDoSite'
import { Opcao } from '@/components/Opcao'
import { SeletorDataHora } from '@/components/SeletorDataHora'
import { SemPermissao } from '@/components/SemPermissao'
import { Text, TextInput } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO, removerHorariosPassados } from '@/lib/agenda'
import { atribuirProfissional, type Slot } from '@/lib/agendamentos'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda, formatarTelefone, iniciais } from '@/lib/format'
import { dataParaISO, mascaraData } from '@/lib/mascaras'
import { formasAtivas, normalizarFormasLoja, type FormaPagamento } from '@/lib/pagamento'
import { ROTULO_MODALIDADE } from '@/lib/taxidog'
import { ESTADO_TRANSPORTE_INICIAL, escolhaDoTransporte, transportePronto, type EstadoTransporte } from '@/lib/transporte'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

interface ClienteOpcao { id_cliente: string; nome: string; telefone: string | null }
interface PetOpcao { id_pet: string; nome: string; raca: string | null; foto_url?: string | null }
interface ServicoOpcao { id_servico: string; nome: string; preco: number; duracao: number }
// fn_beneficios_do_pet (migration 060)
interface PlanoDoPet { plano: string; beneficios: { id_servico: string; quantidade: number; usados: number }[] }

const SEM_TAXIDOG: EstadoTransporte = { ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar' }

type Etapa = 'cliente' | 'pet' | 'servico' | 'horario' | 'transporte' | 'pagamento'

const PERGUNTA: Record<Etapa, string> = {
  cliente: 'Quem é o cliente?',
  pet: 'Qual pet?',
  servico: 'Qual serviço?',
  horario: 'Quando?',
  transporte: 'Como o pet vai até a loja?',
  pagamento: 'Resumo e pagamento',
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Novo agendamento feito pela loja (balcão, telefone) — a MESMA janela do
// site em largura de celular (petshop-app/src/components/lojista/
// NovoAgendamentoModal.tsx + novo-agendamento.css), no padrão do PDV: uma
// etapa por tela (escolheu, já passa para a seguinte), o resumo com o
// pagamento por último e o botão fixo embaixo. Lá é uma janela por cima da
// agenda; aqui é uma tela. Mudou lá, muda aqui. O agendamento nasce Aceito.
export default function NovoAgendamentoScreen() {
  const params = useLocalSearchParams<{ data?: string; cliente?: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const acessoTotal = !!contexto?.acessoTotal
  const comSite = acoesDisponiveis()
  const hoje = hojeBrasilISO()
  // Veio da ficha do cliente: já travado, sem opção de trocar.
  const clienteFixo = params.cliente ?? ''

  const [clientes, setClientes] = useState<ClienteOpcao[] | null>(null)
  const [petsPorCliente, setPetsPorCliente] = useState<Record<string, number>>({})
  const [servicos, setServicos] = useState<ServicoOpcao[]>([])
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [equipe, setEquipe] = useState<{ id_funcionario: string; nome: string }[]>([])
  const [taxidogAtivo, setTaxidogAtivo] = useState(false)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const [etapaEscolhida, setEtapa] = useState<Etapa>(clienteFixo ? 'pet' : 'cliente')
  const [obsAberta, setObsAberta] = useState(false)
  const [escolhendoProfissional, setEscolhendoProfissional] = useState(false)
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState(clienteFixo)
  const [pets, setPets] = useState<{ idCliente: string; lista: PetOpcao[] } | null>(null)
  const [petId, setPetId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [precos, setPrecos] = useState<{ petId: string; valores: Record<string, number> } | null>(null)
  const [data, setData] = useState(params.data && params.data >= hoje ? params.data : hoje)
  const [hora, setHora] = useState('')
  const [slots, setSlots] = useState<{ chave: string; lista: Slot[]; erro: boolean } | null>(null)
  const [recarga, setRecarga] = useState(0)
  // Começa em "o cliente leva o pet", como no site.
  const [transporte, setTransporte] = useState<EstadoTransporte>(SEM_TAXIDOG)
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [pago, setPago] = useState<'pendente' | 'pago'>('pendente')
  const [planos, setPlanos] = useState<{ chave: string; lista: PlanoDoPet[] } | null>(null)
  const [usarBeneficio, setUsarBeneficio] = useState(true)
  // O servidor não confirmou a cobertura do plano: volta a pedir o pagamento.
  const [planoNaoCobriu, setPlanoNaoCobriu] = useState(false)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<{ aviso?: string; usouPlano: boolean } | null>(null)
  // Cadastro rápido de pet
  const [novoPet, setNovoPet] = useState(false)
  const [petNome, setPetNome] = useState('')
  const [petRaca, setPetRaca] = useState('')
  const [petSexo, setPetSexo] = useState<'Macho' | 'Fêmea'>('Macho')
  const [petNasc, setPetNasc] = useState('')
  const [petErro, setPetErro] = useState<string | null>(null)
  const [salvandoPet, setSalvandoPet] = useState(false)

  // Clientes da loja (com quantos pets cada um tem), serviços ativos, formas
  // de pagamento aceitas, equipe e se a loja tem TaxiDog.
  useEffect(() => {
    if (!idLojista) return
    let cancelado = false
    Promise.all([
      supabase.from('cliente_lojista').select('cliente:id_cliente ( id_cliente, nome, telefone )').eq('id_lojista', idLojista),
      supabase.from('servico').select('id_servico, nome, preco, duracao').eq('id_lojista', idLojista).eq('status', 'Ativo').order('nome'),
      supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }),
      supabase.from('taxidog_config').select('ativo').eq('id_lojista', idLojista).maybeSingle(),
      acessoTotal
        ? supabase.from('funcionario').select('id_funcionario, nome').eq('id_lojista', idLojista).eq('ativo', true).order('nome')
        : Promise.resolve({ data: [] }),
    ]).then(async ([vinculos, servs, formasLoja, taxi, func]) => {
      if (cancelado) return
      if (vinculos.error) setErroCarga('Não foi possível carregar os clientes da loja.')
      const lista = ((vinculos.data ?? []) as unknown as { cliente: ClienteOpcao | null }[])
        .flatMap(v => (v.cliente ? [v.cliente] : []))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      setClientes(lista)
      setServicos(((servs.data ?? []) as ServicoOpcao[]).map(s => ({ ...s, preco: Number(s.preco) })))
      setFormas(formasAtivas(normalizarFormasLoja(formasLoja.data)))
      setTaxidogAtivo(!taxi.error && !!(taxi.data as { ativo: boolean } | null)?.ativo)
      setEquipe((func.data ?? []) as { id_funcionario: string; nome: string }[])
      if (lista.length === 0) return
      const { data: petsDaLoja } = await supabase.from('pet').select('id_cliente').in('id_cliente', lista.map(c => c.id_cliente)).eq('ativo', true)
      if (cancelado) return
      const conta: Record<string, number> = {}
      for (const p of (petsDaLoja ?? []) as { id_cliente: string }[]) conta[p.id_cliente] = (conta[p.id_cliente] ?? 0) + 1
      setPetsPorCliente(conta)
    })
    return () => { cancelado = true }
  }, [idLojista, acessoTotal])

  // Pets do cliente escolhido.
  useEffect(() => {
    if (!clienteId) return
    let cancelado = false
    supabase.from('pet').select('id_pet, nome, raca, foto_url').eq('id_cliente', clienteId).eq('ativo', true).order('nome').then(({ data: rows }) => {
      if (cancelado) return
      const lista = (rows ?? []) as PetOpcao[]
      setPets({ idCliente: clienteId, lista })
      if (lista.length === 1) {
        // Um pet só: já sai escolhido e a tela pula para o serviço.
        setPetId(lista[0].id_pet)
        setEtapa(e => (e === 'pet' ? 'servico' : e))
      } else {
        setPetId(atual => (lista.some(p => p.id_pet === atual) ? atual : ''))
      }
    })
    return () => { cancelado = true }
  }, [clienteId])

  // Preço de cada serviço PARA o pet escolhido (faixas por porte/raça,
  // migration 010) — o mesmo cálculo que o banco faz ao criar.
  useEffect(() => {
    if (!petId || servicos.length === 0) return
    let cancelado = false
    Promise.all(servicos.map(s =>
      supabase.rpc('fn_calcular_preco_servico', { p_id_servico: s.id_servico, p_id_pet: petId })
        .then(({ data: preco, error }) => [s.id_servico, error || preco == null ? s.preco : Number(preco)] as const),
    )).then(pares => {
      if (!cancelado) setPrecos({ petId, valores: Object.fromEntries(pares) })
    })
    return () => { cancelado = true }
  }, [petId, servicos])

  // Planos do pet no dia escolhido (migration 060) — sem plano, nada muda.
  useEffect(() => {
    if (!petId || !data) return
    let cancelado = false
    supabase.rpc('fn_beneficios_do_pet', { p_id_pet: petId, p_data: data }).then(({ data: rows, error }) => {
      if (!cancelado) setPlanos({ chave: `${petId}|${data}`, lista: error ? [] : ((rows ?? []) as PlanoDoPet[]) })
    })
    return () => { cancelado = true }
  }, [petId, data])

  // Horários livres do dia para a duração do serviço.
  const servico = servicos.find(s => s.id_servico === servicoId) ?? null
  const duracao = servico?.duracao
  const chaveSlots = `${data}|${servicoId}|${recarga}`
  useEffect(() => {
    if (!idLojista || !duracao) return
    let cancelado = false
    const chave = `${data}|${servicoId}|${recarga}`
    supabase.rpc('fn_horarios_disponiveis', { p_id_lojista: idLojista, p_data: data, p_duracao: duracao }).then(({ data: rows, error }) => {
      if (cancelado) return
      const lista = removerHorariosPassados((rows ?? []) as Slot[], data)
      setSlots({ chave, lista, erro: !!error })
      // O horário escolhido deixou de estar livre: desmarca.
      setHora(h => (lista.some(s => s.disponivel && s.hr_slot.slice(0, 5) === h) ? h : ''))
    })
    return () => { cancelado = true }
  }, [idLojista, data, servicoId, duracao, recarga])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    const lista = clientes ?? []
    return termo
      ? lista.filter(c => c.nome.toLowerCase().includes(termo) || (digitos.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(digitos)))
      : lista
  }, [clientes, busca])

  if (!contexto?.podeGerenciarAgenda || !idLojista) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Novo agendamento" junto />
        <SemPermissao area="criar agendamentos" />
      </ScreenContainer>
    )
  }
  const ctx = contexto

  const cliente = clientes?.find(c => c.id_cliente === clienteId) ?? null
  const petsDoCliente = pets?.idCliente === clienteId ? pets.lista : null
  const pet = petsDoCliente?.find(p => p.id_pet === petId) ?? null
  const precoDe = (s: ServicoOpcao) => (precos?.petId === petId && precos.valores[s.id_servico] != null ? precos.valores[s.id_servico] : s.preco)
  const slotsDoDia = servico && slots?.chave === chaveSlots ? slots : null
  // O benefício deste serviço com mais saldo (se o pet tiver mais de um plano).
  const beneficio = planos?.chave === `${petId}|${data}` && servicoId
    ? planos.lista
        .flatMap(p => p.beneficios.filter(b => b.id_servico === servicoId).map(b => ({ plano: p.plano, quantidade: b.quantidade, usados: Number(b.usados) })))
        .sort((a, b) => (b.quantidade - b.usados) - (a.quantidade - a.usados))[0] ?? null
    : null
  const restantes = beneficio ? beneficio.quantidade - beneficio.usados : 0
  const beneficioDisponivel = !!beneficio && restantes > 0
  const vaiUsarBeneficio = beneficioDisponivel && usarBeneficio
  // O transporte só entra com o TaxiDog ligado na loja e o site alcançável.
  const comTransporte = taxidogAtivo && comSite
  const escolhaTaxiDog = comTransporte ? escolhaDoTransporte(transporte) : null
  // O plano cobre o agendamento inteiro (sem TaxiDog): não há o que pagar.
  const nadaAPagar = vaiUsarBeneficio && !escolhaTaxiDog && !planoNaoCobriu
  // Loja com uma forma de pagamento só: ela já vai escolhida.
  const formaEscolhida: FormaPagamento | '' = forma || (formas.length === 1 ? formas[0] : '')
  const podeSubmeter = !!(clienteId && petId && servicoId && data && hora && (formaEscolhida || nadaAPagar))
    && (!comTransporte || transportePronto(transporte)) && !enviando

  // ---------- Etapas ----------
  const etapas: Etapa[] = [
    ...(clienteFixo ? [] : ['cliente' as const]),
    'pet', 'servico', 'horario',
    ...(comTransporte ? ['transporte' as const] : []),
    'pagamento',
  ]
  const etapa = etapas.includes(etapaEscolhida) ? etapaEscolhida : etapas[etapas.length - 1]
  const indice = etapas.indexOf(etapa)
  const feita: Record<Etapa, boolean> = {
    cliente: !!cliente,
    pet: !!pet,
    servico: !!servico,
    horario: hora !== '',
    transporte: transportePronto(transporte),
    pagamento: !!formaEscolhida || nadaAPagar,
  }
  // Uma etapa abre quando as de antes já foram feitas.
  const liberada = (e: Etapa) => etapas.slice(0, etapas.indexOf(e)).every(a => feita[a])
  const depoisDe = (e: Etapa): Etapa => etapas[etapas.indexOf(e) + 1] ?? e
  const irPara = (e: Etapa) => { if (!enviando && liberada(e)) setEtapa(e) }
  const voltar = () => (indice === 0 ? router.back() : setEtapa(etapas[indice - 1]))

  // Trocar de cliente limpa o que era do anterior: o pet e o endereço/taxa
  // do TaxiDog.
  function escolherCliente(id: string) {
    if (id !== clienteId) {
      setClienteId(id)
      setPetId('')
      setNovoPet(false)
      setPetErro(null)
      setTransporte(SEM_TAXIDOG)
    }
    setEtapa('pet')
  }

  // ---------- Textos do resumo ----------
  const dia = new Date(`${data}T12:00:00`)
  const quandoCurto = hora ? `${DIAS[dia.getDay()]}, ${dia.getDate()} de ${MESES[dia.getMonth()].slice(0, 3)} · ${hora}` : null
  const valorServico = servico ? (vaiUsarBeneficio ? 0 : precoDe(servico)) : 0
  const valorTaxiDog = escolhaTaxiDog ? Number(escolhaTaxiDog.cotacao.valor ?? 0) : 0
  const total = valorServico + valorTaxiDog
  const faltas = [
    !cliente && 'cliente',
    !pet && 'pet',
    !servico && 'serviço',
    !hora && 'horário',
    comTransporte && !transportePronto(transporte) && 'endereço do TaxiDog',
    !nadaAPagar && !formaEscolhida && 'forma de pagamento',
  ].filter((f): f is string => !!f)
  const escolhido: Partial<Record<Etapa, string | null | undefined>> = {
    cliente: cliente?.nome,
    pet: pet?.nome,
    servico: servico?.nome,
    horario: quandoCurto,
  }
  const trilha = etapa === 'pagamento' ? '' : [
    clienteFixo ? cliente?.nome : null,
    ...etapas.slice(0, indice).map(e => escolhido[e]),
  ].filter(Boolean).join(' · ')
  const planosValidos = planos?.chave === `${petId}|${data}` ? planos.lista : []
  // Serviço que o plano do pet ainda cobre neste período (selo na lista).
  const cobertoPeloPlano = (idServico: string) =>
    planosValidos.some(p => p.beneficios.some(b => b.id_servico === idServico && b.quantidade > Number(b.usados)))

  async function criarPet() {
    if (!petNome.trim() || !petRaca.trim()) return setPetErro('Informe o nome e a raça do pet.')
    const nascimento = dataParaISO(petNasc)
    if (!nascimento) return setPetErro('A data de nascimento do pet é obrigatória.')
    if (nascimento > hoje) return setPetErro('A data de nascimento não pode ser futura.')
    setPetErro(null)
    setSalvandoPet(true)
    const r = await chamarAcao<{ id_pet: string }>('criarPetLojistaAction', form({ id_cliente: clienteId, nome: petNome.trim(), raca: petRaca.trim(), sexo: petSexo, dt_nasc: nascimento }))
    setSalvandoPet(false)
    if (r.error || !r.id_pet) return setPetErro(r.error ?? 'Não foi possível cadastrar o pet.')
    const criado = { id_pet: r.id_pet, nome: petNome.trim(), raca: petRaca.trim() }
    setPets(atual => (atual?.idCliente === clienteId ? { ...atual, lista: [...atual.lista, criado] } : { idCliente: clienteId, lista: [criado] }))
    setPetsPorCliente(conta => ({ ...conta, [clienteId]: (conta[clienteId] ?? 0) + 1 }))
    setPetId(criado.id_pet)
    setEtapa('servico')
    setNovoPet(false)
    setPetNome('')
    setPetRaca('')
    setPetSexo('Macho')
    setPetNasc('')
  }

  async function criar() {
    if (!podeSubmeter || !idLojista) return
    if (!nadaAPagar && !formaEscolhida) return setErro('Escolha a forma de pagamento.')
    setErro(null)
    setEnviando(true)

    let idNovo: string | undefined
    let aviso: string | undefined
    if (escolhaTaxiDog) {
      // Com TaxiDog, só a action do site cria (taxa, corrida e rota saem de lá).
      const r = await chamarAcao<{ id_agendamento: string }>('criarAgendamentoLojistaAction', form({
        id_cliente: clienteId,
        id_pet: petId,
        id_servico: servicoId,
        dt_agendamento: data,
        hr_agendamento: hora,
        obs,
        taxidog: JSON.stringify({ modalidade: escolhaTaxiDog.modalidade, endereco: escolhaTaxiDog.endereco }),
        forma_pagamento: formaEscolhida,
        status_pagamento: pago,
        usar_beneficio: vaiUsarBeneficio ? '1' : null,
      }))
      if (r.error || !r.id_agendamento) {
        setEnviando(false)
        setErro(r.error ?? 'Erro ao criar o agendamento. Tente de novo.')
        setRecarga(n => n + 1)
        return
      }
      idNovo = r.id_agendamento
      aviso = r.aviso
    } else {
      const { data: id, error } = await supabase.rpc('fn_criar_agendamento_lojista_com_pagamento', {
        // Sem cobrança o banco ainda exige uma forma pra criar: vai a primeira
        // que a loja aceita, só de passagem — quando o plano é usado, logo
        // abaixo, o valor zera e o banco troca a forma para "Plano de
        // assinatura" (migration 082).
        p_forma_pagamento: nadaAPagar ? formas[0] : formaEscolhida,
        p_status_pagamento: nadaAPagar ? 'pendente' : pago,
        p_id_lojista: idLojista,
        p_id_cliente: clienteId,
        p_id_pet: petId,
        p_id_servico: servicoId,
        p_data: data,
        p_hora: hora,
        p_obs: obs.trim() || null,
      })
      if (error || typeof id !== 'string') {
        setEnviando(false)
        setErro(mensagemDoBanco(error, 'Erro ao criar o agendamento. Tente de novo.'))
        // O servidor não confirmou a cobertura do plano: pede o pagamento.
        if (nadaAPagar) setPlanoNaoCobriu(true)
        setRecarga(n => n + 1)
        return
      }
      idNovo = id
      // Benefício do plano: se não der (limite, plano sem o serviço…), o
      // agendamento continua criado como avulso e a tela avisa.
      if (vaiUsarBeneficio) {
        const { error: erroBeneficio } = await supabase.rpc('fn_usar_beneficio', { p_id_agendamento: idNovo })
        if (erroBeneficio) aviso = `Agendamento criado, mas o benefício do plano não foi usado: ${mensagemDoBanco(erroBeneficio, 'tente pelo painel web.')}`
      }
    }

    // Profissional é opcional e não faz parte da criação: se foi escolhido,
    // atribui em seguida. Se falhar, o agendamento já existe — dá para
    // atribuir depois pelo detalhe.
    if (funcionarioId && idNovo) await atribuirProfissional(ctx, idNovo, funcionarioId)

    setEnviando(false)
    setFeito({ aviso, usouPlano: vaiUsarBeneficio })
    // Com aviso do plano, a tela fica aberta pra pessoa ler.
    if (!aviso) setTimeout(() => router.back(), 1200)
  }

  // Total, erro e o botão de confirmar — fixos no pé da tela na última etapa.
  const rodapeFinal = (
    <View style={styles.barraFinal}>
      {erro && (
        <View style={styles.erro} accessibilityRole="alert">
          <IconAlert size={15} color={colors.dangerFg} />
          <Text style={styles.erroTexto}>{erro}</Text>
        </View>
      )}
      <View style={styles.total}>
        <Text style={styles.totalRotulo}>Total</Text>
        <Text style={styles.totalValor}>{formatarMoeda(total)}</Text>
      </View>
      <BotaoDaBarra rotulo={enviando ? 'Agendando...' : 'Confirmar agendamento'} alto desativado={!podeSubmeter} onPress={criar} />
      {faltas.length > 0 && <Text style={styles.falta}>Falta: {faltas.join(', ')}.</Text>}
    </View>
  )

  return (
    <ScreenContainer scroll={false} contentStyle={styles.tela}>
      <KeyboardAvoidingView style={styles.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topo}>
          {/* Volta uma etapa (na primeira, sai da tela). */}
          <Pressable
            onPress={voltar}
            disabled={enviando}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={indice === 0 || feito ? 'Fechar' : 'Voltar para a etapa anterior'}
            style={styles.voltar}
          >
            <IconChevronLeft size={20} color="#1f2937" />
          </Pressable>
          <Text style={styles.titulo} numberOfLines={1}>Novo agendamento</Text>
          <Pressable onPress={() => router.back()} disabled={enviando} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar" style={styles.fechar}>
            <IconClose size={15} color={colors.textMuted} />
          </Pressable>
        </View>

        {feito ? (
          <View style={styles.sucesso}>
            <View style={styles.sucessoIcone}>
              <IconCheck size={30} color={colors.success} />
            </View>
            <Text style={styles.sucessoTitulo}>Agendamento confirmado</Text>
            <Text style={styles.sucessoTexto}>
              <Text style={styles.forte}>{pet?.nome}</Text> · {servico?.nome}{'\n'}
              {DIAS_LONGOS[dia.getDay()]}, {dia.getDate()} de {MESES[dia.getMonth()]} às {hora}
            </Text>
            {feito.usouPlano && !feito.aviso && <Text style={styles.sucessoTexto}>O benefício do plano foi usado.</Text>}
            {feito.aviso && (
              <>
                <View style={[styles.erro, { marginTop: 8 }]}>
                  <IconAlert size={15} color={colors.dangerFg} />
                  <Text style={styles.erroTexto}>{feito.aviso}</Text>
                </View>
                <BotaoPequeno normal rotulo="Fechar" onPress={() => router.back()} style={{ marginTop: 12 }} />
              </>
            )}
          </View>
        ) : (
          <>
            {/* Em que etapa está e o que já foi escolhido. */}
            <View style={styles.progresso}>
              {etapas.map((e, i) => <View key={e} style={[styles.segmento, i <= indice && styles.segmentoFeito]} />)}
            </View>
            <View style={styles.etapa}>
              <View style={styles.etapaLinha}>
                <Text style={styles.pergunta}>{PERGUNTA[etapa]}</Text>
                <Text style={styles.contador}>{indice + 1} de {etapas.length}</Text>
              </View>
              {!!trilha && <Text style={styles.trilha} numberOfLines={1}>{trilha}</Text>}
            </View>

            <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
              {erroCarga && <Aviso tipo="erro" texto={erroCarga} />}

              {/* Cliente */}
              {etapa === 'cliente' && (clientes === null ? (
                <ActivityIndicator color={colors.primary600} />
              ) : clientes.length === 0 ? (
                <Aviso tipo="alerta" texto="Você ainda não tem nenhum cliente cadastrado. Cadastre um em Clientes → Novo Cliente antes de criar o agendamento." />
              ) : (
                <>
                  <View style={styles.busca}>
                    <IconSearch size={18} color="#858d99" />
                    <TextInput
                      value={busca}
                      onChangeText={setBusca}
                      placeholder="Buscar por nome ou telefone"
                      placeholderTextColor={colors.textFaint}
                      editable={!enviando}
                      accessibilityLabel="Buscar cliente por nome ou telefone"
                      style={styles.buscaCampo}
                    />
                  </View>
                  <View style={styles.lista}>
                    {filtrados.map(c => {
                      const qtd = petsPorCliente[c.id_cliente] ?? 0
                      return (
                        <Linha
                          key={c.id_cliente}
                          avatar={<Text style={styles.avatarTexto}>{iniciais(c.nome)}</Text>}
                          titulo={c.nome}
                          detalhe={`${c.telefone ? formatarTelefone(c.telefone) : ''}${qtd > 0 ? ` · ${qtd} pet${qtd > 1 ? 's' : ''}` : ''}`}
                          selecionado={clienteId === c.id_cliente}
                          desativado={enviando}
                          onPress={() => escolherCliente(c.id_cliente)}
                        />
                      )
                    })}
                  </View>
                  {filtrados.length === 0 && <Text style={styles.msg}>Nenhum cliente encontrado para "{busca}".</Text>}
                </>
              ))}

              {/* Pet — sem nenhum pet, já abre o cadastro rápido */}
              {etapa === 'pet' && (petsDoCliente === null ? (
                <ActivityIndicator color={colors.primary600} />
              ) : (novoPet || petsDoCliente.length === 0) && comSite ? (
                <View style={styles.novoPet}>
                  <View style={styles.novoPetTitulo}>
                    <IconDog size={16} color={colors.primary600} />
                    <Text style={styles.novoPetTexto}>Novo pet de {cliente?.nome.split(' ')[0]}</Text>
                  </View>
                  {petsDoCliente.length === 0 && <Text style={styles.nota}>Este cliente ainda não tem pet cadastrado.</Text>}
                  {petErro && (
                    <View style={styles.erro}>
                      <IconAlert size={15} color={colors.dangerFg} />
                      <Text style={styles.erroTexto}>{petErro}</Text>
                    </View>
                  )}
                  <View style={styles.dois}>
                    <View style={styles.metade}>
                      <Campo rotulo="Nome do pet" obrigatorio value={petNome} onChangeText={setPetNome} placeholder="Rex" editable={!salvandoPet} maxLength={60} />
                    </View>
                    <View style={styles.metade}>
                      <Campo rotulo="Raça" obrigatorio value={petRaca} onChangeText={setPetRaca} placeholder="SRD, Poodle..." editable={!salvandoPet} maxLength={60} />
                    </View>
                  </View>
                  <View style={styles.dois}>
                    <View style={[styles.metade, { gap: 4 }]}>
                      <Text style={styles.rotulo}>Sexo <Text style={styles.estrela}>*</Text></Text>
                      <Segmentos
                        largo
                        rotulo="Sexo"
                        valor={petSexo}
                        desativado={salvandoPet}
                        opcoes={[{ valor: 'Macho', rotulo: 'Macho' }, { valor: 'Fêmea', rotulo: 'Fêmea' }]}
                        onChange={setPetSexo}
                      />
                    </View>
                    <View style={styles.metade}>
                      <Campo
                        rotulo="Nascimento"
                        obrigatorio
                        value={petNasc}
                        onChangeText={t => setPetNasc(mascaraData(t))}
                        placeholder="dd/mm/aaaa"
                        keyboardType="number-pad"
                        editable={!salvandoPet}
                        maxLength={10}
                      />
                    </View>
                  </View>
                  <View style={styles.aDireita}>
                    {petsDoCliente.length > 0 && (
                      <BotaoPequeno normal rotulo="Cancelar" style={styles.metade} desativado={salvandoPet} onPress={() => { setNovoPet(false); setPetErro(null) }} />
                    )}
                    <BotaoPequeno
                      normal
                      rotulo={salvandoPet ? 'Cadastrando...' : 'Salvar pet'}
                      variante="primario"
                      style={styles.metade}
                      desativado={salvandoPet || !petNome.trim() || !petRaca.trim() || !petNasc}
                      onPress={criarPet}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.lista}>
                  {petsDoCliente.length === 0 && <Text style={styles.msg}>Este cliente ainda não tem pet cadastrado.</Text>}
                  {petsDoCliente.map(p => (
                    <Linha
                      key={p.id_pet}
                      avatarGrande
                      avatar={p.foto_url
                        ? <Image source={{ uri: p.foto_url }} style={styles.foto} accessibilityIgnoresInvertColors />
                        : <IconDog size={22} color={colors.primary300} />}
                      titulo={p.nome}
                      detalhe={p.raca ?? undefined}
                      selecionado={petId === p.id_pet}
                      desativado={enviando}
                      onPress={() => { setPetId(p.id_pet); setEtapa('servico') }}
                    />
                  ))}
                  {comSite && (
                    <Linha
                      novo
                      avatarGrande
                      avatar={<IconPlus size={22} color={colors.primary600} />}
                      titulo="Cadastrar novo pet"
                      desativado={enviando}
                      onPress={() => setNovoPet(true)}
                    />
                  )}
                </View>
              ))}

              {/* Serviço — com o preço para o pet escolhido */}
              {etapa === 'servico' && (servicos.length === 0 ? (
                <Text style={styles.msg}>Nenhum serviço ativo cadastrado. Cadastre um em Serviços antes de agendar.</Text>
              ) : (
                <View style={styles.lista}>
                  {servicos.map(s => (
                    <Linha
                      key={s.id_servico}
                      avatar={<IconScissors size={18} color={colors.primary300} />}
                      titulo={s.nome}
                      detalhe={`${s.duracao} min`}
                      selo={cobertoPeloPlano(s.id_servico) ? ' · no plano do cliente' : undefined}
                      valor={formatarMoeda(precoDe(s))}
                      selecionado={servicoId === s.id_servico}
                      desativado={enviando}
                      onPress={() => {
                        if (s.id_servico !== servicoId) setHora('')
                        setServicoId(s.id_servico)
                        setEtapa('horario')
                      }}
                    />
                  ))}
                </View>
              ))}

              {/* Data e horário */}
              {etapa === 'horario' && (
                <SeletorDataHora
                  enxuto
                  idLojista={idLojista}
                  data={data}
                  onData={d => { setData(d); setHora('') }}
                  hora={hora}
                  onHora={h => { setHora(h); setEtapa(depoisDe('horario')) }}
                  slots={slotsDoDia ? slotsDoDia.lista : null}
                  aviso={
                    slotsDoDia?.erro ? 'Não foi possível carregar os horários. Escolha outro dia e volte, ou tente de novo em instantes.'
                      : slotsDoDia && slotsDoDia.lista.length === 0 ? 'Sem horário livre neste dia. Escolha outra data.'
                      : undefined
                  }
                  dataMin={hoje}
                  desativado={enviando}
                />
              )}

              {/* Transporte — só com o TaxiDog ativado na loja */}
              {etapa === 'transporte' && (
                <EtapaTransporte key={clienteId} compacto idLojista={idLojista} valor={transporte} onChange={setTransporte} loja={{ idCliente: clienteId }} />
              )}

              {/* Resumo e pagamento */}
              {etapa === 'pagamento' && (
                <>
                  <View style={styles.itens}>
                    <Item icone={IconUser} texto={cliente?.nome} vazio="Escolher cliente" onPress={clienteFixo ? undefined : () => irPara('cliente')} />
                    <Item icone={IconDog} texto={pet?.nome} detalhe={pet?.raca} vazio="Escolher pet" onPress={() => irPara('pet')} />
                    <Item
                      icone={IconScissors}
                      texto={servico?.nome}
                      vazio="Escolher serviço"
                      valor={servico ? (vaiUsarBeneficio ? 'Pelo plano' : formatarMoeda(precoDe(servico))) : null}
                      onPress={() => irPara('servico')}
                    />
                    <Item icone={IconCalendar} texto={quandoCurto} vazio="Escolher data e horário" onPress={() => irPara('horario')} />
                    {comTransporte && (
                      <Item
                        icone={IconCar}
                        texto={transporte.opcao === 'taxidog' ? 'TaxiDog' : 'Cliente leva o pet'}
                        detalhe={transporte.opcao === 'taxidog' ? ROTULO_MODALIDADE[transporte.modalidade] : null}
                        vazio=""
                        valor={escolhaTaxiDog ? formatarMoeda(valorTaxiDog) : transporte.opcao === 'taxidog' ? 'Falta o endereço' : null}
                        onPress={() => irPara('transporte')}
                      />
                    )}
                    {/* Profissional — opcional; só quem pode atribuir escolhe. */}
                    {equipe.length > 0 && acessoTotal && (
                      <Pressable
                        onPress={() => setEscolhendoProfissional(true)}
                        disabled={enviando}
                        accessibilityRole="button"
                        accessibilityLabel="Profissional (opcional)"
                        style={[styles.item, styles.itemFinal]}
                      >
                        <IconUserBadge size={16} color={colors.primary600} />
                        <Text style={[styles.itemTexto, !funcionarioId && styles.itemVazio]} numberOfLines={1}>
                          {equipe.find(f => f.id_funcionario === funcionarioId)?.nome ?? 'Sem profissional definido'}
                        </Text>
                        <View style={styles.seta} />
                      </Pressable>
                    )}
                  </View>

                  {/* Plano do pet (migration 060) */}
                  {servico && beneficio && (beneficioDisponivel ? (
                    <Pressable
                      onPress={() => setUsarBeneficio(v => !v)}
                      disabled={enviando}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: usarBeneficio }}
                      style={styles.plano}
                    >
                      <View style={[styles.caixinha, usarBeneficio && styles.caixinhaMarcada]}>
                        {usarBeneficio && <IconCheck size={11} color={colors.white} />}
                      </View>
                      <Text style={styles.planoTexto}>
                        <Text style={styles.forte}>Usar o benefício do plano</Text> — {beneficio.plano}: {restantes} de {beneficio.quantidade} restante{restantes !== 1 ? 's' : ''} no período. O serviço não é cobrado neste agendamento.
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={[styles.plano, styles.planoEsgotado]}>
                      <Text style={styles.planoTexto}>
                        Os usos deste serviço no plano {beneficio.plano} acabaram neste período ({beneficio.usados} de {beneficio.quantidade}) — ele será cobrado como avulso.
                      </Text>
                    </View>
                  ))}

                  {/* Pagamento — obrigatório, menos quando o plano cobre tudo. */}
                  {nadaAPagar ? (
                    <View style={styles.coberto}>
                      <IconCheck size={15} color={colors.successFg} />
                      <Text style={styles.cobertoTexto}>O plano cobre este agendamento: não há o que pagar.</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <View style={styles.blocoTopo}>
                        <Text style={styles.rotulo}>Pagamento</Text>
                        <Segmentos
                          rotulo="Status do pagamento"
                          valor={pago}
                          desativado={enviando}
                          opcoes={[{ valor: 'pendente', rotulo: 'Pendente' }, { valor: 'pago', rotulo: 'Pago' }]}
                          onChange={setPago}
                        />
                      </View>
                      <FormasDePagamento formas={formas} valor={formaEscolhida} desativado={enviando} onChange={setForma} />
                    </View>
                  )}

                  {/* Observações */}
                  {obsAberta || obs ? (
                    <TextInput
                      value={obs}
                      onChangeText={setObs}
                      placeholder="Observações. Ex: pet é nervoso com barulho"
                      placeholderTextColor={colors.textFaint}
                      accessibilityLabel="Observações (opcional)"
                      maxLength={500}
                      multiline
                      editable={!enviando}
                      autoFocus={obsAberta && !obs}
                      style={styles.obs}
                    />
                  ) : (
                    <Pressable onPress={() => setObsAberta(true)} disabled={enviando} hitSlop={8} accessibilityRole="button" style={styles.link}>
                      <IconPlus size={13} color={colors.primary600} />
                      <Text style={styles.linkTexto}>Adicionar observação</Text>
                    </Pressable>
                  )}
                </>
              )}
            </ScrollView>

            {/* O botão da etapa, fixo embaixo. */}
            {etapa === 'pagamento' ? rodapeFinal : (
              <View style={styles.barra}>
                {servico && (
                  <View>
                    <Text style={styles.barraRotulo}>Total</Text>
                    <Text style={styles.barraValor}>{formatarMoeda(total)}</Text>
                  </View>
                )}
                <BotaoDaBarra rotulo="Continuar" desativado={!feita[etapa] || enviando} onPress={() => setEtapa(depoisDe(etapa))} />
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>

      <Folha visivel={escolhendoProfissional} titulo="Profissional (opcional)" onFechar={() => setEscolhendoProfissional(false)}>
        <View style={{ gap: 8 }}>
          {[{ id_funcionario: '', nome: 'Sem profissional definido' }, ...equipe].map(f => (
            <Opcao
              key={f.id_funcionario}
              titulo={f.nome}
              selecionada={f.id_funcionario === funcionarioId}
              onPress={() => { setEscolhendoProfissional(false); setFuncionarioId(f.id_funcionario) }}
            />
          ))}
        </View>
      </Folha>
    </ScreenContainer>
  )
}

// Linha de escolha (`.na-opcao` no celular): cartão branco com o avatar, o
// nome, o detalhe e, à direita, o valor ou o "✓" da escolhida.
function Linha({ avatar, avatarGrande, titulo, detalhe, selo, valor, selecionado, novo, desativado, onPress }: {
  avatar: ReactNode
  avatarGrande?: boolean
  titulo: string
  detalhe?: string
  // Depois do detalhe, em verde ("no plano do cliente").
  selo?: string
  valor?: string
  selecionado?: boolean
  // A linha tracejada de "Cadastrar novo pet".
  novo?: boolean
  desativado?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desativado}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selecionado, disabled: !!desativado }}
      style={[styles.linha, selecionado && styles.linhaSelecionada, novo && styles.linhaNova]}
    >
      <View style={[styles.avatar, avatarGrande && styles.avatarGrande, novo && styles.avatarNovo]}>{avatar}</View>
      <View style={styles.linhaTexto}>
        <Text style={[styles.linhaTitulo, novo && styles.linhaTituloNovo]} numberOfLines={1}>{titulo}</Text>
        {!!detalhe && (
          <Text style={styles.linhaDetalhe} numberOfLines={1}>
            {detalhe}
            {selo ? <Text style={styles.selo}>{selo}</Text> : null}
          </Text>
        )}
      </View>
      {valor ? <Text style={styles.linhaValor}>{valor}</Text> : selecionado ? <IconCheck size={18} color={colors.primary600} /> : null}
    </Pressable>
  )
}

// Uma linha do resumo: o que já foi escolhido (ou o que falta) e, ao tocar,
// a etapa onde se troca.
function Item({ icone: Icone, texto, detalhe, vazio, valor, onPress }: {
  icone: ComponentType<IconeProps>
  texto?: string | null
  detalhe?: string | null
  vazio: string
  valor?: string | null
  onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" style={styles.item}>
      <Icone size={16} color={colors.primary600} />
      <Text style={[styles.itemTexto, !texto && styles.itemVazio]} numberOfLines={1}>
        {texto ?? vazio}
        {texto && detalhe ? <Text style={styles.itemDetalhe}> · {detalhe}</Text> : null}
      </Text>
      {!!valor && <Text style={styles.itemValor}>{valor}</Text>}
      {onPress && <IconChevronRight size={14} color={colors.textFaint} />}
    </Pressable>
  )
}

// O botão do pé da tela (`.na-barra .btn`): 50 de altura, 52 no de confirmar.
function BotaoDaBarra({ rotulo, alto, desativado, onPress }: { rotulo: string; alto?: boolean; desativado?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desativado}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desativado }}
      style={({ pressed }) => [styles.botao, alto ? styles.botaoAlto : styles.botaoNaLinha, (pressed || desativado) && styles.apagado]}
    >
      <Text style={styles.botaoTexto}>{rotulo}</Text>
    </Pressable>
  )
}

const SUAVE = 'rgba(79,70,229,0.12)'
const APAGADO = '#858d99'

// Medidas e cores da janela do site em 375 de largura (novo-agendamento.css).
const styles = StyleSheet.create({
  tela: { flex: 1, padding: 0, paddingBottom: 0 },

  // `.na-topo`
  topo: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 8, paddingHorizontal: 16 },
  voltar: { width: 32, height: 32, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  titulo: { flex: 1, fontSize: 18, lineHeight: 22.5, fontWeight: '700', color: colors.text },
  fechar: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  // `.na-progresso` e `.na-etapa`
  progresso: { flexDirection: 'row', gap: 4, paddingHorizontal: 16 },
  segmento: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  segmentoFeito: { backgroundColor: colors.primary600 },
  etapa: { padding: 12, paddingHorizontal: 16 },
  etapaLinha: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  pergunta: { flexShrink: 1, fontFamily: FONTE_TITULO, fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.2, color: colors.text },
  contador: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: APAGADO },
  trilha: { marginTop: 2, fontSize: 14, lineHeight: 22.4, color: colors.textMuted },

  // `.na-principal` / `.na-resumo-corpo`
  conteudo: { gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  msg: { paddingVertical: 24, textAlign: 'center', fontSize: 14, lineHeight: 22.4, color: APAGADO },
  nota: { fontSize: 13, lineHeight: 18.2, color: APAGADO },

  // `.na-busca`
  busca: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buscaCampo: { flex: 1, height: '100%', fontSize: 16, color: colors.text },

  // `.na-lista` e `.na-opcao`
  lista: { gap: 8 },
  linha: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8.8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  linhaSelecionada: { borderColor: colors.primary600 },
  linhaNova: { borderStyle: 'dashed', borderColor: colors.primary200, backgroundColor: 'transparent' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: SUAVE },
  avatarGrande: { width: 48, height: 48, borderRadius: 24 },
  avatarNovo: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary200 },
  avatarTexto: { fontSize: 13, lineHeight: 13, fontWeight: '700', color: colors.primary300 },
  foto: { width: '100%', height: '100%' },
  linhaTexto: { flex: 1 },
  linhaTitulo: { fontSize: 15, lineHeight: 20.25, fontWeight: '600', color: colors.text },
  linhaTituloNovo: { color: colors.primary600 },
  linhaDetalhe: { fontSize: 13, lineHeight: 17.55, color: APAGADO },
  selo: { fontWeight: '600', color: colors.successFg },
  linhaValor: { fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 25.6, fontWeight: '800', letterSpacing: -0.16, color: colors.text },

  // `.na-novo-pet`
  novoPet: { gap: 12 },
  novoPetTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  novoPetTexto: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text },
  dois: { flexDirection: 'row', gap: 12 },
  metade: { flex: 1 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  estrela: { color: colors.dangerFg },
  aDireita: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },

  // `.na-itens` e `.na-item`
  itens: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  item: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemFinal: { borderBottomWidth: 0 },
  itemTexto: { flex: 1, fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text },
  itemDetalhe: { fontSize: 13, fontWeight: '400', color: APAGADO },
  itemVazio: { fontWeight: '500', color: APAGADO },
  itemValor: { fontSize: 14, lineHeight: 22.4, fontWeight: '700', color: colors.text },
  // Triângulo apontando para baixo, como a seta do select.
  seta: { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.textMuted },

  // `.na-plano` e `.na-coberto`
  plano: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9.6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(79,70,229,0.25)', backgroundColor: 'rgba(79,70,229,0.08)' },
  planoEsgotado: { borderColor: colors.border, backgroundColor: colors.bg },
  planoTexto: { flex: 1, fontSize: 13, lineHeight: 18.2, color: '#1f2937' },
  forte: { fontWeight: '700', color: colors.text },
  caixinha: { width: 16, height: 16, marginTop: 1, borderRadius: 3, borderWidth: 1, borderColor: colors.textMuted, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  caixinhaMarcada: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  coberto: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cobertoTexto: { flex: 1, fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.successFg },

  // `.na-bloco` (pagamento)
  blocoTopo: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },

  link: { alignSelf: 'flex-start', height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  linkTexto: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.primary600 },
  obs: { minHeight: 52, paddingVertical: 6.4, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 14, lineHeight: 19.6, color: colors.text, textAlignVertical: 'top' },

  // `.na-barra`
  barra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  barraRotulo: { fontSize: 12, lineHeight: 19.2, fontWeight: '600', color: APAGADO },
  barraValor: { fontFamily: FONTE_TITULO, fontSize: 18, lineHeight: 21.6, fontWeight: '800', letterSpacing: -0.36, color: colors.text },
  barraFinal: { gap: 8, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  total: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalRotulo: { fontFamily: FONTE_TITULO, fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.textMuted },
  totalValor: { fontFamily: FONTE_TITULO, fontSize: 24, lineHeight: 28.8, fontWeight: '800', letterSpacing: -0.72, color: colors.text },
  botao: { height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary600 },
  botaoNaLinha: { flex: 1 },
  botaoAlto: { height: 52, marginTop: 4 },
  botaoTexto: { fontSize: 16, lineHeight: 16, fontWeight: '600', color: colors.white },
  apagado: { opacity: 0.5 },
  falta: { textAlign: 'center', fontSize: 12, lineHeight: 19.2, color: APAGADO },
  erro: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.dangerBg },
  erroTexto: { flex: 1, fontSize: 13, lineHeight: 18.2, fontWeight: '500', color: colors.dangerFg },

  // `.na-sucesso`
  sucesso: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  sucessoIcone: { width: 64, height: 64, marginBottom: 8, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },
  sucessoTitulo: { fontFamily: FONTE_TITULO, fontSize: 20, lineHeight: 25, fontWeight: '800', color: colors.text },
  sucessoTexto: { textAlign: 'center', fontSize: 14, lineHeight: 21, color: APAGADO },
})
