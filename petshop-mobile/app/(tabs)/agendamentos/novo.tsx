import { useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { Botao } from '@/components/Botao'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { SearchField } from '@/components/SearchField'
import { SemPermissao } from '@/components/SemPermissao'
import { SeletorDia } from '@/components/SeletorDia'
import { GradeHorarios } from '@/components/GradeHorarios'
import { Opcao, Segmentos } from '@/components/Opcao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { dataBR, dataExtensaISO, hojeBrasilISO, removerHorariosPassados } from '@/lib/agenda'
import type { Slot } from '@/lib/agendamentos'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda, formatarTelefone } from '@/lib/format'
import { ROTULO_FORMA_PAGAMENTO, formasAtivas, normalizarFormasLoja, type FormaPagamento } from '@/lib/pagamento'
import { colors, spacing, typography } from '@/theme/theme'

interface ClienteOpcao { id_cliente: string; nome: string; telefone: string | null }
interface PetOpcao { id_pet: string; nome: string; raca: string | null }
interface ServicoOpcao { id_servico: string; nome: string; preco: number; duracao: number }
// fn_beneficios_do_pet (migration 060)
interface PlanoDoPet { plano: string; beneficios: { id_servico: string; quantidade: number; usados: number }[] }

const MAX_CLIENTES = 8

