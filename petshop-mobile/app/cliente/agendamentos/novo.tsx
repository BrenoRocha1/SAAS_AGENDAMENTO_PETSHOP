import { useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { SearchField } from '@/components/SearchField'
import { SeletorDia } from '@/components/SeletorDia'
import { GradeHorarios } from '@/components/GradeHorarios'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Opcao } from '@/components/Opcao'
import { EtapaTransporte } from '@/components/EtapaTransporte'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { agoraBrasil, dataBR, dataExtensaISO, removerHorariosPassados } from '@/lib/agenda'
import type { Slot } from '@/lib/agendamentos'
import { formatarMoeda, linkWhatsApp } from '@/lib/format'
import { paraNumero } from '@/lib/mascaras'
import { FORMAS_LOJA_PADRAO, ROTULO_FORMA_PAGAMENTO, formasAtivas, normalizarFormasLoja, type FormaPagamento, type FormasLoja } from '@/lib/pagamento'
import { coberturaDoPlano, type BeneficiosDoPet } from '@/lib/planos-cliente'
import { erroQuantidadeInteira, rotuloUnidade, unidadeFracionavel } from '@/lib/produto'
import { ROTULO_MODALIDADE } from '@/lib/taxidog'
import { ESTADO_TRANSPORTE_INICIAL, escolhaDoTransporte, taxiDogParaFormulario, transportePronto, type EstadoTransporte } from '@/lib/transporte'
import { urlDoSite } from '@/lib/site'
import { colors, spacing, typography } from '@/theme/theme'
import { format } from 'date-fns'

interface Loja { id_lojista: string; nome_loja: string; telefone: string | null; cidade: string | null; estado: string | null; descricao: string | null }
interface Pet { id_pet: string; nome: string; raca: string | null }
interface Servico { id_servico: string; nome: string; descricao: string | null; preco: number; duracao: number }
interface Produto { id_produto: string; nome: string; preco_venda: number; unidade_venda: string; estoque_atual: number }
interface Bloqueio { dt_inicio: string; dt_fim: string; hr_inicio: string | null; motivo: string }
interface Janela { minValor: number; minUnidade: 'horas' | 'dias'; maxValor: number; maxUnidade: 'horas' | 'dias' }

type Etapa = 'loja' | 'petservico' | 'transporte' | 'pagamento' | 'datahora' | 'confirmar'

const ROTULO_ETAPA: Record<Etapa, string> = {
  loja: 'Petshop',
  petservico: 'Pet e serviço',
  transporte: 'Transporte',
  pagamento: 'Pagamento',
  datahora: 'Data e horário',
  confirmar: 'Confirmar',
}

const JANELA_PADRAO: Janela = { minValor: 0, minUnidade: 'horas', maxValor: 30, maxUnidade: 'dias' }
const NOME_DO_DIA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function nomeDoDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return NOME_DO_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

interface Feito {
  id: string | null
  total: number
  plano: { aplicados: number; valorAbatido: number } | null
  aviso: string | null
}

