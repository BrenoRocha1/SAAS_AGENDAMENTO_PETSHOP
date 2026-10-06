import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { FolhaConfirmar, Forte } from '@/components/FolhaConfirmar'
import { IconPlus, IconSliders, IconTrash } from '@/components/IconesDoSite'
import { Seletor } from '@/components/Seletor'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { MSG_SEM_SITE, acoesDisponiveis, chamarAcao, form } from '@/lib/acoes'
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

// Faixa de um serviço que ainda não foi salvo.
interface Rascunho {
  chave: string
  tipo: 'porte' | 'raca'
  especie: 'Cão' | 'Gato'
  porte: string
  raca: string
  preco: number
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
  // Serviço esperando o "sim" da janela de exclusão.
  const [excluir, setExcluir] = useState<Servico | null>(null)

  // Faixas de preço do serviço aberto.
  const [variacoes, setVariacoes] = useState<Variacao[] | null>(null)
  const [vTipo, setVTipo] = useState<'porte' | 'raca'>('porte')
  const [vEspecie, setVEspecie] = useState<'Cão' | 'Gato'>('Cão')
  const [vPorte, setVPorte] = useState<'' | 'Pequeno' | 'Médio' | 'Grande'>('')
  // "Preços e Variações" aberto, e as faixas de um serviço que ainda não
  // existe — vão junto no mesmo envio que cria o serviço.
  const [variacoesAbertas, setVariacoesAbertas] = useState(false)
  const [rascunho, setRascunho] = useState<Rascunho[]>([])
  const [erroVariacao, setErroVariacao] = useState<string | null>(null)
  const [vRaca, setVRaca] = useState('')
  const [vPreco, setVPreco] = useState('')

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const { data, error } = await supabase
      .from('servico')
      .select('id_servico, nome, descricao, preco, duracao, status')
      .eq('id_lojista', idLojista)
      // Serviço excluído (migration 081) fica só no histórico e no relatório.
      .is('excluido_em', null)
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
    setVariacoesAbertas(false)
    setRascunho([])
    setErroVariacao(null)
    setVTipo('porte')
    setVEspecie('Cão')
    setVPorte('')
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
    const campos = form({
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: valor,
      duracao: minutos,
      // Serviço novo: as faixas ainda não salvas vão no mesmo envio.
      variacoes: !editando && rascunho.length > 0
        ? JSON.stringify(rascunho.map(v => ({ tipo: v.tipo, especie: v.especie, porte: v.porte, raca: v.raca, preco: v.preco })))
        : null,
    })
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

  // Como no site: a janela do serviço fecha e a pergunta abre no lugar.
  function pedirExclusao(s: Servico) {
    setPainel(false)
    setErro(null)
    setExcluir(s)
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setSalvando(true)
    const r = await chamarAcao('excluirServicoAction', excluir.id_servico)
    setSalvando(false)
    setExcluir(null)
    if (r.error) return setErro(r.error)
    carregar()
  }

  const faixas: (Variacao | Rascunho)[] = editando ? (variacoes ?? []) : rascunho

  async function adicionarVariacao() {
    setErroVariacao(null)
    if (vTipo === 'porte' && !vPorte) return setErroVariacao('Selecione o porte')
    if (vTipo === 'raca' && !vRaca.trim()) return setErroVariacao('Informe a raça')
    const valor = paraNumero(vPreco)
    if (!vPreco.trim() || !Number.isFinite(valor) || valor < 0) return setErroVariacao('Informe o preço')
    const chave = vTipo === 'porte' ? vPorte : vRaca.trim()
    const repetida = faixas.some(v => v.tipo === vTipo && v.especie === vEspecie
      && (vTipo === 'raca' ? (v.raca ?? '').toLowerCase() === chave.toLowerCase() : v.porte === chave))
    if (repetida) return setErroVariacao('Já existe uma faixa de preço cadastrada para essa combinação.')

    if (!editando) {
      setRascunho(lista => [...lista, {
        chave: `${Date.now()}-${lista.length}`,
        tipo: vTipo,
        especie: vEspecie,
        porte: vTipo === 'porte' ? vPorte : '',
        raca: vTipo === 'raca' ? vRaca.trim() : '',
        preco: valor,
      }])
      setVPorte('')
      setVRaca('')
      setVPreco('')
      return
    }
    setSalvando(true)
    const r = await chamarAcao(
      'adicionarVariacaoServicoAction',
      editando.id_servico,
      form(vTipo === 'raca'
        ? { tipo: 'raca', especie: vEspecie, raca: vRaca.trim(), preco: valor }
        : { tipo: 'porte', especie: vEspecie, porte: vPorte, preco: valor }),
    )
    setSalvando(false)
    if (r.error) return setErroVariacao(r.error)
    setVPorte('')
    setVRaca('')
    setVPreco('')
    carregarVariacoes(editando.id_servico)
  }

