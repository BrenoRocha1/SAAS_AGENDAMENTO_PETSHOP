import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { EtapaTransporte } from '@/components/EtapaTransporte'
import { IconCar, IconCheck, IconDog, IconPlus, IconScissors, IconSearch, type IconeProps } from '@/components/IconesDoSite'
import { ItemEscolha } from '@/components/ItemEscolha'
import { Seletor } from '@/components/Seletor'
import { SeletorDataHora } from '@/components/SeletorDataHora'
import { SemPermissao } from '@/components/SemPermissao'
import { Text, TextInput } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO, removerHorariosPassados } from '@/lib/agenda'
import { atribuirProfissional, type Slot } from '@/lib/agendamentos'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda, formatarTelefone } from '@/lib/format'
import { dataParaISO, mascaraData } from '@/lib/mascaras'
import { ROTULO_FORMA_PAGAMENTO, formasAtivas, normalizarFormasLoja, type FormaPagamento } from '@/lib/pagamento'
import { ESTADO_TRANSPORTE_INICIAL, escolhaDoTransporte, transportePronto, type EstadoTransporte } from '@/lib/transporte'
import { colors, spacing } from '@/theme/theme'

interface ClienteOpcao { id_cliente: string; nome: string; telefone: string | null }
interface PetOpcao { id_pet: string; nome: string; raca: string | null }
interface ServicoOpcao { id_servico: string; nome: string; preco: number; duracao: number }
// fn_beneficios_do_pet (migration 060)
interface PlanoDoPet { plano: string; beneficios: { id_servico: string; quantidade: number; usados: number }[] }

const SEM_TAXIDOG: EstadoTransporte = { ...ESTADO_TRANSPORTE_INICIAL, opcao: 'levar' }