// Agendamento feito pela loja (balcão, telefone) pra um cliente que já
// está na base — mesma função do painel web
// (fn_criar_agendamento_lojista_com_pagamento): nasce Aceito. TaxiDog e
// produtos no pedido continuam só no painel web.
export default function NovoAgendamentoScreen() {
  const params = useLocalSearchParams<{ data?: string; cliente?: string }>()
  const router = useRouter()
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const hoje = hojeBrasilISO()

  const [clientes, setClientes] = useState<ClienteOpcao[] | null>(null)
  const [servicos, setServicos] = useState<ServicoOpcao[]>([])
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState(params.cliente ?? '')
  const [pets, setPets] = useState<{ idCliente: string; lista: PetOpcao[] } | null>(null)
  const [petId, setPetId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [precos, setPrecos] = useState<{ petId: string; valores: Record<string, number> } | null>(null)
  const [data, setData] = useState(params.data && params.data >= hoje ? params.data : hoje)
  const [hora, setHora] = useState('')
  const [slots, setSlots] = useState<{ chave: string; lista: Slot[] } | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [pago, setPago] = useState<'pendente' | 'pago'>('pendente')
  const [planos, setPlanos] = useState<{ chave: string; lista: PlanoDoPet[] } | null>(null)
  const [usarBeneficio, setUsarBeneficio] = useState(true)
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState<{ id: string; aviso?: string } | null>(null)

  // Clientes da loja, serviços ativos e formas de pagamento aceitas.
  useEffect(() => {
    if (!idLojista) return
    let cancelado = false
    Promise.all([
      supabase.from('cliente_lojista').select('cliente:id_cliente ( id_cliente, nome, telefone )').eq('id_lojista', idLojista),
      supabase.from('servico').select('id_servico, nome, preco, duracao').eq('id_lojista', idLojista).eq('status', 'Ativo').order('nome'),
      supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }),
    ]).then(([vinculos, servs, formasLoja]) => {
      if (cancelado) return
      if (vinculos.error) setErroCarga('Não foi possível carregar os clientes da loja.')
      const lista = ((vinculos.data ?? []) as unknown as { cliente: ClienteOpcao | null }[])
        .flatMap(v => (v.cliente ? [v.cliente] : []))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      setClientes(lista)
      setServicos(((servs.data ?? []) as ServicoOpcao[]).map(s => ({ ...s, preco: Number(s.preco) })))
      const ativas = formasAtivas(normalizarFormasLoja(formasLoja.data))
      setFormas(ativas)
      if (ativas.length === 1) setForma(ativas[0])
    })
    return () => { cancelado = true }
  }, [idLojista])

  // Pets do cliente escolhido.
  useEffect(() => {
    if (!clienteId) return
    let cancelado = false
    supabase.from('pet').select('id_pet, nome, raca').eq('id_cliente', clienteId).eq('ativo', true).order('nome').then(({ data: rows }) => {
      if (cancelado) return
      const lista = (rows ?? []) as PetOpcao[]
      setPets({ idCliente: clienteId, lista })
      setPetId(atual => (lista.some(p => p.id_pet === atual) ? atual : lista.length === 1 ? lista[0].id_pet : ''))
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
    supabase.rpc('fn_horarios_disponiveis', { p_id_lojista: idLojista, p_data: data, p_duracao: duracao }).then(({ data: rows }) => {
      if (cancelado) return
      const lista = removerHorariosPassados((rows ?? []) as Slot[], data)
      setSlots({ chave, lista })
      // O horário escolhido deixou de estar livre: desmarca.
      setHora(h => (lista.some(s => s.disponivel && s.hr_slot.slice(0, 5) === h) ? h : ''))
    })
    return () => { cancelado = true }
  }, [idLojista, data, servicoId, duracao, recarga])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    const lista = clientes ?? []
    if (!termo) return lista.slice(0, MAX_CLIENTES)
    return lista
      .filter(c => c.nome.toLowerCase().includes(termo) || (digitos.length >= 3 && (c.telefone ?? '').includes(digitos)))
      .slice(0, MAX_CLIENTES)
  }, [clientes, busca])

  if (!contexto?.podeGerenciarAgenda || !idLojista) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Novo agendamento" />
        <SemPermissao area="criar agendamentos" />
      </ScreenContainer>
    )
  }

  const cliente = clientes?.find(c => c.id_cliente === clienteId) ?? null
  const petsDoCliente = pets?.idCliente === clienteId ? pets.lista : null
  const pet = petsDoCliente?.find(p => p.id_pet === petId) ?? null
  const precoDe = (s: ServicoOpcao) => (precos?.petId === petId && precos.valores[s.id_servico] != null ? precos.valores[s.id_servico] : s.preco)
  const carregandoSlots = !!servico && slots?.chave !== chaveSlots
  // O benefício deste serviço com mais saldo (se o pet tiver mais de um plano).
  const beneficio = planos?.chave === `${petId}|${data}` && servicoId
    ? planos.lista
        .flatMap(p => p.beneficios.filter(b => b.id_servico === servicoId).map(b => ({ plano: p.plano, quantidade: b.quantidade, usados: Number(b.usados) })))
        .sort((a, b) => (b.quantidade - b.usados) - (a.quantidade - a.usados))[0] ?? null
    : null
  const vaiUsarBeneficio = !!beneficio && beneficio.quantidade > beneficio.usados && usarBeneficio
  const pronto = !!(clienteId && petId && servicoId && data && hora && forma)

  function trocarCliente(id: string) {
    setClienteId(id)
    setPetId('')
    setBusca('')
  }

  async function criar() {
    if (!pronto || !idLojista) return
    setErro(null)
    setEnviando(true)
    const { data: idNovo, error } = await supabase.rpc('fn_criar_agendamento_lojista_com_pagamento', {
      p_forma_pagamento: forma,
      p_status_pagamento: pago,
      p_id_lojista: idLojista,
      p_id_cliente: clienteId,
      p_id_pet: petId,
      p_id_servico: servicoId,
      p_data: data,
      p_hora: hora,
      p_obs: obs.trim() || null,
    })
    if (error || typeof idNovo !== 'string') {
      setEnviando(false)
      setErro(mensagemDoBanco(error, 'Erro ao criar o agendamento. Tente de novo.'))
      setRecarga(n => n + 1)
      return
    }
    // Benefício do plano: se não der (limite, plano sem o serviço…), o
    // agendamento continua criado como avulso e a tela avisa.
    let aviso: string | undefined
    if (vaiUsarBeneficio) {
      const { error: erroBeneficio } = await supabase.rpc('fn_usar_beneficio', { p_id_agendamento: idNovo })
      if (erroBeneficio) aviso = `Agendamento criado, mas o benefício do plano não foi usado: ${mensagemDoBanco(erroBeneficio, 'tente pelo painel web.')}`
    }
    setEnviando(false)
    setFeito({ id: idNovo, aviso })
  }

  if (feito) {
    return (
      <ScreenContainer>
        <DetailHeader title="Novo agendamento" />
        <View style={{ gap: spacing.md }}>
          <Aviso tipo="sucesso" texto={`Agendamento criado: ${pet?.nome ?? 'pet'} — ${servico?.nome ?? 'serviço'}, ${dataBR(data)} às ${hora}.`} />
          {feito.aviso && <Aviso tipo="alerta" texto={feito.aviso} />}
          <Botao rotulo="Ver agendamento" variante="secundario" onPress={() => router.replace(`/agendamentos/${feito.id}`)} />
          <Botao rotulo="Concluir" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Novo agendamento" />
      {erroCarga && <Aviso tipo="erro" texto={erroCarga} />}

      {/* 1. Cliente */}
      <Text style={styles.secaoPrimeira}>Cliente</Text>
      {clientes === null ? (
        <ActivityIndicator color={colors.primary600} />
      ) : cliente ? (
        <Card style={styles.escolhido}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.escolhidoNome}>{cliente.nome}</Text>
            {cliente.telefone ? <Text style={styles.ajuda}>{formatarTelefone(cliente.telefone)}</Text> : null}
          </View>
          <Botao rotulo="Trocar" variante="secundario" compacto onPress={() => trocarCliente('')} />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar por nome ou telefone..." />
          {filtrados.map(c => (
            <Opcao
              key={c.id_cliente}
              titulo={c.nome}
              detalhe={c.telefone ? formatarTelefone(c.telefone) : undefined}
              selecionada={false}
              onPress={() => trocarCliente(c.id_cliente)}
            />
          ))}
          {filtrados.length === 0 && (
            <Text style={styles.ajuda}>
              {clientes.length === 0 ? 'A loja ainda não tem clientes — cadastre pelo painel web.' : 'Nenhum cliente com esse nome ou telefone.'}
            </Text>
          )}
          {!busca.trim() && clientes.length > MAX_CLIENTES && (
            <Text style={styles.ajuda}>Mostrando os primeiros — use a busca para achar os outros.</Text>
          )}
        </View>
      )}

      {/* 2. Pet */}
      {cliente && (
        <>
          <Text style={styles.secao}>Pet</Text>
          {petsDoCliente === null ? (
            <ActivityIndicator color={colors.primary600} />
          ) : petsDoCliente.length === 0 ? (
            <Aviso tipo="alerta" texto="Este cliente ainda não tem pet cadastrado — cadastre o pet pelo painel web." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {petsDoCliente.map(p => (
                <Opcao key={p.id_pet} titulo={p.nome} detalhe={p.raca ?? undefined} selecionada={petId === p.id_pet} onPress={() => setPetId(p.id_pet)} />
              ))}
            </View>
          )}
        </>
      )}

      {/* 3. Serviço */}
      {pet && (
        <>
          <Text style={styles.secao}>Serviço</Text>
          {servicos.length === 0 ? (
            <Aviso tipo="alerta" texto="A loja não tem serviço ativo — cadastre pelo painel web." />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {servicos.map(s => (
                <Opcao
                  key={s.id_servico}
                  titulo={s.nome}
                  detalhe={`${s.duracao} min`}
                  lateral={formatarMoeda(precoDe(s))}
                  selecionada={servicoId === s.id_servico}
                  onPress={() => { setServicoId(s.id_servico); setHora('') }}
                />
              ))}
            </View>
          )}
        </>
      )}

      {/* 4. Data e horário */}
      {servico && (
        <>
          <Text style={styles.secao}>Data</Text>
          <SeletorDia inicio={hoje} dias={90} valor={data} onChange={d => { setData(d); setHora('') }} />
          <Text style={[styles.ajuda, { marginTop: spacing.sm }]}>{dataExtensaISO(data)}</Text>

          <Text style={styles.secao}>Horário</Text>
          <GradeHorarios
            slots={slots?.lista ?? []}
            carregando={carregandoSlots}
            valor={hora}
            onChange={setHora}
            vazio="Nenhum horário neste dia — a loja não abre ou está fechada. Escolha outra data."
          />
        </>
      )}

      {/* 5. Pagamento e observação */}
      {servico && hora !== '' && (
        <>
          <Text style={styles.secao}>Pagamento</Text>
          <View style={{ gap: spacing.sm }}>
            {formas.map(f => (
              <Opcao key={f} titulo={ROTULO_FORMA_PAGAMENTO[f]} selecionada={forma === f} onPress={() => setForma(f)} />
            ))}
          </View>
          <View style={{ marginTop: spacing.md }}>
            <Segmentos
              valor={pago}
              onChange={setPago}
              opcoes={[{ valor: 'pendente', rotulo: 'Ainda não pagou' }, { valor: 'pago', rotulo: 'Já pagou' }]}
            />
          </View>

          {beneficio && beneficio.quantidade > beneficio.usados && (
            <Card style={[styles.escolhido, { marginTop: spacing.lg }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.escolhidoNome}>Usar o plano {beneficio.plano}</Text>
                <Text style={styles.ajuda}>
                  {beneficio.quantidade - beneficio.usados} de {beneficio.quantidade} usos disponíveis — o serviço sai sem cobrança.
                </Text>
              </View>
              <Switch
                value={usarBeneficio}
                onValueChange={setUsarBeneficio}
                trackColor={{ true: colors.primary500, false: colors.borderStrong }}
                thumbColor={colors.white}
              />
            </Card>
          )}

          <View style={{ marginTop: spacing.lg }}>
            <Campo rotulo="Observação (opcional)" value={obs} onChangeText={setObs} placeholder="Ex.: pet com medo de secador" maxLength={500} multiline />
          </View>
        </>
      )}

      <View style={styles.rodape}>
        {pronto && servico && (
          <Card style={{ gap: 4 }}>
            <Text style={styles.escolhidoNome}>{pet?.nome} — {servico.nome}</Text>
            <Text style={styles.ajuda}>{dataExtensaISO(data)}, às {hora}</Text>
            <Text style={styles.total}>{vaiUsarBeneficio ? 'Coberto pelo plano' : formatarMoeda(precoDe(servico))}</Text>
          </Card>
        )}
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Botao rotulo="Criar agendamento" icone="checkmark" onPress={criar} carregando={enviando} desativado={!pronto} />
      </View>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  secaoPrimeira: { ...typography.heading.sm, color: colors.text, marginBottom: spacing.md },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md },
  ajuda: { ...typography.body.md, color: colors.textMuted },
  escolhido: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  escolhidoNome: { ...typography.body.lg, fontWeight: '600', color: colors.text },
  total: { ...typography.heading.md, color: colors.text, marginTop: 4 },
  rodape: { marginTop: spacing.xl, gap: spacing.md },
})
