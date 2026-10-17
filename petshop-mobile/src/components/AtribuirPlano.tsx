import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { IconeApp } from '@/components/IconeApp'
import { Ilustracao } from '@/components/Ilustracao'
import { Opcao } from '@/components/Opcao'
import { Text } from '@/components/Texto'
import { dataBR } from '@/lib/agenda'
import { assinarPlano, buscarClientesParaPlano, petsDoClienteParaPlano, previaAssinatura, type ClienteParaPlano, type PetParaPlano } from '@/lib/atribuir-plano'
import { formatarMoeda, formatarTelefone } from '@/lib/format'
import { dataParaISO, isoParaData, mascaraData } from '@/lib/mascaras'
import { ROTULO_FORMA_PAGAMENTO, type FormaPagamento } from '@/lib/pagamento'
import { sufixoPeriodo, type Plano } from '@/lib/planos'
import { colors, spacing } from '@/theme/theme'

type Etapa = 'cliente' | 'pet' | 'revisao' | 'feito'
const ETAPAS: { id: Etapa; rotulo: string }[] = [
  { id: 'cliente', rotulo: 'Cliente' },
  { id: 'pet', rotulo: 'Pet' },
  { id: 'revisao', rotulo: 'Revisão' },
]

// Atribuir um plano direto da tela de Planos — o mesmo do site
// (AtribuirPlanoModal): cliente → pet → revisão. Quem cria a assinatura é
// fn_assinar_plano, a mesma da ficha do pet.
export function AtribuirPlano({ plano, idLojista, hojeISO, formas, onFechar, onConcluido }: {
  plano: Plano | null
  idLojista: string
  hojeISO: string
  formas: FormaPagamento[]
  onFechar: () => void
  onConcluido: () => void
}) {
  const router = useRouter()
  const [etapa, setEtapa] = useState<Etapa>('cliente')
  const [cliente, setCliente] = useState<ClienteParaPlano | null>(null)
  const [pet, setPet] = useState<PetParaPlano | null>(null)
  const [inicio, setInicio] = useState(isoParaData(hojeISO))
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const enviando = useRef(false)

  if (!plano) return <Folha visivel={false} titulo="Atribuir plano" onFechar={onFechar}><View /></Folha>

  const inicioISO = dataParaISO(inicio)
  const previa = inicioISO ? previaAssinatura(inicioISO, plano.periodicidade, plano.intervalo_dias, hojeISO) : null
  const indice = ETAPAS.findIndex(e => e.id === etapa)

  async function confirmar() {
    if (!plano || !pet || enviando.current) return
    if (!inicioISO) return setErro('Informe a data de início (dia/mês/ano).')
    enviando.current = true
    setSalvando(true)
    setErro(null)
    const r = await assinarPlano(plano.id_plano, pet.id_pet, inicioISO, forma || null)
    enviando.current = false
    setSalvando(false)
    if (r.erro) return setErro(r.erro)
    setEtapa('feito')
    onConcluido()
  }

  return (
    <Folha visivel titulo="Atribuir plano" onFechar={onFechar} ocupado={salvando}>
      <Text style={styles.plano}>{plano.nome} · {formatarMoeda(plano.valor)}{sufixoPeriodo(plano.periodicidade, plano.intervalo_dias)}</Text>

      {etapa !== 'feito' && (
        <View style={styles.passos}>
          {ETAPAS.map((e, i) => (
            <View key={e.id} style={[styles.passo, i === indice && styles.passoAtual, i < indice && styles.passoFeito]}>
              <View style={[styles.passoNum, i === indice && styles.passoNumAtual, i < indice && styles.passoNumFeito]}>
                {i < indice
                  ? <IconeApp name="checkmark" size={12} color={colors.primary600} />
                  : <Text style={[styles.passoNumTexto, i === indice && { color: colors.white }]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.passoRotulo, i === indice && styles.passoRotuloAtual]}>{e.rotulo}</Text>
            </View>
          ))}
        </View>
      )}

      {erro && <Aviso tipo="erro" texto={erro} />}

      {etapa === 'cliente' && (
        <EtapaCliente
          idLojista={idLojista}
          selecionado={cliente}
          onEscolher={c => {
            if (c.id_cliente !== cliente?.id_cliente) setPet(null)
            setCliente(c)
            setErro(null)
            setEtapa('pet')
          }}
        />
      )}

      {etapa === 'pet' && cliente && (
        <EtapaPet
          key={cliente.id_cliente}
          idLojista={idLojista}
          cliente={cliente}
          idPlano={plano.id_plano}
          selecionado={pet}
          onTrocarCliente={() => setEtapa('cliente')}
          onCadastrarPet={() => { onFechar(); router.push(`/clientes/${cliente.id_cliente}`) }}
          onEscolher={p => { setPet(p); setErro(null); setEtapa('revisao') }}
        />
      )}

      {etapa === 'revisao' && cliente && pet && (
        <>
          <View style={styles.resumo}>
            <LinhaResumo rotulo="Cliente" valor={cliente.nome} onAlterar={() => setEtapa('cliente')} />
            <LinhaResumo rotulo="Pet" valor={pet.nome} onAlterar={() => setEtapa('pet')} />
            <LinhaResumo rotulo="Plano" valor={plano.nome} />
            <LinhaResumo rotulo="Valor" valor={`${formatarMoeda(plano.valor)}${sufixoPeriodo(plano.periodicidade, plano.intervalo_dias)}`} />
            <View style={styles.resumoLinha}>
              <Text style={styles.resumoRotulo}>Inclui</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.chips}>
                  {plano.servicos.map(s => (
                    <View key={s.id_servico} style={styles.chip}>
                      <Text style={styles.chipTexto}><Text style={styles.chipQtd}>{s.quantidade}×</Text> {s.servico}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.sub}>por período</Text>
              </View>
            </View>
          </View>

          <Campo rotulo="Início" obrigatorio value={inicio} onChangeText={t => setInicio(mascaraData(t))} keyboardType="number-pad" placeholder="dd/mm/aaaa" maxLength={10} />

          <Text style={styles.rotulo}>Forma de pagamento</Text>
          <View style={{ gap: spacing.sm }}>
            <Opcao titulo="Definir na cobrança" selecionada={forma === ''} onPress={() => setForma('')} />
            {formas.map(f => <Opcao key={f} titulo={ROTULO_FORMA_PAGAMENTO[f]} selecionada={forma === f} onPress={() => setForma(f)} />)}
          </View>

          {previa && (
            <View style={styles.previa}>
              <View style={styles.previaLinha}><Text style={styles.sub}>1º período</Text><Text style={styles.previaValor}>{dataBR(previa.primeiro.inicio)} a {dataBR(previa.primeiro.fim)}</Text></View>
              <View style={styles.previaLinha}><Text style={styles.sub}>Próxima renovação</Text><Text style={styles.previaValor}>{dataBR(previa.proximaCobranca)}</Text></View>
              <Text style={styles.previaTexto}>
                {previa.cobrancasCriadas > 1
                  ? `Como o início é antes de hoje, já entram ${previa.cobrancasCriadas} cobranças de ${formatarMoeda(plano.valor)}, uma por período desde ${dataBR(previa.primeiro.inicio)}.`
                  : `A 1ª cobrança, de ${formatarMoeda(plano.valor)}, vence em ${dataBR(previa.primeiro.inicio)}.`}
                {' '}Todas ficam pendentes até você registrar o pagamento. Depois, uma cobrança nova no início de cada período.
              </Text>
            </View>
          )}

          <Botao rotulo={salvando ? 'Atribuindo…' : 'Confirmar e atribuir'} onPress={confirmar} carregando={salvando} desativado={!inicioISO} />
          <Botao rotulo="Voltar" variante="secundario" onPress={() => setEtapa('pet')} desativado={salvando} />
        </>
      )}

      {etapa === 'feito' && cliente && pet && (
        <>
          <View style={styles.feito}>
            <Ilustracao nome="tudo-em-dia" altura={110} />
            <Text style={styles.feitoTitulo}>Plano atribuído</Text>
            <Text style={[styles.sub, { textAlign: 'center' }]}>
              {pet.nome} ({cliente.nome}) agora tem o plano {plano.nome}, a partir de {inicio}. A cobrança fica pendente até você registrar o pagamento em Cobranças.
            </Text>
          </View>
          <Botao rotulo="Atribuir a outro pet" onPress={() => { setPet(null); setErro(null); setEtapa('pet') }} />
          <Botao rotulo="Fechar" variante="secundario" onPress={onFechar} />
        </>
      )}
    </Folha>
  )
}

function LinhaResumo({ rotulo, valor, onAlterar }: { rotulo: string; valor: string; onAlterar?: () => void }) {
  return (
    <View style={styles.resumoLinha}>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
      <Text style={styles.resumoValor}>{valor}</Text>
      {onAlterar && (
        <Pressable onPress={onAlterar} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Alterar ${rotulo}`}>
          <Text style={styles.alterar}>Alterar</Text>
        </Pressable>
      )}
    </View>
  )
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

function EtapaCliente({ idLojista, selecionado, onEscolher }: { idLojista: string; selecionado: ClienteParaPlano | null; onEscolher: (c: ClienteParaPlano) => void }) {
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<ClienteParaPlano[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let atual = true
    const t = setTimeout(async () => {
      const r = await buscarClientesParaPlano(idLojista, busca)
      if (!atual) return
      setErro(r.erro ?? null)
      setClientes(r.clientes ?? null)
      setCarregando(false)
    }, busca ? 300 : 0)
    return () => { atual = false; clearTimeout(t) }
  }, [idLojista, busca, tentativa])

  return (
    <>
      <Campo rotulo="Buscar cliente" value={busca} onChangeText={t => { setBusca(t); setCarregando(true) }} placeholder="Nome ou telefone do cliente" autoFocus />
      {erro ? (
        <View style={styles.estado}>
          <Text style={styles.estadoTexto}>{erro}</Text>
          <Botao rotulo="Tentar de novo" variante="secundario" compacto onPress={() => { setCarregando(true); setTentativa(n => n + 1) }} />
        </View>
      ) : carregando && !clientes ? (
        <View style={styles.estado}><ActivityIndicator color={colors.primary600} /><Text style={styles.estadoTexto}>Buscando clientes…</Text></View>
      ) : clientes && clientes.length === 0 ? (
        <View style={styles.estado}>
          <Text style={styles.estadoTexto}>{busca ? `Nenhum cliente encontrado para “${busca}”.` : 'A loja ainda não tem clientes.'}</Text>
        </View>
      ) : (
        <View style={[styles.opcoes, carregando && { opacity: 0.55 }]}>
          {(clientes ?? []).map(c => (
            <Pressable key={c.id_cliente} onPress={() => onEscolher(c)} accessibilityRole="button" style={[styles.opcao, selecionado?.id_cliente === c.id_cliente && styles.opcaoEscolhida]}>
              <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciais(c.nome)}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.opcaoTitulo} numberOfLines={1}>{c.nome}</Text>
                {c.telefone ? <Text style={styles.sub}>{formatarTelefone(c.telefone)}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </>
  )
}

function EtapaPet({ idLojista, cliente, idPlano, selecionado, onTrocarCliente, onCadastrarPet, onEscolher }: {
  idLojista: string
  cliente: ClienteParaPlano
  idPlano: string
  selecionado: PetParaPlano | null
  onTrocarCliente: () => void
  onCadastrarPet: () => void
  onEscolher: (p: PetParaPlano) => void
}) {
  const [pets, setPets] = useState<PetParaPlano[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  function recarregar() {
    setPets(null)
    setErro(null)
    setTentativa(n => n + 1)
  }

  useEffect(() => {
    let atual = true
    petsDoClienteParaPlano(idLojista, cliente.id_cliente).then(r => {
      if (!atual) return
      setErro(r.erro ?? null)
      setPets(r.pets ?? [])
    })
    return () => { atual = false }
  }, [idLojista, cliente.id_cliente, tentativa])

  return (
    <>
      <View style={styles.escolhido}>
        <View style={styles.avatar}><Text style={styles.avatarTexto}>{iniciais(cliente.nome)}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.opcaoTitulo} numberOfLines={1}>{cliente.nome}</Text>
          {cliente.telefone ? <Text style={styles.sub}>{formatarTelefone(cliente.telefone)}</Text> : null}
        </View>
        <Pressable onPress={onTrocarCliente} hitSlop={8} accessibilityRole="button"><Text style={styles.alterar}>Trocar</Text></Pressable>
      </View>

      {erro ? (
        <View style={styles.estado}>
          <Text style={styles.estadoTexto}>{erro}</Text>
          <Botao rotulo="Tentar de novo" variante="secundario" compacto onPress={recarregar} />
        </View>
      ) : pets === null ? (
        <View style={styles.estado}><ActivityIndicator color={colors.primary600} /><Text style={styles.estadoTexto}>Carregando os pets…</Text></View>
      ) : pets.length === 0 ? (
        <View style={styles.estado}>
          <Text style={styles.estadoTexto}>{cliente.nome} ainda não tem pet cadastrado. O plano é sempre de um pet: cadastre o pet na ficha do cliente e volte aqui.</Text>
          <Botao rotulo="Cadastrar pet" variante="secundario" compacto onPress={onCadastrarPet} />
          <Botao rotulo="Atualizar" variante="secundario" compacto onPress={recarregar} />
        </View>
      ) : (
        <View style={styles.opcoes}>
          {pets.map(p => {
            const jaTem = p.planos_ativos.includes(idPlano)
            return (
              <Pressable
                key={p.id_pet}
                onPress={() => onEscolher(p)}
                disabled={jaTem}
                accessibilityRole="button"
                accessibilityState={{ disabled: jaTem }}
                style={[styles.opcao, selecionado?.id_pet === p.id_pet && styles.opcaoEscolhida, jaTem && { opacity: 0.6 }]}
              >
                {p.foto_url
                  ? <Image source={{ uri: p.foto_url }} style={styles.avatar} />
                  : <View style={styles.avatar}><IconeApp name="paw" size={16} color={colors.primary600} /></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.opcaoTitulo} numberOfLines={1}>{p.nome}</Text>
                  <Text style={styles.sub}>{jaTem ? 'Já tem este plano ativo' : [p.especie, p.raca].filter(Boolean).join(' · ') || 'Pet'}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </>
  )
}

// Medidas de `planos-tela.css` (.pl-*) do site em 375 de largura.
const styles = StyleSheet.create({
  plano: { marginTop: -8, fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.primary600 },
  passos: { flexDirection: 'row', gap: 8 },
  passo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8, borderBottomWidth: 3, borderBottomColor: colors.border },
  passoAtual: { borderBottomColor: colors.primary600 },
  passoFeito: { borderBottomColor: '#a5b4fc' },
  passoNum: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  passoNumAtual: { backgroundColor: colors.primary600 },
  passoNumFeito: { backgroundColor: colors.primary50 },
  passoNumTexto: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#858d99' },
  passoRotulo: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#858d99' },
  passoRotuloAtual: { color: colors.text },
  opcoes: { gap: 6 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  opcaoEscolhida: { borderColor: colors.primary600, backgroundColor: colors.primary50 },
  opcaoTitulo: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary50 },
  avatarTexto: { fontSize: 13, fontWeight: '800', color: colors.primary600 },
  escolhido: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  estado: { alignItems: 'center', gap: spacing.sm, paddingVertical: 24, paddingHorizontal: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 12 },
  estadoTexto: { fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.textMuted },
  sub: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  rotulo: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textDim },
  resumo: {},
  resumoLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  resumoRotulo: { width: 80, fontSize: 13, lineHeight: 20, color: '#858d99' },
  resumoValor: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  alterar: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: colors.primary600 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primary50 },
  chipTexto: { fontSize: 13, lineHeight: 18, color: colors.text },
  chipQtd: { fontWeight: '800', color: colors.primary600 },
  previa: { gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e0e7ff', backgroundColor: '#f5f6ff' },
  previaLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  previaValor: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text },
  previaTexto: { fontSize: 13, lineHeight: 19, color: colors.textDim },
  feito: { alignItems: 'center', gap: 8 },
  feitoTitulo: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.text },
})
