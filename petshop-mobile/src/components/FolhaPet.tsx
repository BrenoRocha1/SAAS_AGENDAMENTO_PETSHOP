import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { IconDog, IconSearch } from '@/components/IconesDoSite'
import { ItemEscolha } from '@/components/ItemEscolha'
import { PERFIL_PET_VAZIO, PerfilPetCampos, perfilPetParaAction, type PerfilPet } from '@/components/PerfilPetCampos'
import { Seletor } from '@/components/Seletor'
import { Text, TextInput } from '@/components/Texto'
import { TrocarFoto, acoesFotoPet } from '@/components/TrocarFoto'
import { chamarAcao, form } from '@/lib/acoes'
import { hojeBrasilISO } from '@/lib/agenda'
import { formatarTelefone } from '@/lib/format'
import { dataParaISO, isoParaData, mascaraData, numeroParaCampo, paraNumero } from '@/lib/mascaras'
import { supabase } from '@/lib/supabase'
import { colors } from '@/theme/theme'

export interface Tutor {
  id_cliente: string
  nome: string
  telefone: string
}

export interface PetParaEditar {
  id_pet: string
  nome: string
  raca: string
  sexo: string
  especie: string | null
  porte: string | null
  dt_nasc: string
  peso: number | null
  obs: string | null
  id_cliente: string
  foto_url?: string | null
}

interface Props {
  visivel: boolean
  idLojista: string
  // Preenchido = edição; sem pet = cadastro novo.
  pet?: PetParaEditar | null
  // Vindo da ficha do cliente ("Novo pet"): o tutor já sai fixado.
  clienteFixo?: Tutor | null
  onFechar: () => void
  onSalvo: () => void
  // Edição: mostra a troca da foto (pela loja, só o responsável pela conta troca).
  podeTrocarFoto?: boolean
  // A foto mudou (ela sobe na hora, sem esperar o "Salvar").
  onFoto?: (url: string | null) => void
}

type Especie = '' | 'Cão' | 'Gato'
type Porte = '' | 'Pequeno' | 'Médio' | 'Grande'
type Sexo = 'Macho' | 'Fêmea'

const ESPECIES: { valor: Especie; rotulo: string }[] = [
  { valor: '', rotulo: 'Não informado' },
  { valor: 'Cão', rotulo: 'Cão' },
  { valor: 'Gato', rotulo: 'Gato' },
]
const PORTES: { valor: Porte; rotulo: string }[] = [
  { valor: '', rotulo: 'Não informado' },
  { valor: 'Pequeno', rotulo: 'Pequeno' },
  { valor: 'Médio', rotulo: 'Médio' },
  { valor: 'Grande', rotulo: 'Grande' },
]
const SEXOS: { valor: Sexo; rotulo: string }[] = [
  { valor: 'Macho', rotulo: 'Macho' },
  { valor: 'Fêmea', rotulo: 'Fêmea' },
]

