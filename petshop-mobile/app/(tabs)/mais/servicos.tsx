import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { Segmentos } from '@/components/Opcao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { formatarMoeda } from '@/lib/format'
import { numeroParaCampo, paraNumero, soDigitos } from '@/lib/mascaras'
import { colors, spacing, typography } from '@/theme/theme'

interface Servico {
  id_servico: string
  nome: string
  descricao: string | null
  preco: number
  duracao: number
  status: 'Ativo' | 'Inativo'
}

interface Variacao {
  id_variacao: string
  tipo: 'porte' | 'raca'
  especie: 'Cão' | 'Gato'
  porte: string | null
  raca: string | null
  preco: number
}

// Serviços da loja (tabela `servico`) e as faixas de preço por porte ou
// raça (`servico_variacao`, migration 010). Gravar passa pelas mesmas
// actions do painel web (criarServicoAction, editarServicoAction…).
export default function ServicosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.podeGerenciarServicos
  const [servicos, setServicos] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [alterando, setAlterando] = useState<string | null>(null)

  // Painel de criar/editar. `editando` null = serviço novo.
  const [painel, setPainel] = useState(false)
  const [editando, setEditando] = useState<Servico | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preco, setPreco] = useState('')
  const [duracao, setDuracao] = useState('')
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Faixas de preço do serviço aberto.
  const [variacoes, setVariacoes] = useState<Variacao[] | null>(null)
  const [vTipo, setVTipo] = useState<'porte' | 'raca'>('porte')
  const [vEspecie, setVEspecie] = useState<'Cão' | 'Gato'>('Cão')
  const [vPorte, setVPorte] = useState<'Pequeno' | 'Médio' | 'Grande'>('Pequeno')
  const [vRaca, setVRaca] = useState('')
  const [vPreco, setVPreco] = useState('')

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const { data, error } = await supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao, status')
      .eq('id_lojista', idLojista)
      .order('created_at', { ascending: false })
    if (error) setErro('Não foi possível carregar os serviços.')
    else {
      setErro(null)
      setServicos(((data ?? []) as Servico[]).map(s => ({ ...s, preco: Number(s.preco) })))
    }
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  const carregarVariacoes = useCallback(async (idServico: string) => {
    const { data } = await supabase
      .from('servico_variacao')
      .select('id_variacao, tipo, especie, porte, raca, preco')
      .eq('id_servico', idServico)
      .order('especie')
      .order('tipo')
    setVariacoes(((data ?? []) as Variacao[]).map(v => ({ ...v, preco: Number(v.preco) })))
  }, [])

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Serviços" />
        <SemPermissao area="gerenciar serviços" />
      </ScreenContainer>
    )
  }

  function abrir(s: Servico | null) {
    setEditando(s)
    setNome(s?.nome ?? '')
    setDescricao(s?.descricao ?? '')
    setPreco(s ? numeroParaCampo(s.preco) : '')
    setDuracao(s ? String(s.duracao) : '')
    setErroPainel(null)
    setVariacoes(null)
    setVTipo('porte')
    setVRaca('')
    setVPreco('')
    if (s) carregarVariacoes(s.id_servico)
    setPainel(true)
  }

  async function salvar() {
    const valor = paraNumero(preco)
    const minutos = Number(soDigitos(duracao))
    if (nome.trim().length < 2) return setErroPainel('Dê um nome ao serviço.')
    if (!Number.isFinite(valor) || valor < 0) return setErroPainel('Informe o preço.')
    if (!minutos) return setErroPainel('Informe a duração em minutos (de 15 a 480).')
    setErroPainel(null)
    setSalvando(true)
    const campos = form({ nome: nome.trim(), descricao: descricao.trim(), preco: valor, duracao: minutos })
    const r = editando
      ? await chamarAcao('editarServicoAction', editando.id_servico, campos)
      : await chamarAcao('criarServicoAction', campos)
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setPainel(false)
    carregar()
  }

  async function alternar(s: Servico, ativo: boolean) {
    setErro(null)
    setAlterando(s.id_servico)
    const r = await chamarAcao('alternarStatusServicoAction', s.id_servico, ativo)
    setAlterando(null)
    if (r.error) return setErro(r.error)
    setServicos(lista => lista.map(x => (x.id_servico === s.id_servico ? { ...x, status: ativo ? 'Ativo' : 'Inativo' } : x)))
  }

  function pedirExclusao(s: Servico) {
    dialogo('Excluir serviço', `Excluir "${s.nome}"? Só dá para excluir serviço que nunca teve agendamento — senão, desative.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setSalvando(true)
          const r = await chamarAcao('excluirServicoAction', s.id_servico)
          setSalvando(false)
          if (r.error) return setErroPainel(r.error)
          setPainel(false)
          carregar()
        },
      },
    ])
  }

  async function adicionarVariacao() {
    if (!editando) return
    const valor = paraNumero(vPreco)
    if (!Number.isFinite(valor) || valor < 0) return setErroPainel('Informe o preço da faixa.')
    if (vTipo === 'raca' && !vRaca.trim()) return setErroPainel('Informe a raça.')
    setErroPainel(null)
    setSalvando(true)
    const r = await chamarAcao(
      'adicionarVariacaoServicoAction',
      editando.id_servico,
      form(vTipo === 'raca'
        ? { tipo: 'raca', especie: vEspecie, raca: vRaca.trim(), preco: valor }
        : { tipo: 'porte', especie: vEspecie, porte: vPorte, preco: valor }),
    )
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    setVRaca('')
    setVPreco('')
    carregarVariacoes(editando.id_servico)
  }

  async function removerVariacao(v: Variacao) {
    if (!editando) return
    setErroPainel(null)
    setSalvando(true)
    const r = await chamarAcao('removerVariacaoServicoAction', v.id_variacao)
    setSalvando(false)
    if (r.error) return setErroPainel(r.error)
    carregarVariacoes(editando.id_servico)
  }

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Serviços" />

      {!acoesDisponiveis() && <Aviso tipo="alerta" texto={`Só consulta: ${MSG_SEM_SITE}`} style={{ marginBottom: spacing.md }} />}
      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      <Botao rotulo="Novo serviço" icone="add" onPress={() => abrir(null)} style={{ marginBottom: spacing.lg }} />

      {!loading && servicos.length === 0 && !erro ? (
        <EmptyState icon="cut-outline" title="Nenhum serviço cadastrado" subtitle="Cadastre o primeiro serviço para a loja poder receber agendamentos." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {servicos.map(s => (
            <Card key={s.id_servico} style={styles.item} onPress={() => abrir(s)}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.nome, s.status === 'Inativo' && styles.apagado]} numberOfLines={2}>{s.nome}</Text>
                <Text style={styles.sub}>
                  {formatarMoeda(s.preco)} · {s.duracao} min{s.status === 'Inativo' ? ' · Inativo' : ''}
                </Text>
              </View>
              <Switch
                value={s.status === 'Ativo'}
                disabled={alterando === s.id_servico}
                onValueChange={v => alternar(s, v)}
                trackColor={{ true: colors.primary500, false: colors.borderStrong }}
                thumbColor={colors.white}
                accessibilityLabel={`${s.nome} ativo`}
              />
            </Card>
          ))}
        </View>
      )}

      <Folha visivel={painel} titulo={editando ? 'Editar serviço' : 'Novo serviço'} onFechar={() => setPainel(false)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Ex.: Banho e tosa" maxLength={100} />
        <View style={styles.duas}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Preço (R$)" value={preco} onChangeText={setPreco} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
          </View>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Duração (min)" value={duracao} onChangeText={t => setDuracao(soDigitos(t))} keyboardType="number-pad" placeholder="60" maxLength={3} />
          </View>
        </View>
        <Campo rotulo="Descrição (opcional)" value={descricao} onChangeText={setDescricao} maxLength={500} multiline />
        <Botao rotulo={editando ? 'Salvar serviço' : 'Cadastrar serviço'} onPress={salvar} carregando={salvando} />

        {editando && (
          <>
            <Text style={styles.secao}>Preço por porte ou raça</Text>
            <Text style={styles.sub}>
              Sem faixa cadastrada, vale o preço acima. Com faixa, o pet daquele porte (ou raça) paga o valor da faixa.
            </Text>
            {variacoes === null ? (
              <Text style={styles.sub}>Carregando…</Text>
            ) : (
              variacoes.map(v => (
                <View key={v.id_variacao} style={styles.variacao}>
                  <Text style={styles.variacaoTexto}>
                    {v.especie} · {v.tipo === 'porte' ? v.porte : v.raca}
                  </Text>
                  <Text style={styles.variacaoPreco}>{formatarMoeda(v.preco)}</Text>
                  <Pressable onPress={() => removerVariacao(v)} disabled={salvando} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remover faixa">
                    <Ionicons name="trash-outline" size={19} color={colors.dangerFg} />
                  </Pressable>
                </View>
              ))
            )}

            <Segmentos valor={vTipo} onChange={setVTipo} opcoes={[{ valor: 'porte', rotulo: 'Por porte' }, { valor: 'raca', rotulo: 'Por raça' }]} />
            <Segmentos valor={vEspecie} onChange={setVEspecie} opcoes={[{ valor: 'Cão', rotulo: 'Cão' }, { valor: 'Gato', rotulo: 'Gato' }]} />
            {vTipo === 'porte' ? (
              <Segmentos
                valor={vPorte}
                onChange={setVPorte}
                opcoes={[{ valor: 'Pequeno', rotulo: 'Pequeno' }, { valor: 'Médio', rotulo: 'Médio' }, { valor: 'Grande', rotulo: 'Grande' }]}
              />
            ) : (
              <Campo rotulo="Raça" value={vRaca} onChangeText={setVRaca} placeholder="Ex.: Golden Retriever" maxLength={80} />
            )}
            <Campo rotulo="Preço da faixa (R$)" value={vPreco} onChangeText={setVPreco} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
            <Botao rotulo="Adicionar faixa" icone="add" variante="secundario" onPress={adicionarVariacao} desativado={salvando} />

            <Botao rotulo="Excluir serviço" icone="trash-outline" variante="perigo" onPress={() => pedirExclusao(editando)} desativado={salvando} />
          </>
        )}
      </Folha>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  duas: { flexDirection: 'row', gap: spacing.md },
  secao: { ...typography.heading.sm, color: colors.text, marginTop: spacing.md },
  variacao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  variacaoTexto: { ...typography.body.lg, color: colors.text, flex: 1 },
  variacaoPreco: { ...typography.label.md, color: colors.text },
})