// Novo agendamento feito pela loja (balcão, telefone) — a MESMA janela do
// site (petshop-app/src/components/lojista/NovoAgendamentoModal.tsx):
// mesmas seções, textos, ordem e botões, com as medidas tiradas dela em
// largura de celular. Lá é uma janela por cima da agenda; aqui é uma tela.
// Mudou lá, muda aqui. O agendamento nasce Aceito.
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
    supabase.from('pet').select('id_pet, nome, raca').eq('id_cliente', clienteId).eq('ativo', true).order('nome').then(({ data: rows }) => {
      if (cancelado) return
      const lista = (rows ?? []) as PetOpcao[]
      setPets({ idCliente: clienteId, lista })
      setPetId(atual => (lista.some(p => p.id_pet === atual) ? atual : ''))
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
    const lista = clientes ?? []
    return termo ? lista.filter(c => c.nome.toLowerCase().includes(termo)) : lista
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
  const podeSubmeter = !!(clienteId && petId && servicoId && data && hora && (forma || nadaAPagar))
    && (!comTransporte || transportePronto(transporte)) && !enviando

  function escolherCliente(id: string) {
    setClienteId(id)
    setPetId('')
    setNovoPet(false)
    setTransporte(SEM_TAXIDOG)
  }

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
    setNovoPet(false)
    setPetNome('')
    setPetRaca('')
    setPetSexo('Macho')
    setPetNasc('')
  }

  async function criar() {
    if (!podeSubmeter || !idLojista) return
    if (!nadaAPagar && !forma) return setErro('Escolha a forma de pagamento.')
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
        forma_pagamento: forma,
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
        p_forma_pagamento: nadaAPagar ? formas[0] : forma,
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

  return (
    <ScreenContainer>
      <DetailHeader title="Novo agendamento" junto />

      <View style={styles.corpo}>
        {erroCarga && <Aviso tipo="erro" texto={erroCarga} />}
        {erro && <Aviso tipo="erro" texto={erro} />}

        {feito ? (
          <>
            <Aviso tipo="sucesso" texto={`Agendamento criado e confirmado com sucesso.${feito.usouPlano && !feito.aviso ? ' O benefício do plano foi usado.' : ''}`} />
            {feito.aviso && <Aviso tipo="erro" texto={feito.aviso} />}
          </>
        ) : (
          <>
            {/* Cliente */}
            <View style={styles.grupo}>
              <Rotulo texto="Cliente" obrigatorio />
              {clientes === null ? (
                <ActivityIndicator color={colors.primary600} />
              ) : clientes.length === 0 ? (
                <Aviso tipo="alerta" texto="Você ainda não tem nenhum cliente cadastrado. Cadastre um em Clientes → Novo Cliente antes de criar o agendamento." />
              ) : clienteFixo && cliente ? (
                <ItemEscolha titulo={cliente.nome} detalhe={cliente.telefone ? formatarTelefone(cliente.telefone) : undefined} selecionado />
              ) : (
                <>
                  <ListaRolavel altura={220}>
                    {filtrados.map(c => {
                      const qtd = petsPorCliente[c.id_cliente] ?? 0
                      return (
                        <ItemEscolha
                          key={c.id_cliente}
                          titulo={c.nome}
                          detalhe={`${c.telefone ? formatarTelefone(c.telefone) : ''}${qtd > 0 ? ` · ${qtd} pet${qtd > 1 ? 's' : ''}` : ''}`}
                          selecionado={clienteId === c.id_cliente}
                          desativado={enviando}
                          onPress={() => escolherCliente(c.id_cliente)}
                        />
                      )
                    })}
                    {filtrados.length === 0 && <Text style={styles.apoio}>Nenhum cliente encontrado para "{busca}".</Text>}
                  </ListaRolavel>
                  {/* No celular o site põe a busca embaixo da lista. */}
                  <View style={styles.busca}>
                    <IconSearch size={16} color={colors.textFaint} />
                    <TextInput
                      value={busca}
                      onChangeText={setBusca}
                      placeholder="Buscar cliente pelo nome..."
                      placeholderTextColor={colors.textFaint}
                      editable={!enviando}
                      accessibilityLabel="Buscar cliente pelo nome"
                      style={styles.buscaCampo}
                    />
                  </View>
                </>
              )}
            </View>

            {/* Pet */}
            {cliente && (
              <View style={styles.grupo}>
                <Rotulo texto="Pet" obrigatorio />
                {petsDoCliente === null ? (
                  <ActivityIndicator color={colors.primary600} />
                ) : (
                  <>
                    {petsDoCliente.length === 0 && !novoPet && <Text style={[styles.apoio, { marginBottom: 8 }]}>Este cliente ainda não tem pet cadastrado.</Text>}
                    {petsDoCliente.length > 0 && (
                      <View style={{ marginBottom: 8 }}>
                        <ListaRolavel altura={140}>
                          {petsDoCliente.map(p => (
                            <ItemEscolha
                              key={p.id_pet}
                              icone={IconDog}
                              titulo={p.nome}
                              detalhe={p.raca ?? undefined}
                              selecionado={petId === p.id_pet}
                              desativado={enviando}
                              onPress={() => setPetId(p.id_pet)}
                            />
                          ))}
                        </ListaRolavel>
                      </View>
                    )}

                    {!novoPet ? (
                      comSite && <BotaoPequeno rotulo="Cadastrar novo pet" icone={IconPlus} variante="fantasma" desativado={enviando} onPress={() => setNovoPet(true)} />
                    ) : (
                      <View style={styles.novoPet}>
                        <View style={styles.novoPetTitulo}>
                          <IconDog size={15} color={colors.textMuted} />
                          <Text style={styles.novoPetTexto}>Novo pet de {cliente.nome.split(' ')[0]}</Text>
                        </View>
                        {petErro && <Aviso tipo="erro" texto={petErro} />}
                        <Campo rotulo="Nome do pet *" value={petNome} onChangeText={setPetNome} placeholder="Rex" editable={!salvandoPet} maxLength={60} />
                        <Campo rotulo="Raça *" value={petRaca} onChangeText={setPetRaca} placeholder="SRD, Poodle..." editable={!salvandoPet} maxLength={60} />
                        <View style={styles.grupo}>
                          <Text style={styles.rotulo}>Sexo <Text style={styles.estrela}>*</Text></Text>
                          <Seletor
                            titulo="Sexo"
                            valor={petSexo}
                            desativado={salvandoPet}
                            opcoes={[{ valor: 'Macho', rotulo: 'Macho' }, { valor: 'Fêmea', rotulo: 'Fêmea' }]}
                            onChange={setPetSexo}
                          />
                        </View>
                        <Campo
                          rotulo="Data de nascimento *"
                          value={petNasc}
                          onChangeText={t => setPetNasc(mascaraData(t))}
                          placeholder="dd/mm/aaaa"
                          keyboardType="number-pad"
                          editable={!salvandoPet}
                          maxLength={10}
                        />
                        <View style={styles.aDireita}>
                          <BotaoPequeno rotulo="Cancelar" variante="fantasma" desativado={salvandoPet} onPress={() => { setNovoPet(false); setPetErro(null) }} />
                          <BotaoPequeno
                            rotulo={salvandoPet ? 'Cadastrando...' : 'Salvar pet'}
                            variante="primario"
                            desativado={salvandoPet || !petNome.trim() || !petRaca.trim() || !petNasc}
                            onPress={criarPet}
                          />
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Serviço */}
            {pet && (
              <View style={styles.grupo}>
                <Rotulo texto="Serviço" obrigatorio />
                {servicos.length === 0 ? (
                  <Text style={styles.apoio}>Nenhum serviço ativo cadastrado. Cadastre um em Serviços antes de agendar.</Text>
                ) : (
                  <ListaRolavel altura={160}>
                    {servicos.map(s => (
                      <ItemEscolha
                        key={s.id_servico}
                        icone={IconScissors}
                        tamanhoDoIcone={16}
                        titulo={s.nome}
                        detalhe={`${s.duracao} min`}
                        selecionado={servicoId === s.id_servico}
                        desativado={enviando}
                        lateral={<Text style={styles.preco}>{formatarMoeda(precoDe(s))}</Text>}
                        onPress={() => { setServicoId(s.id_servico); setHora('') }}
                      />
                    ))}
                  </ListaRolavel>
                )}
              </View>
            )}

            {/* Profissional — opcional; só quem pode atribuir escolhe. */}
            {servico && equipe.length > 0 && acessoTotal && (
              <View style={styles.grupo}>
                <Rotulo texto="Profissional (opcional)" />
                <Seletor
                  titulo="Profissional (opcional)"
                  valor={funcionarioId}
                  desativado={enviando}
                  opcoes={[{ valor: '', rotulo: 'Sem profissional definido' }, ...equipe.map(f => ({ valor: f.id_funcionario, rotulo: f.nome }))]}
                  onChange={setFuncionarioId}
                />
              </View>
            )}

            {/* Data e horário */}
            {servico && (
              <View style={styles.grupo}>
                <Rotulo texto="Data e horário" obrigatorio />
                <SeletorDataHora
                  idLojista={idLojista}
                  data={data}
                  onData={d => { setData(d); setHora('') }}
                  hora={hora}
                  onHora={setHora}
                  slots={slotsDoDia ? slotsDoDia.lista : null}
                  aviso={
                    slotsDoDia?.erro ? 'Não foi possível carregar os horários. Escolha outro dia e volte, ou tente de novo em instantes.'
                      : slotsDoDia && slotsDoDia.lista.length === 0 ? 'Sem horário livre neste dia. Escolha outra data.'
                      : undefined
                  }
                  dataMin={hoje}
                  desativado={enviando}
                />
              </View>
            )}

            {/* Transporte — só com o TaxiDog ativado na loja */}
            {servico && comTransporte && (
              <View style={styles.grupo}>
                <Rotulo texto="Transporte do pet" icone={IconCar} />
                <EtapaTransporte key={clienteId} idLojista={idLojista} valor={transporte} onChange={setTransporte} loja={{ idCliente: clienteId }} />
                {escolhaTaxiDog && (
                  <Text style={styles.total}>
                    Total: <Text style={styles.totalValor}>{formatarMoeda((vaiUsarBeneficio ? 0 : precoDe(servico)) + Number(escolhaTaxiDog.cotacao.valor ?? 0))}</Text>
                    <Text style={styles.apoioCor}> (serviço + TaxiDog)</Text>
                  </Text>
                )}
              </View>
            )}

            {/* Plano do pet (migration 060) */}
            {servico && beneficio && (
              <View style={[styles.plano, !beneficioDisponivel && styles.planoEsgotado]}>
                {beneficioDisponivel ? (
                  <>
                    <Text style={styles.texto}>
                      <Text style={styles.forte}>Este serviço está incluído no plano do cliente</Text> ({beneficio.plano}: {restantes} de {beneficio.quantidade} restante{restantes !== 1 ? 's' : ''} no período).
                    </Text>
                    <Pressable
                      onPress={() => setUsarBeneficio(v => !v)}
                      disabled={enviando}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: usarBeneficio }}
                      style={styles.marcar}
                    >
                      <View style={[styles.caixinha, usarBeneficio && styles.caixinhaMarcada]}>
                        {usarBeneficio && <IconCheck size={11} color={colors.white} />}
                      </View>
                      <Text style={styles.texto}>Usar o benefício do plano (o serviço não é cobrado neste agendamento)</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.texto}>
                    Os usos deste serviço no plano {beneficio.plano} acabaram neste período ({beneficio.usados} de {beneficio.quantidade}) — ele será cobrado como avulso.
                  </Text>
                )}
              </View>
            )}

            {/* Pagamento — obrigatório, menos quando o plano cobre tudo. */}
            {servico && !nadaAPagar && (
              <View style={styles.grupo}>
                <Rotulo texto="Pagamento" />
                <View style={{ gap: 12 }}>
                  <Seletor<FormaPagamento | ''>
                    titulo="Forma de pagamento"
                    valor={forma}
                    desativado={enviando}
                    opcoes={[{ valor: '' as const, rotulo: 'Forma de pagamento...' }, ...formas.map(f => ({ valor: f, rotulo: ROTULO_FORMA_PAGAMENTO[f] }))]}
                    onChange={setForma}
                  />
                  <Seletor
                    titulo="Status do pagamento"
                    valor={pago}
                    desativado={enviando}
                    opcoes={[{ valor: 'pendente', rotulo: 'Pendente' }, { valor: 'pago', rotulo: 'Pago' }]}
                    onChange={setPago}
                  />
                </View>
                <Text style={styles.dica}>Vale para o pedido todo{escolhaTaxiDog ? ' (serviço e TaxiDog)' : ''}. Obrigatório para salvar.</Text>
              </View>
            )}

            {/* Observações */}
            {hora !== '' && (
              <Campo rotulo="Observações (opcional)" value={obs} onChangeText={setObs} placeholder="Ex: pet é nervoso com barulho" maxLength={500} multiline editable={!enviando} />
            )}
          </>
        )}
      </View>

      {!feito && (
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo={enviando ? 'Agendando...' : 'Confirmar agendamento'} desativado={!podeSubmeter} onPress={criar} />
          <BotaoPequeno normal rotulo="Cancelar" desativado={enviando} onPress={() => router.back()} />
        </View>
      )}
    </ScreenContainer>
  )
}

// Rótulo de campo (`.form-label`), com o "*" dos obrigatórios.
function Rotulo({ texto, obrigatorio, icone: Icone }: { texto: string; obrigatorio?: boolean; icone?: ComponentType<IconeProps> }) {
  return (
    <View style={styles.rotuloLinha}>
      {Icone && <Icone size={13} color={colors.textDim} />}
      <Text style={styles.rotulo}>
        {texto}
        {obrigatorio && <Text style={styles.estrela}> *</Text>}
      </Text>
    </View>
  )
}

// Lista de escolha que rola por dentro quando passa da altura (`.picker-list`).
function ListaRolavel({ altura, children }: { altura: number; children: ReactNode }) {
  return (
    <ScrollView style={{ maxHeight: altura }} contentContainerStyle={styles.lista} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  )
}

// Medidas e cores da janela do site em 375 de largura.
const styles = StyleSheet.create({
  corpo: { gap: 12 },
  grupo: { gap: 4 },
  rotuloLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  estrela: { color: colors.dangerFg },
  lista: { gap: 8 },
  // `.dash-search` no celular: 40 de altura, lupa por dentro.
  busca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 11,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buscaCampo: { flex: 1, height: '100%', fontSize: 14, color: colors.text },
  apoio: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  apoioCor: { color: '#858d99' },
  preco: { fontSize: 13.3, lineHeight: 16, fontWeight: '600', color: colors.successFg },
  novoPet: { gap: 12, padding: 16, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong },
  novoPetTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  novoPetTexto: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  aDireita: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  total: { fontSize: 14, lineHeight: 20, color: colors.text },
  totalValor: { fontWeight: '700', color: colors.successFg },
  // `.plano-aviso-agendamento`
  plano: { gap: 8, padding: 12, marginBottom: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.primary500, backgroundColor: colors.surfaceMuted },
  planoEsgotado: { borderColor: colors.borderStrong },
  texto: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  forte: { fontWeight: '700' },
  marcar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caixinha: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.textMuted,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixinhaMarcada: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  dica: { fontSize: 13, lineHeight: 20.8, color: '#858d99' },
  // `.modal-footer` no celular: os dois botões empilhados.
  rodape: { gap: 8, marginTop: spacing.xl },
})
