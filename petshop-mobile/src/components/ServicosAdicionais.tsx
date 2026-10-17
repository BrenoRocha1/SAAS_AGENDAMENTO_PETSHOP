import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { LinhaServico, ListaBranca, TopoSecao } from '@/components/ListaServicos'
import { Folha } from '@/components/Folha'
import { FolhaConfirmar } from '@/components/FolhaConfirmar'
import { IconCalendar, IconPlus, IconScissors, IconTrash, type IconeProps } from '@/components/IconesDoSite'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { chamarAcao } from '@/lib/acoes'
import { carregarAdicionaisDaLoja, type ServicoAdicional } from '@/lib/adicionais'
import { formatarMoeda } from '@/lib/format'
import { numeroParaCampo, paraNumero } from '@/lib/mascaras'
import { colors, spacing } from '@/theme/theme'

interface Props {
  idLojista: string
  // Serviços principais da loja, para dizer a quais o adicional se aplica.
  servicos: { id_servico: string; nome: string }[]
  // Excluir é do responsável pela loja ou de um administrador.
  podeExcluir: boolean
}

// "Serviços adicionais" da tela de Serviços — a mesma seção do site
// (ServicosAdicionais): as cobranças extras que a loja cadastra, com
// cadastro próprio, abaixo dos serviços principais. Gravar passa pelas
// actions do site (salvarServicoAdicionalAction…). Sem a migration 095,
// não aparece.
export function ServicosAdicionais({ idLojista, servicos, podeExcluir }: Props) {
  const [adicionais, setAdicionais] = useState<ServicoAdicional[] | null>(null)
  const [alterando, setAlterando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [painel, setPainel] = useState(false)
  const [editando, setEditando] = useState<ServicoAdicional | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState('')
  const [paraTodos, setParaTodos] = useState(true)
  const [marcados, setMarcados] = useState<string[]>([])
  const [online, setOnline] = useState(true)
  const [atendimento, setAtendimento] = useState(true)
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState<ServicoAdicional | null>(null)

  const carregar = useCallback(async () => {
    setAdicionais(await carregarAdicionaisDaLoja(idLojista))
  }, [idLojista])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (adicionais === null) return null

  const nomeDoServico = new Map(servicos.map(s => [s.id_servico, s.nome]))
  function valePara(a: ServicoAdicional): string {
    if (a.servicos.length === 0) return 'Todos os serviços'
    const nomes = a.servicos.map(id => nomeDoServico.get(id)).filter(Boolean) as string[]
    return nomes.length > 0 ? nomes.join(', ') : 'Serviços que não existem mais'
  }

  // Onde o adicional aparece, em texto curto (o mesmo do site).
  const onde = (a: ServicoAdicional) =>
    a.disponivel_online && a.disponivel_atendimento ? 'online e no atendimento'
      : a.disponivel_online ? 'só online'
      : a.disponivel_atendimento ? 'só no atendimento'
      : 'escondido'

  function abrir(a: ServicoAdicional | null) {
    setEditando(a)
    setNome(a?.nome ?? '')
    setDescricao(a?.descricao ?? '')
    setPreco(a ? numeroParaCampo(a.preco) : '')
    setParaTodos(a ? a.servicos.length === 0 : true)
    setMarcados(a ? a.servicos.filter(id => nomeDoServico.has(id)) : [])
    setOnline(a ? a.disponivel_online : true)
    setAtendimento(a ? a.disponivel_atendimento : true)
    setErroPainel(null)
    setPainel(true)
  }

  async function salvar() {
    const valor = paraNumero(preco)
    if (nome.trim().length < 2) return setErroPainel('Dê um nome ao serviço adicional.')
    if (!Number.isFinite(valor) || valor <= 0) return setErroPainel('Informe um preço maior que zero.')
    if (!paraTodos && marcados.length === 0) return setErroPainel('Marque pelo menos um serviço, ou escolha "Todos os serviços".')
    if (!online && !atendimento) return setErroPainel('Deixe o adicional disponível no agendamento online, no atendimento ou nos dois.')
    setErroPainel(null)
    setSalvando(true)
    const r = await chamarAcao('salvarServicoAdicionalAction', editando?.id_adicional ?? null, {
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: valor,
      disponivelOnline: online,
      disponivelAtendimento: atendimento,
      servicos: paraTodos ? [] : marcados,
    })
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setPainel(false)
    carregar()
  }

  async function alternar(a: ServicoAdicional, ativo: boolean) {
    setErro(null)
    setAlterando(a.id_adicional)
    const r = await chamarAcao('alternarStatusServicoAdicionalAction', a.id_adicional, ativo)
    setAlterando(null)
    if (r.error) return setErro(r.error)
    setAdicionais(prev => (prev ?? []).map(x => (x.id_adicional === a.id_adicional ? { ...x, status: ativo ? 'Ativo' : 'Inativo' } : x)))
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setSalvando(true)
    const r = await chamarAcao('excluirServicoAdicionalAction', excluir.id_adicional)
    setSalvando(false)
    setExcluir(null)
    if (r.error) return setErro(r.error)
    setPainel(false)
    carregar()
  }

  return (
    <View style={styles.secao}>
      <TopoSecao
        titulo="Adicionais"
        total={adicionais.length}
        texto="Cobranças extras, como pelo embolado ou pet agitado. O cliente escolhe ao agendar e a equipe inclui no atendimento."
        rotulo="Novo adicional"
        secundario
        onNovo={() => abrir(null)}
      />

      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      {adicionais.length === 0 ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTitulo}>Nenhum adicional cadastrado</Text>
          <Text style={styles.vazioTexto}>Cadastre taxas e extras que podem entrar num atendimento, cada um com o seu preço.</Text>
        </View>
      ) : (
        <ListaBranca>
          {adicionais.map((a, i) => (
            <LinhaServico
              key={a.id_adicional}
              icone={IconPlus}
              nome={a.nome}
              inativo={a.status === 'Inativo'}
              primeira={i === 0}
              onPress={() => abrir(a)}
              resumo={`+ ${formatarMoeda(a.preco)} · ${valePara(a)} · ${onde(a)}`}
            >
              <Interruptor
                value={a.status === 'Ativo'}
                disabled={alterando === a.id_adicional}
                onValueChange={v => alternar(a, v)}
                accessibilityLabel={`${a.nome} ativo`}
              />
            </LinhaServico>
          ))}
        </ListaBranca>
      )}

      <Folha visivel={painel} titulo={editando ? 'Editar serviço adicional' : 'Novo serviço adicional'} onFechar={() => setPainel(false)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Nome" obrigatorio value={nome} onChangeText={setNome} placeholder="Ex: Taxa por pelo embolado" maxLength={100} />
        <Campo rotulo="Preço (R$)" obrigatorio value={preco} onChangeText={setPreco} keyboardType="decimal-pad" placeholder="30,00" maxLength={10} />
        <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} placeholder="Quando se aplica. O cliente vê este texto ao agendar." maxLength={500} multiline />

        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Vale para quais serviços?</Text>
          <View style={styles.segmentos} accessibilityRole="radiogroup">
            <Segmento rotulo="Todos os serviços" ativo={paraTodos} onPress={() => setParaTodos(true)} />
            <Segmento rotulo="Só alguns" ativo={!paraTodos} onPress={() => setParaTodos(false)} desativado={servicos.length === 0} />
          </View>
          {!paraTodos && (
            <View style={styles.chips}>
              {servicos.map(s => {
                const marcado = marcados.includes(s.id_servico)
                return (
                  <Pressable
                    key={s.id_servico}
                    onPress={() => setMarcados(m => (m.includes(s.id_servico) ? m.filter(x => x !== s.id_servico) : [...m, s.id_servico]))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: marcado }}
                    style={[styles.chip, marcado && styles.chipAtivo]}
                  >
                    <Text style={[styles.chipTexto, marcado && styles.chipTextoAtivo]}>{s.nome}</Text>
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>

        <View style={styles.grupo}>
          <Text style={styles.rotulo}>Onde pode ser usado</Text>
          <View style={styles.caixa}>
            <LinhaChave icone={IconCalendar} titulo="Agendamento online" texto="O cliente pode escolher ao agendar." ligado={online} onChange={setOnline} />
            <View style={styles.traco} />
            <LinhaChave icone={IconScissors} titulo="Durante o atendimento" texto="A equipe pode incluir no detalhe do agendamento." ligado={atendimento} onChange={setAtendimento} />
          </View>
        </View>

        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : 'Salvar adicional'} desativado={salvando} onPress={salvar} />
          <BotaoPequeno normal rotulo="Cancelar" desativado={salvando} onPress={() => setPainel(false)} />
          {editando && podeExcluir && (
            <BotaoPequeno normal variante="perigoClaro" icone={IconTrash} rotulo="Excluir adicional" desativado={salvando} onPress={() => setExcluir(editando)} />
          )}
        </View>
      </Folha>

      <FolhaConfirmar visivel={!!excluir} titulo="Excluir serviço adicional" nome={excluir?.nome} ocupado={salvando} onConfirmar={confirmarExclusao} onFechar={() => setExcluir(null)}>
        Ele sai da lista e não pode mais ser escolhido nem incluído. Nos atendimentos em que já foi cobrado, continua aparecendo com o valor da época.
      </FolhaConfirmar>
    </View>
  )
}

function Segmento({ rotulo, ativo, onPress, desativado }: { rotulo: string; ativo: boolean; onPress: () => void; desativado?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desativado}
      accessibilityRole="radio"
      accessibilityState={{ selected: ativo, disabled: !!desativado }}
      style={[styles.segmento, ativo && styles.segmentoAtivo, desativado && { opacity: 0.5 }]}
    >
      <Text style={[styles.segmentoTexto, ativo && styles.segmentoTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  )
}

function LinhaChave({ icone: Icone, titulo, texto, ligado, onChange }: {
  icone: (p: IconeProps) => React.ReactNode
  titulo: string
  texto: string
  ligado: boolean
  onChange: (ligado: boolean) => void
}) {
  return (
    <Pressable onPress={() => onChange(!ligado)} style={styles.linhaChave} accessibilityRole="switch" accessibilityState={{ checked: ligado }} accessibilityLabel={titulo}>
      <View style={styles.linhaIcone}><Icone size={16} color={colors.primary300} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linhaTitulo}>{titulo}</Text>
        <Text style={styles.linhaTexto}>{texto}</Text>
      </View>
      <Interruptor value={ligado} onValueChange={onChange} accessibilityLabel={titulo} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // `.srv-adicionais` do site em 375 de largura.
  secao: { marginTop: 24 },
  vazio: { gap: 2, padding: 20, backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 12 },
  vazioTitulo: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: colors.textDim },
  vazioTexto: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  grupo: { gap: 6 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  // `.na-seg.is-cheio`
  segmentos: { flexDirection: 'row', padding: 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8 },
  segmento: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  segmentoAtivo: { backgroundColor: 'rgba(79,70,229,0.12)' },
  segmentoTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textMuted },
  segmentoTextoAtivo: { color: colors.primary300 },
  // `.adic-chip`
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: { height: 34, paddingHorizontal: 13.6, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 999 },
  chipAtivo: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.12)' },
  chipTexto: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.textDim },
  chipTextoAtivo: { color: colors.primary300 },
  // `.eq-grupo` / `.eq-linha`
  caixa: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  traco: { height: 1, marginLeft: 58, backgroundColor: colors.border },
  linhaChave: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14 },
  linhaIcone: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(79,70,229,0.12)' },
  linhaTitulo: { fontSize: 15, lineHeight: 20.25, fontWeight: '600', color: colors.text },
  linhaTexto: { fontSize: 13, lineHeight: 17.55, color: colors.textMuted },
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