// A janela "Novo Pet / Editar …" do site (PetFormModal): o tutor é sempre
// um cliente já cadastrado; espécie e porte casam com as faixas de preço
// dos serviços; "Mais informações" é o perfil opcional (migration 042).
export function FolhaPet({ visivel, idLojista, pet, clienteFixo, onFechar, onSalvo, podeTrocarFoto, onFoto }: Props) {
  const [clientes, setClientes] = useState<Tutor[] | null>(null)
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState('')
  // Com o tutor já escolhido ele aparece "fechado" (o resumo, não a lista).
  const [trocandoTutor, setTrocandoTutor] = useState(true)
  const [nome, setNome] = useState('')
  const [raca, setRaca] = useState('')
  const [especie, setEspecie] = useState<Especie>('')
  const [porte, setPorte] = useState<Porte>('')
  const [sexo, setSexo] = useState<Sexo>('Macho')
  const [nascimento, setNascimento] = useState('')
  const [peso, setPeso] = useState('')
  const [obs, setObs] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  // Perfil opcional. `null` = ainda conferindo se as colunas existem;
  // `false` = a migration não rodou, a seção nem aparece.
  const [perfilDisponivel, setPerfilDisponivel] = useState<boolean | null>(null)
  const [perfil, setPerfil] = useState<PerfilPet>(PERFIL_PET_VAZIO)
  const [perfilAlterado, setPerfilAlterado] = useState(false)
  // Pet já criado numa tentativa em que o perfil falhou — tentar de novo
  // só regrava o perfil, sem cadastrar o pet duas vezes.
  const [petCriadoId, setPetCriadoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const idPet = pet?.id_pet
  const idFixo = clienteFixo?.id_cliente

  // Cada abertura começa do zero (ou dos dados do pet que vai ser editado).
  useEffect(() => {
    if (!visivel) return
    setBusca('')
    setClienteId(pet?.id_cliente ?? idFixo ?? '')
    setTrocandoTutor(!pet && !idFixo)
    setNome(pet?.nome ?? '')
    setRaca(pet?.raca ?? '')
    setEspecie(pet?.especie === 'Cão' || pet?.especie === 'Gato' ? pet.especie : '')
    setPorte(pet?.porte === 'Pequeno' || pet?.porte === 'Médio' || pet?.porte === 'Grande' ? pet.porte : '')
    setSexo(pet?.sexo === 'Fêmea' ? 'Fêmea' : 'Macho')
    setNascimento(isoParaData(pet?.dt_nasc))
    setPeso(pet?.peso ? numeroParaCampo(Number(pet.peso), 1) : '')
    setObs(pet?.obs ?? '')
    setFoto(pet?.foto_url ?? null)
    setPerfil(PERFIL_PET_VAZIO)
    setPerfilAlterado(false)
    setPerfilDisponivel(null)
    setPetCriadoId(null)
    setErro(null)
    // Só ao abrir: o pet e o tutor não mudam com a janela aberta.
  }, [visivel, idPet, idFixo])

  // Clientes da loja (os tutores possíveis) e o perfil do pet.
  useEffect(() => {
    if (!visivel) return
    let cancelado = false
    supabase
      .from('cliente_lojista')
      .select('cliente:id_cliente ( id_cliente, nome, telefone )')
      .eq('id_lojista', idLojista)
      .then(({ data }) => {
        if (cancelado) return
        const lista = ((data ?? []) as unknown as { cliente: Tutor | null }[])
          .flatMap(v => (v.cliente ? [v.cliente] : []))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        setClientes(lista)
      })
    const consulta = supabase.from('pet').select('pelagem, comprimento_pelo, caracteristicas, comportamento, obs_comportamento')
    const pedido = idPet ? consulta.eq('id_pet', idPet).maybeSingle() : consulta.limit(1).maybeSingle()
    pedido.then(({ data, error }) => {
      if (cancelado) return
      if (error) return setPerfilDisponivel(false)
      const p = data as Partial<Record<keyof PerfilPet, unknown>> | null
      if (idPet && p) {
        setPerfil({
          pelagem: (p.pelagem as string | null) ?? '',
          comprimento_pelo: (p.comprimento_pelo as string | null) ?? '',
          caracteristicas: (p.caracteristicas as string | null) ?? '',
          comportamento: (p.comportamento as string[] | null) ?? [],
          obs_comportamento: (p.obs_comportamento as string | null) ?? '',
        })
      }
      setPerfilDisponivel(true)
    })
    return () => { cancelado = true }
  }, [visivel, idLojista, idPet])

  const clienteSel = clientes?.find(c => c.id_cliente === clienteId) ?? (clienteFixo && clienteFixo.id_cliente === clienteId ? clienteFixo : undefined)
  const termo = busca.trim().toLowerCase()
  const filtrados = (clientes ?? []).filter(c => !termo || c.nome.toLowerCase().includes(termo))

  async function salvar() {
    if (!clienteId) return setErro('Selecione o tutor do pet.')
    if (!nome.trim()) return setErro('Informe o nome do pet.')
    if (!raca.trim()) return setErro('Informe a raça (use "SRD" se não tiver).')
    const iso = dataParaISO(nascimento)
    if (!iso) return setErro('Informe a data de nascimento (dia/mês/ano). Pode ser aproximada.')
    if (iso > hojeBrasilISO()) return setErro('A data de nascimento não pode ser futura.')
    const kg = peso.trim() ? paraNumero(peso) : null
    if (kg !== null && (!Number.isFinite(kg) || kg <= 0 || kg >= 200)) return setErro('Peso inválido.')
    setErro(null)
    setSalvando(true)

    const campos = form({
      id_cliente: clienteId,
      nome: nome.trim(),
      raca: raca.trim(),
      sexo,
      especie: especie || null,
      porte: porte || null,
      dt_nasc: iso,
      peso: kg,
      obs: obs.trim() || null,
    })
    let id = idPet ?? petCriadoId
    if (idPet) {
      const r = await chamarAcao('editarPetLojistaAction', idPet, campos)
      if (r.error) { setSalvando(false); return setErro(r.error) }
    } else if (!petCriadoId) {
      const r = await chamarAcao<{ id_pet: string }>('criarPetLojistaAction', campos)
      if (r.error) { setSalvando(false); return setErro(r.error) }
      id = r.id_pet ?? null
      setPetCriadoId(id)
    }

    if (perfilDisponivel && perfilAlterado && id) {
      const r = await chamarAcao('salvarPerfilPetAction', id, perfilPetParaAction(perfil))
      if (r.error) {
        setSalvando(false)
        return setErro(`Pet salvo, mas as informações adicionais não: ${r.error} Tente salvar de novo.`)
      }
    }
    setSalvando(false)
    onSalvo()
  }

  return (
    <Folha visivel={visivel} titulo={pet ? `Editar ${pet.nome}` : 'Novo Pet'} icone={IconDog} onFechar={onFechar} ocupado={salvando}>
      {erro && <Aviso tipo="erro" texto={erro} />}

      {pet && podeTrocarFoto && (
        <View style={styles.foto}>
          <TrocarFoto
            nome={pet.nome}
            fotoUrl={foto}
            {...acoesFotoPet(pet.id_pet)}
            onMudou={url => { setFoto(url); onFoto?.(url) }}
          />
        </View>
      )}

      {/* Tutor — cliente já cadastrado, nunca criado aqui dentro */}
      <View style={styles.grupo}>
        <Text style={styles.rotulo}>Tutor<Text style={styles.estrela}> *</Text></Text>
        {clientes === null && !clienteSel ? (
          <ActivityIndicator color={colors.primary600} />
        ) : clientes !== null && clientes.length === 0 && !clienteSel ? (
          <Aviso tipo="alerta" texto="Você ainda não tem nenhum cliente cadastrado. Cadastre um em Clientes → Novo Cliente antes de cadastrar um pet." />
        ) : !trocandoTutor && clienteSel ? (
          <ItemEscolha
            titulo={clienteSel.nome}
            detalhe={`${formatarTelefone(clienteSel.telefone)}${clienteFixo ? '' : ' · toque para trocar'}`}
            selecionado
            desativado={salvando}
            onPress={clienteFixo ? undefined : () => setTrocandoTutor(true)}
          />
        ) : (
          <>
            <ScrollView style={styles.lista} contentContainerStyle={styles.listaConteudo} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filtrados.map(c => (
                <ItemEscolha
                  key={c.id_cliente}
                  titulo={c.nome}
                  detalhe={formatarTelefone(c.telefone)}
                  selecionado={clienteId === c.id_cliente}
                  desativado={salvando}
                  onPress={() => { setClienteId(c.id_cliente); setBusca(''); setTrocandoTutor(false) }}
                />
              ))}
              {filtrados.length === 0 && <Text style={styles.apoio}>Nenhum tutor encontrado para &quot;{busca}&quot;.</Text>}
            </ScrollView>
            {/* No celular o site põe a busca embaixo da lista. */}
            <View style={styles.busca}>
              <IconSearch size={16} color={colors.textFaint} />
              <TextInput
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar tutor pelo nome..."
                placeholderTextColor={colors.textFaint}
                editable={!salvando}
                accessibilityLabel="Buscar tutor pelo nome"
                style={styles.buscaCampo}
              />
            </View>
          </>
        )}
      </View>

      <View style={styles.separador} />

      <Campo rotulo="Nome do pet" obrigatorio value={nome} onChangeText={setNome} placeholder="Rex" maxLength={80} autoCapitalize="words" editable={!salvando} />
      <Campo rotulo="Raça" obrigatorio value={raca} onChangeText={setRaca} placeholder="SRD, Poodle..." maxLength={80} autoCapitalize="words" editable={!salvando} />

      <View style={styles.grupo}>
        <Text style={styles.rotulo}>Espécie</Text>
        <Seletor titulo="Espécie" valor={especie} opcoes={ESPECIES} desativado={salvando} onChange={setEspecie} />
      </View>
      <View style={styles.grupo}>
        <Text style={styles.rotulo}>Porte</Text>
        <Seletor titulo="Porte" valor={porte} opcoes={PORTES} desativado={salvando} onChange={setPorte} />
      </View>
      <View style={styles.grupo}>
        <Text style={styles.rotulo}>Sexo<Text style={styles.estrela}> *</Text></Text>
        <Seletor titulo="Sexo" valor={sexo} opcoes={SEXOS} desativado={salvando} onChange={setSexo} />
      </View>

      <Campo
        rotulo="Data de nascimento"
        obrigatorio
        value={nascimento}
        onChangeText={t => setNascimento(mascaraData(t))}
        keyboardType="number-pad"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        editable={!salvando}
      />
      <Campo rotulo="Peso (kg)" value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="Opcional" maxLength={6} editable={!salvando} style={styles.peso} />
      <Campo rotulo="Observações" value={obs} onChangeText={setObs} placeholder="Alergias, temperamento, cuidados especiais..." maxLength={500} multiline editable={!salvando} />

      {/* Só aparece com o perfil já carregado — assim o bloco nasce aberto
          quando o pet tem algo preenchido. */}
      {perfilDisponivel && (
        <PerfilPetCampos
          valor={perfil}
          onChange={p => { setPerfil(p); setPerfilAlterado(true) }}
          desativado={salvando}
        />
      )}

      <View style={styles.rodape}>
        <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : pet ? 'Salvar Alterações' : 'Cadastrar Pet'} desativado={salvando} onPress={salvar} />
        <BotaoPequeno normal variante="fantasma" rotulo="Cancelar" desativado={salvando} onPress={onFechar} />
      </View>
    </Folha>
  )
}

// Medidas da janela do site em 375 de largura.
const styles = StyleSheet.create({
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  estrela: { color: colors.dangerFg },
  foto: { marginBottom: 4 },
  // `.picker-list` com no máximo 160: a lista rola por dentro.
  lista: { maxHeight: 160 },
  listaConteudo: { gap: 8 },
  // `.dash-search` no celular: 40 de altura, lupa por dentro.
  busca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    marginBottom: 8,
    paddingHorizontal: 11,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buscaCampo: { flex: 1, height: '100%', fontSize: 14, color: colors.text },
  apoio: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  // `.separator`: um fio com 24 de cada lado (mais os 12 entre os blocos).
  separador: { height: 1, marginVertical: 24, backgroundColor: colors.border },
  peso: { maxWidth: 160 },
  // A Folha deixa 24 no fim; janela com botões no pé (`.modal-footer`) deixa 16.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