// Novo agendamento feito pelo cliente — as mesmas etapas do painel web
// (NovoAgendamentoWizard): petshop → pet e serviço → transporte (quando a
// loja oferece TaxiDog) → pagamento → data e horário → confirmar (com
// produtos e saldo do plano). Quem cria é criarAgendamentoAction, no
// servidor, que calcula de novo preço, taxa do TaxiDog e plano.
export default function NovoAgendamentoClienteScreen() {
  const params = useLocalSearchParams<{ loja?: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const idCliente = user?.id

  const [etapa, setEtapa] = useState<Etapa>('loja')
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
  const [servicoId, setServicoId] = useState('')
  const [transporte, setTransporte] = useState<EstadoTransporte>(ESTADO_TRANSPORTE_INICIAL)
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [quantidades, setQuantidades] = useState<Record<string, string>>({})
  const [usarPlano, setUsarPlano] = useState(true)
  // O servidor não confirmou que o plano cobre o pedido: volta a pedir o pagamento.
  const [planoNaoCobriu, setPlanoNaoCobriu] = useState(false)
  const [obs, setObs] = useState('')

  // Dados da loja escolhida.
  const [servicos, setServicos] = useState<Servico[] | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [taxidogDisponivel, setTaxidogDisponivel] = useState(false)
  const [precosEstimados, setPrecosEstimados] = useState(false)
  const [formasLoja, setFormasLoja] = useState<FormasLoja>(FORMAS_LOJA_PADRAO)
  const [diasAbertos, setDiasAbertos] = useState<Set<string> | null>(null)
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [janela, setJanela] = useState<Janela>(JANELA_PADRAO)
  const [precos, setPrecos] = useState<{ petId: string; valores: Record<string, number> } | null>(null)
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
        .select('id_lojista, nome_loja, cidade, estado, descricao, telefone')
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
      setProdutos(((prod.data ?? []) as Produto[]).map(p => ({ ...p, preco_venda: Number(p.preco_venda), estoque_atual: Number(p.estoque_atual) })))
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

  // Preço de cada serviço PARA o pet escolhido (faixas por porte/raça).
  useEffect(() => {
    if (!petId || !servicos || servicos.length === 0) return
    let cancelado = false
    Promise.all(servicos.map(s =>
      supabase.rpc('fn_calcular_preco_servico', { p_id_servico: s.id_servico, p_id_pet: petId })
        .then(({ data: preco, error }) => [s.id_servico, error || preco == null ? s.preco : Number(preco)] as const),
    )).then(pares => { if (!cancelado) setPrecos({ petId, valores: Object.fromEntries(pares) }) })
    return () => { cancelado = true }
  }, [petId, servicos])

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

  // Horários do dia para a duração do serviço.
  const servico = servicos?.find(s => s.id_servico === servicoId) ?? null
  const duracao = servico?.duracao
  const chaveSlots = `${lojaId}|${data}|${servicoId}|${recarga}`
  useEffect(() => {
    if (!lojaId || !data || !duracao) return
    let cancelado = false
    const chave = `${lojaId}|${data}|${servicoId}|${recarga}`
    supabase.rpc('fn_horarios_disponiveis', { p_id_lojista: lojaId, p_data: data, p_duracao: duracao }).then(({ data: rows }) => {
      if (cancelado) return
      const lista = removerHorariosPassados((rows ?? []) as Slot[], data)
      setSlots({ chave, lista })
      setHora(h => (lista.some(s => s.disponivel && s.hr_slot.slice(0, 5) === h) ? h : ''))
    })
    return () => { cancelado = true }
  }, [lojaId, data, servicoId, duracao, recarga])

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
  const precoDe = (s: Servico) => (precos?.petId === petId && precos.valores[s.id_servico] != null ? precos.valores[s.id_servico] : s.preco)
  const escolhaTaxi = escolhaDoTransporte(transporte)
  const itensProdutos = produtos
    .map(p => ({ produto: p, quantidade: paraNumero(quantidades[p.id_produto] ?? '') }))
    .filter(i => Number.isFinite(i.quantidade) && i.quantidade > 0)
  const totalProdutos = itensProdutos.reduce((soma, i) => soma + i.produto.preco_venda * i.quantidade, 0)
  const valorTaxi = escolhaTaxi?.cotacao.valor ?? 0
  const totalSemPlano = (servico ? precoDe(servico) : 0) + totalProdutos + valorTaxi
  const planosDoPet = planos?.chave === `${lojaId}|${petId}|${data}` ? planos.lista : null
  const coberturaServicos = coberturaDoPlano(planosDoPet, (servicos ?? []).map(s => s.id_servico))
  const cobertura = coberturaDoPlano(planosDoPet, servicoId ? [servicoId] : [])
  const vaiUsarPlano = usarPlano && cobertura.cobertos.length > 0
  const descontoPlano = vaiUsarPlano && servico ? precoDe(servico) : 0
  const totalGeral = totalSemPlano - descontoPlano
  // O plano cobre o pedido inteiro (só o serviço dele, sem produto nem
  // TaxiDog): não há o que pagar, então a forma de pagamento nem aparece.
  // Se depois entrar algo cobrado (um produto na confirmação, por exemplo),
  // a etapa volta e é exigida antes de confirmar. O servidor refaz a conta.
  const planoCobreTudo = vaiUsarPlano && !planoNaoCobriu && itensProdutos.length === 0 && !escolhaTaxi

  const todasEtapas: Etapa[] = taxidogDisponivel
    ? ['loja', 'petservico', 'transporte', 'pagamento', 'datahora', 'confirmar']
    : ['loja', 'petservico', 'pagamento', 'datahora', 'confirmar']
  // O progresso conta o pagamento só quando ele é pedido (ou quando a
  // pessoa já está nele).
  const etapas = todasEtapas.filter(e => e !== 'pagamento' || !planoCobreTudo || etapa === 'pagamento')
  const passo = etapas.indexOf(etapa) + 1
  const vizinha = (atual: Etapa, sentido: 1 | -1) => {
    let i = todasEtapas.indexOf(atual) + sentido
    if (todasEtapas[i] === 'pagamento' && planoCobreTudo) i += sentido
    return todasEtapas[i] ?? atual
  }
  const avancar = () => { setErro(null); setEtapa(atual => vizinha(atual, 1)) }
  const voltar = () => { setErro(null); setEtapa(atual => vizinha(atual, -1)) }
  const carregandoSlots = !!servico && !!data && slots?.chave !== chaveSlots

  function escolherLoja(id: string) {
    if (id === lojaId) return
    setLojaId(id)
    // O que foi escolhido pra outra loja não vale pra esta.
    setServicos(null)
    setServicoId('')
    setTransporte(ESTADO_TRANSPORTE_INICIAL)
    setTaxidogDisponivel(false)
    setForma('')
    setData('')
    setHora('')
    setQuantidades({})
    setDiasAbertos(null)
  }

  async function agendar() {
    if (!planoCobreTudo && !forma) {
      setErro('Escolha a forma de pagamento.')
      setEtapa('pagamento')
      return
    }
    for (const i of itensProdutos) {
      const erroInteiro = erroQuantidadeInteira(i.produto.unidade_venda, i.quantidade)
      if (erroInteiro) return setErro(`${i.produto.nome}: use um número inteiro.`)
      if (i.quantidade > i.produto.estoque_atual) return setErro(`${i.produto.nome}: só há ${i.produto.estoque_atual} em estoque.`)
    }
    setErro(null)
    setEnviando(true)
    const r = await chamarAcao<{ id_agendamento: string; plano: { aplicados: number; valorAbatido: number; aviso?: string } }>(
      'criarAgendamentoAction',
      form({
        id_lojista: lojaId,
        id_pet: petId,
        id_servico: servicoId,
        dt_agendamento: data,
        hr_agendamento: hora,
        obs: obs.trim(),
        produtos: itensProdutos.length > 0 ? JSON.stringify(itensProdutos.map(i => ({ id_produto: i.produto.id_produto, quantidade: i.quantidade }))) : null,
        taxidog: escolhaTaxi ? taxiDogParaFormulario(escolhaTaxi) : null,
        forma_pagamento: planoCobreTudo ? null : forma,
        usar_plano: vaiUsarPlano ? '1' : null,
      }),
    )
    setEnviando(false)
    if (r.error) {
      setErro(r.error)
      // O servidor não confirmou a cobertura do plano: pede o pagamento.
      if (planoCobreTudo && r.error === 'Escolha a forma de pagamento.') {
        setPlanoNaoCobriu(true)
        setEtapa('pagamento')
      }
      // O horário pode ter sido ocupado enquanto a pessoa confirmava.
      setRecarga(n => n + 1)
      return
    }
    setFeito({
      id: typeof r.id_agendamento === 'string' ? r.id_agendamento : null,
      total: Math.max(0, totalSemPlano - (r.plano?.valorAbatido ?? 0)),
      plano: r.plano ? { aplicados: r.plano.aplicados, valorAbatido: r.plano.valorAbatido } : null,
      aviso: r.plano?.aviso ?? null,
    })
  }

  // ── Agendado ──
  if (feito && loja && servico) {
    const usouPlano = !!feito.plano && feito.plano.aplicados > 0
    const nadaAPagar = usouPlano && feito.total <= 0
    const acompanhar = feito.id ? urlDoSite(`/acompanhar/${feito.id}`) : null
    const resumo = [
      `Olá! Acabei de agendar em ${loja.nome_loja}:`,
      `- ${servico.nome}`,
      ...itensProdutos.map(i => `- ${i.produto.nome} (${i.quantidade} ${rotuloUnidade(i.produto.unidade_venda)})`),
      ...(escolhaTaxi ? [`- TaxiDog: ${ROTULO_MODALIDADE[escolhaTaxi.modalidade]} (${formatarMoeda(escolhaTaxi.cotacao.valor)})`] : []),
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
        <DetailHeader title="Serviço agendado!" onVoltar={() => router.replace('/cliente/agendamentos' as never)} />
        <View style={{ gap: spacing.md }}>
          <Aviso tipo="sucesso" texto={`${servico.nome} de ${pet?.nome ?? 'seu pet'} em ${loja.nome_loja}, ${dataBR(data)} às ${hora}. A loja ainda vai aceitar o pedido.`} />
          {feito.aviso && <Aviso tipo="alerta" texto={feito.aviso} />}
          <Card style={{ gap: 4 }}>
            {usouPlano && <Text style={styles.texto}>Saldo do plano: − {formatarMoeda(feito.plano!.valorAbatido)}</Text>}
            <Text style={styles.total}>{nadaAPagar ? 'Nada a pagar' : `Total: ${formatarMoeda(feito.total)}`}</Text>
            {forma && !nadaAPagar && <Text style={styles.texto}>Pagamento: {ROTULO_FORMA_PAGAMENTO[forma]}</Text>}
            {forma === 'pix' && !nadaAPagar && formasLoja.pix_chave && (
              <View style={{ marginTop: 4, gap: 2 }}>
                <Text style={styles.textoPequeno}>Chave Pix da loja{formasLoja.pix_nome ? ` (${formasLoja.pix_nome})` : ''}</Text>
                <Text style={styles.titulo} selectable>{formasLoja.pix_chave}</Text>
              </View>
            )}
          </Card>
          {whats && <Botao rotulo="Avisar a loja no WhatsApp" icone="logo-whatsapp" variante="secundario" onPress={() => Linking.openURL(whats)} />}
          <Botao rotulo="Ver meus agendamentos" onPress={() => router.replace('/cliente/agendamentos' as never)} />
        </View>
      </ScreenContainer>
    )
  }

  const podeAvancar =
    etapa === 'loja' ? !!lojaId
    : etapa === 'petservico' ? !!petId && !!servicoId
    : etapa === 'transporte' ? transportePronto(transporte)
    : etapa === 'pagamento' ? !!forma
    : etapa === 'datahora' ? !!data && !!hora
    : true

  return (
    <ScreenContainer>
      <DetailHeader title="Novo agendamento" />

      {/* Progresso */}
      <View style={styles.progresso}>
        <View style={styles.progressoLinha}>
          <Text style={styles.titulo}>{ROTULO_ETAPA[etapa]}</Text>
          <Text style={styles.textoPequeno}>Passo {passo} de {etapas.length}</Text>
        </View>
        <View style={styles.barraFundo}>
          <View style={[styles.barra, { width: `${(passo / etapas.length) * 100}%` }]} />
        </View>
      </View>

      {!acoesDisponiveis() && <Aviso tipo="alerta" texto={MSG_SEM_SITE} style={{ marginBottom: spacing.md }} />}
      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {/* 1. Petshop */}
      {etapa === 'loja' && (
        <View style={{ gap: spacing.sm }}>
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
                />
              ))}
              {lojasFiltradas.length === 0 && <Text style={styles.texto}>Nenhum petshop com esse nome.</Text>}
            </>
          )}
        </View>
      )}

      {/* 2. Pet e serviço */}
      {etapa === 'petservico' && (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.rotulo}>Qual pet?</Text>
          {pets === null ? (
            <ActivityIndicator color={colors.primary600} />
          ) : pets.length === 0 ? (
            <>
              <Aviso tipo="alerta" texto="Você ainda não tem pet cadastrado." />
              <Botao rotulo="Cadastrar pet" icone="add" variante="secundario" onPress={() => router.push('/cliente/pets/novo' as never)} />
            </>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {pets.map(p => (
                <Opcao key={p.id_pet} titulo={p.nome} detalhe={p.raca ?? undefined} selecionada={petId === p.id_pet} onPress={() => setPetId(p.id_pet)} />
              ))}
            </View>
          )}

          <Text style={styles.rotulo}>Qual serviço?</Text>
          {servicos === null ? (
            <ActivityIndicator color={colors.primary600} />
          ) : servicos.length === 0 ? (
            <Aviso tipo="info" texto="Este petshop ainda não tem serviços disponíveis." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {servicos.map(s => {
                const noPlano = petId ? coberturaServicos.cobertos.find(c => c.id_servico === s.id_servico) : undefined
                return (
                  <Opcao
                    key={s.id_servico}
                    titulo={s.nome}
                    detalhe={[`${s.duracao} min`, noPlano ? `No seu plano · ${noPlano.quantidade - noPlano.usados} de ${noPlano.quantidade}` : null, s.descricao].filter(Boolean).join(' · ')}
                    lateral={formatarMoeda(precoDe(s))}
                    selecionada={servicoId === s.id_servico}
                    onPress={() => { setServicoId(s.id_servico); setHora('') }}
                  />
                )
              })}
            </View>
          )}
        </View>
      )}

      {/* 3. Transporte — só quando a loja oferece TaxiDog */}
      {etapa === 'transporte' && <EtapaTransporte idLojista={lojaId} valor={transporte} onChange={setTransporte} />}

      {/* 4. Pagamento */}
      {etapa === 'pagamento' && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.texto}>Como você vai pagar? Escolher a forma não é pagar agora — a loja confirma quando receber.</Text>
          {formasAtivas(formasLoja).map(f => (
            <Opcao key={f} titulo={ROTULO_FORMA_PAGAMENTO[f]} selecionada={forma === f} onPress={() => setForma(f)} />
          ))}
          {escolhaTaxi && (
            <Text style={styles.texto}>TaxiDog · {ROTULO_MODALIDADE[escolhaTaxi.modalidade]} · {formatarMoeda(escolhaTaxi.cotacao.valor)}</Text>
          )}
        </View>
      )}

      {/* 5. Data e horário */}
      {etapa === 'datahora' && (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.rotulo}>Data</Text>
          <SeletorDia inicio={faixa.inicio} dias={faixa.dias} valor={data} onChange={d => { setData(d); setHora('') }} fechado={diaFechado} />
          <Text style={styles.texto}>{data ? dataExtensaISO(data) : 'Toque no dia. Os riscados são dias em que a loja não abre.'}</Text>
          {data !== '' && (
            <>
              <Text style={styles.rotulo}>Horário disponível</Text>
              <GradeHorarios slots={slots?.lista ?? []} carregando={carregandoSlots} valor={hora} onChange={setHora} vazio="Nenhum horário disponível nesse dia. Escolha outra data." />
            </>
          )}
        </View>
      )}

      {/* 6. Confirmar */}
      {etapa === 'confirmar' && servico && (
        <View style={{ gap: spacing.md }}>
          {cobertura.cobertos.length > 0 && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={styles.titulo}>Este serviço está no seu plano</Text>
              {cobertura.cobertos.map(c => {
                const restam = c.quantidade - c.usados
                return <Text key={c.id_servico} style={styles.texto}>{servico.nome} — {c.plano}: {restam} de {c.quantidade} {restam === 1 ? 'restante' : 'restantes'} neste período</Text>
              })}
              <LinhaSwitch titulo="Usar o saldo do meu plano" detalhe="O serviço não é cobrado neste agendamento." valor={usarPlano} onChange={setUsarPlano} desativado={enviando} />
            </Card>
          )}
          {cobertura.esgotados.map(e => (
            <Aviso key={e.id_servico} tipo="info" texto={`Os usos de ${servico.nome} no plano ${e.plano} acabaram neste período (${e.usados} de ${e.quantidade}) — será cobrado normalmente.`} />
          ))}
          {cobertura.cobertos.length === 0 && cobertura.esgotados.length === 0 && cobertura.semPeriodo.map(p => (
            <Aviso
              key={p.id_assinatura}
              tipo="info"
              texto={`Seu plano ${p.plano} ainda não tem período aberto para ${dataBR(data)}${p.proxima_cobranca ? ` (o próximo começa em ${dataBR(p.proxima_cobranca)})` : ''}. Este agendamento será cobrado normalmente.`}
            />
          ))}

          <Card style={{ gap: spacing.sm }}>
            <Linha rotulo="Petshop" valor={loja?.nome_loja ?? ''} />
            <Linha rotulo="Pet" valor={`${pet?.nome ?? ''}${pet?.raca ? ` — ${pet.raca}` : ''}`} />
            <Linha rotulo="Serviço" valor={`${servico.nome} (${servico.duracao} min)`} />
            <Linha rotulo="Quando" valor={`${dataExtensaISO(data)}, às ${hora}`} />
            <Linha rotulo="Valor do serviço" valor={formatarMoeda(precoDe(servico))} />
            {taxidogDisponivel && (
              <Linha rotulo="Transporte" valor={escolhaTaxi ? `TaxiDog · ${ROTULO_MODALIDADE[escolhaTaxi.modalidade]} · ${formatarMoeda(escolhaTaxi.cotacao.valor)}` : 'Você leva o pet até a loja'} />
            )}
            {totalProdutos > 0 && <Linha rotulo="Produtos" valor={formatarMoeda(totalProdutos)} />}
            {descontoPlano > 0 && <Linha rotulo="Saldo do plano" valor={`− ${formatarMoeda(descontoPlano)}`} />}
            <View style={styles.divisor} />
            <Linha rotulo={descontoPlano > 0 ? 'Total a pagar' : 'Total'} valor={formatarMoeda(totalGeral)} forte />
            {!planoCobreTudo && <Linha rotulo="Pagamento" valor={forma ? ROTULO_FORMA_PAGAMENTO[forma] : 'A escolher'} />}
            {precosEstimados && (
              <Text style={styles.textoPequeno}>
                O valor do serviço é uma estimativa: a loja pode ajustar o preço final conforme a pelagem e as condições do pet no dia.
                {escolhaTaxi ? ' A taxa do TaxiDog não muda.' : ''}
              </Text>
            )}
          </Card>

          {produtos.length > 0 && (
            <>
              <Text style={styles.rotulo}>Adicionar produtos (opcional)</Text>
              {produtos.map(p => (
                <View key={p.id_produto} style={styles.produto}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.titulo} numberOfLines={2}>{p.nome}</Text>
                    <Text style={styles.textoPequeno}>{formatarMoeda(p.preco_venda)} / {rotuloUnidade(p.unidade_venda).toLowerCase()}</Text>
                  </View>
                  <View style={{ width: 96 }}>
                    <Campo
                      rotulo="Qtd."
                      value={quantidades[p.id_produto] ?? ''}
                      onChangeText={t => setQuantidades(q => ({ ...q, [p.id_produto]: t }))}
                      keyboardType={unidadeFracionavel(p.unidade_venda) ? 'decimal-pad' : 'number-pad'}
                      placeholder="0"
                      maxLength={6}
                    />
                  </View>
                </View>
              ))}
            </>
          )}

          <Campo rotulo="Observações (opcional)" value={obs} onChangeText={setObs} placeholder="Ex.: pet é nervoso com barulho" maxLength={500} multiline />
        </View>
      )}

      <View style={styles.rodape}>
        {etapa !== 'loja' && <Botao rotulo="Voltar" variante="secundario" style={{ flex: 1 }} onPress={voltar} desativado={enviando} />}
        {etapa === 'confirmar' ? (
          <Botao rotulo="Confirmar agendamento" icone="checkmark" style={{ flex: 2 }} onPress={agendar} carregando={enviando} />
        ) : (
          <Botao rotulo="Próximo" style={{ flex: 2 }} onPress={avancar} desativado={!podeAvancar} />
        )}
      </View>
    </ScreenContainer>
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={[styles.linhaValor, forte && { fontWeight: '700' }]}>{valor}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  progresso: { marginBottom: spacing.lg, gap: spacing.sm },
  progressoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barraFundo: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barra: { height: 6, borderRadius: 3, backgroundColor: colors.primary500 },
  rotulo: { ...typography.label.md, color: colors.textDim },
  titulo: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  texto: { ...typography.body.md, color: colors.textMuted },
  textoPequeno: { ...typography.body.sm, color: colors.textMuted },
  total: { ...typography.heading.md, color: colors.text },
  linha: { flexDirection: 'row', gap: spacing.md },
  linhaRotulo: { ...typography.body.md, color: colors.textMuted, width: 112 },
  linhaValor: { ...typography.body.lg, color: colors.text, flex: 1 },
  divisor: { height: 1, backgroundColor: colors.border },
  produto: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  rodape: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
})