  async function removerVariacao(v: Variacao | Rascunho) {
    if ('chave' in v) return setRascunho(lista => lista.filter(x => x.chave !== v.chave))
    if (!editando) return
    setErroVariacao(null)
    setSalvando(true)
    const r = await chamarAcao('removerVariacaoServicoAction', v.id_variacao)
    setSalvando(false)
    if (r.error) return setErroVariacao(r.error)
    carregarVariacoes(editando.id_servico)
  }

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Serviços" />

      {!acoesDisponiveis() && <Aviso tipo="alerta" texto={`Só consulta: ${MSG_SEM_SITE}`} style={{ marginBottom: spacing.md }} />}
      {erro && <Aviso tipo="erro" texto={erro} style={{ marginBottom: spacing.md }} />}

      <Botao rotulo="Novo serviço" icone="add" onPress={() => abrir(null)} style={{ marginBottom: spacing.lg }} />

      {!loading && servicos.length === 0 && !erro ? (
        <EmptyState icon="cut-outline" ilustracao="servicos" title="Nenhum serviço cadastrado" subtitle="Cadastre o primeiro serviço para a loja poder receber agendamentos." />
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
              <Interruptor
                value={s.status === 'Ativo'}
                disabled={alterando === s.id_servico}
                onValueChange={v => alternar(s, v)}
                accessibilityLabel={`${s.nome} ativo`}
              />
            </Card>
          ))}
        </View>
      )}

      {/* A mesma janela "Novo Serviço / Editar Serviço" do site (ServicosList). */}
      <Folha visivel={painel} titulo={editando ? 'Editar Serviço' : 'Novo Serviço'} onFechar={() => setPainel(false)} ocupado={salvando}>
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
        <Campo rotulo="Nome do Serviço" obrigatorio value={nome} onChangeText={setNome} placeholder="Ex: Banho e Tosa" maxLength={100} />
        <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} placeholder="Descreva o serviço..." maxLength={500} multiline />
        <Campo rotulo="Preço (R$)" obrigatorio value={preco} onChangeText={setPreco} keyboardType="decimal-pad" placeholder="45.00" maxLength={10} />
        <Campo rotulo="Duração (min)" obrigatorio value={duracao} onChangeText={v => setDuracao(soDigitos(v))} keyboardType="number-pad" placeholder="60" maxLength={3} />

        {/* Preços e Variações — cobrar diferente por porte ou por raça */}
        <View>
          <Pressable
            onPress={() => setVariacoesAbertas(v => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: variacoesAbertas }}
            style={styles.variacoesBotao}
          >
            <View style={styles.variacoesIcone}>
              <IconSliders size={15} color={colors.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.variacoesTitulo}>Preços e Variações</Text>
              <Text style={styles.variacoesSub}>Cobrar diferente por porte, espécie ou raça</Text>
            </View>
          </Pressable>

          {variacoesAbertas && (
            <View style={styles.variacoes}>
              <Text style={styles.nota}>
                Prioridade de cálculo: <Text style={styles.forte}>raça específica</Text> {'>'} <Text style={styles.forte}>porte + espécie</Text> {'>'} preço base.
                {!editando && ' As faixas abaixo só são salvas quando você clicar em "Salvar Serviço".'}
              </Text>
              {erroVariacao && <Aviso tipo="erro" texto={erroVariacao} />}

              {editando && variacoes === null ? (
                <Text style={styles.apoio}>Carregando...</Text>
              ) : faixas.length > 0 && (
                <View style={{ gap: 8 }}>
                  {faixas.map(v => (
                    <View key={'chave' in v ? v.chave : v.id_variacao} style={styles.faixa}>
                      <Text style={styles.faixaTexto}>{v.especie} · {v.tipo === 'raca' ? v.raca : v.porte}</Text>
                      <Text style={styles.faixaPreco}>{formatarMoeda(v.preco)}</Text>
                      <Pressable onPress={() => removerVariacao(v)} disabled={salvando} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remover" style={styles.faixaRemover}>
                        <IconTrash size={14} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.linhaDeBotoes}>
                <BotaoPequeno rotulo="Por porte" variante={vTipo === 'porte' ? 'primario' : 'secundario'} onPress={() => setVTipo('porte')} />
                <BotaoPequeno rotulo="Por raça" variante={vTipo === 'raca' ? 'primario' : 'secundario'} onPress={() => setVTipo('raca')} />
              </View>

              <View style={styles.grupo}>
                <Text style={styles.rotulo}>Espécie</Text>
                <Seletor titulo="Espécie" valor={vEspecie} opcoes={[{ valor: 'Cão', rotulo: 'Cão' }, { valor: 'Gato', rotulo: 'Gato' }]} onChange={setVEspecie} />
              </View>
              {vTipo === 'porte' ? (
                <View style={styles.grupo}>
                  <Text style={styles.rotulo}>Porte</Text>
                  <Seletor
                    titulo="Porte"
                    valor={vPorte}
                    opcoes={[{ valor: '', rotulo: 'Selecione' }, { valor: 'Pequeno', rotulo: 'Pequeno' }, { valor: 'Médio', rotulo: 'Médio' }, { valor: 'Grande', rotulo: 'Grande' }]}
                    onChange={setVPorte}
                  />
                </View>
              ) : (
                <Campo rotulo="Raça" value={vRaca} onChangeText={setVRaca} placeholder="Ex: Poodle" maxLength={80} />
              )}
              <Campo rotulo="Preço (R$)" value={vPreco} onChangeText={setVPreco} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
              <BotaoPequeno rotulo={salvando && editando ? 'Adicionando...' : 'Adicionar'} icone={IconPlus} desativado={salvando} style={styles.aEsquerda} onPress={adicionarVariacao} />
            </View>
          )}
        </View>

        {/* `.modal-footer` no celular: salvar, cancelar e, por último, excluir. */}
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo={salvando ? 'Salvando...' : 'Salvar Serviço'} desativado={salvando} onPress={salvar} />
          <BotaoPequeno normal rotulo="Cancelar" desativado={salvando} onPress={() => setPainel(false)} />
          {editando && (
            <BotaoPequeno normal variante="perigoClaro" icone={IconTrash} rotulo="Excluir serviço" desativado={salvando} onPress={() => pedirExclusao(editando)} />
          )}
        </View>
      </Folha>

      <FolhaConfirmar visivel={!!excluir} titulo="Excluir serviço" ocupado={salvando} onConfirmar={confirmarExclusao} onFechar={() => setExcluir(null)}>
        Tem certeza que deseja excluir <Forte>&quot;{excluir?.nome}&quot;</Forte>? Ele sai da lista e não pode mais ser agendado. Os atendimentos já feitos continuam no relatório de vendas, e o que já está marcado com ele continua valendo. Essa ação não pode ser desfeita.
      </FolhaConfirmar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  apagado: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  // Medidas da janela do serviço no site, em 375 de largura.
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  variacoesBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  variacoesIcone: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variacoesTitulo: { fontSize: 15, lineHeight: 17, fontWeight: '600', color: colors.text },
  variacoesSub: { fontSize: 13, lineHeight: 16, color: '#858d99' },
  variacoes: { marginTop: 16, gap: 12 },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  forte: { fontWeight: '700' },
  apoio: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  faixaTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  faixaPreco: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.successFg },
  faixaRemover: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  linhaDeBotoes: { flexDirection: 'row', gap: 8 },
  aEsquerda: { alignSelf: 'flex-start' },
  // A Folha deixa 24 no fim; janela com botões no pé (`.modal-footer`) deixa 16.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
