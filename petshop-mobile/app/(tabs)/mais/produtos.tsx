import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { SearchField } from '@/components/SearchField'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { Segmentos } from '@/components/Opcao'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { chamarAcao, form } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda } from '@/lib/format'
import { numeroParaCampo, paraNumero } from '@/lib/mascaras'
import {
  ROTULO_STATUS_ESTOQUE,
  UNIDADES_VENDA,
  erroQuantidadeInteira,
  formatarQuantidade,
  rotuloEstoque,
  rotuloUnidade,
  statusEstoque,
  unidadeFracionavel,
  type StatusEstoque,
  type UnidadeVenda,
} from '@/lib/produto'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Produto {
  id_produto: string
  nome: string
  id_categoria: string | null
  unidade_venda: UnidadeVenda
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  status: 'Ativo' | 'Inativo'
  disponivel_agendamento_online?: boolean
}

interface Categoria { id_categoria: string; nome: string }

const COR_ESTOQUE: Record<StatusEstoque, { fundo: string; texto: string }> = {
  zerado: { fundo: colors.dangerBg, texto: colors.dangerFg },
  baixo: { fundo: colors.warningBg, texto: colors.warningFg },
  em_estoque: { fundo: colors.successBg, texto: colors.successFg },
}

type Filtro = 'todos' | 'baixo' | 'inativos'
type Aba = 'estoque' | 'dados'

// Catálogo e estoque da loja (tabela `produto`, migration 037): consultar,
// cadastrar e editar, dar entrada/saída de estoque (fn_movimentar_estoque)
// e ativar/desativar. Cadastro e edição passam pelas mesmas actions do
// painel web. Foto e renomear categorias ficam no painel.
export default function ProdutosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.podeGerenciarProdutos
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  // Custo por unidade (CMV, migration 062) — null sem a migration.
  const [custos, setCustos] = useState<Map<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  // Painel do produto. `aberto` null com painel aberto = produto novo.
  const [painel, setPainel] = useState(false)
  const [aberto, setAberto] = useState<Produto | null>(null)
  const [aba, setAba] = useState<Aba>('estoque')
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  // Movimentação
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  // Dados
  const [nome, setNome] = useState('')
  const [idCategoria, setIdCategoria] = useState('')
  const [unidade, setUnidade] = useState<UnidadeVenda>('unidade')
  const [preco, setPreco] = useState('')
  const [custo, setCusto] = useState('')
  const [estoqueInicial, setEstoqueInicial] = useState('')
  const [estoqueMinimo, setEstoqueMinimo] = useState('')
  const [online, setOnline] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    // Categoria resolvida aqui por id (sem embed), como no painel web.
    const [prods, cats, custosRes] = await Promise.all([
      supabase.from('produto').select('*').eq('id_lojista', idLojista).order('nome'),
      supabase.from('categoria_produto').select('id_categoria, nome').eq('id_lojista', idLojista).order('nome'),
      supabase.from('produto_custo').select('id_produto, custo_unitario').eq('id_lojista', idLojista),
    ])
    if (prods.error) {
      setErro('Não foi possível carregar os produtos.')
    } else {
      setErro(null)
      setProdutos(((prods.data ?? []) as Produto[]).map(p => ({
        ...p,
        preco_venda: Number(p.preco_venda),
        estoque_atual: Number(p.estoque_atual),
        estoque_minimo: Number(p.estoque_minimo),
      })))
    }
    setCategorias((cats.data ?? []) as Categoria[])
    setCustos(custosRes.error
      ? null
      : new Map(((custosRes.data ?? []) as { id_produto: string; custo_unitario: number }[]).map(c => [c.id_produto, Number(c.custo_unitario)])))
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  const nomeCategoria = useMemo(() => new Map(categorias.map(c => [c.id_categoria, c.nome])), [categorias])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return produtos.filter(p => {
      if (termo && !p.nome.toLowerCase().includes(termo)) return false
      if (filtro === 'inativos') return p.status === 'Inativo'
      if (filtro === 'baixo') return p.status === 'Ativo' && statusEstoque(p.estoque_atual, p.estoque_minimo) !== 'em_estoque'
      return true
    })
  }, [produtos, busca, filtro])

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Produtos" />
        <SemPermissao area="gerenciar produtos" />
      </ScreenContainer>
    )
  }

  function abrir(p: Produto | null) {
    setAberto(p)
    setAba(p ? 'estoque' : 'dados')
    setErroPainel(null)
    setTipo('entrada')
    setQuantidade('')
    setMotivo('')
    setNome(p?.nome ?? '')
    setIdCategoria(p?.id_categoria ?? categorias[0]?.id_categoria ?? '')
    setUnidade(p?.unidade_venda ?? 'unidade')
    setPreco(p ? numeroParaCampo(p.preco_venda) : '')
    setCusto(p && custos?.has(p.id_produto) ? numeroParaCampo(custos.get(p.id_produto)) : '')
    setEstoqueInicial('')
    setEstoqueMinimo(p && p.estoque_minimo > 0 ? formatarQuantidade(p.estoque_minimo) : '')
    setOnline(!!p?.disponivel_agendamento_online)
    setPainel(true)
  }

  async function movimentar() {
    if (!aberto) return
    const qtd = paraNumero(quantidade)
    if (!Number.isFinite(qtd) || qtd <= 0) return setErroPainel('Informe uma quantidade maior que zero.')
    const erroInteiro = erroQuantidadeInteira(aberto.unidade_venda, qtd)
    if (erroInteiro) return setErroPainel(erroInteiro)
    setErroPainel(null)
    setEnviando(true)
    const { error } = await supabase.rpc('fn_movimentar_estoque', {
      p_id_produto: aberto.id_produto,
      p_tipo: tipo,
      p_quantidade: qtd,
      p_motivo: motivo.trim() || null,
    })
    setEnviando(false)
    if (error) return setErroPainel(mensagemDoBanco(error, 'Não foi possível movimentar o estoque.'))
    setPainel(false)
    carregar()
  }

  async function salvarDados() {
    const valor = paraNumero(preco)
    if (nome.trim().length < 2) return setErroPainel('Dê um nome ao produto.')
    if (!idCategoria) return setErroPainel('Escolha a categoria.')
    if (!Number.isFinite(valor) || valor < 0) return setErroPainel('Informe o preço de venda.')
    const minimo = estoqueMinimo.trim() ? paraNumero(estoqueMinimo) : 0
    const inicial = estoqueInicial.trim() ? paraNumero(estoqueInicial) : 0
    if (!Number.isFinite(minimo) || minimo < 0) return setErroPainel('Estoque mínimo inválido.')
    if (!Number.isFinite(inicial) || inicial < 0) return setErroPainel('Estoque inicial inválido.')
    setErroPainel(null)
    setEnviando(true)
    const campos = {
      nome: nome.trim(),
      id_categoria: idCategoria,
      unidade_venda: unidade,
      preco_venda: valor,
      estoque_minimo: minimo,
      disponivel_agendamento_online: online,
      // Só vai quando o custo existe no banco (migration 062).
      ...(custos ? { custo_unitario: custo.trim() } : {}),
    }
    const r = aberto
      ? await chamarAcao('editarProdutoAction', aberto.id_produto, form(campos))
      : await chamarAcao('criarProdutoAction', form({ ...campos, estoque_atual: inicial }))
    setEnviando(false)
    if (r.error) return setErroPainel(r.error)
    setPainel(false)
    carregar()
    if (r.aviso) setErro(r.aviso)
  }

  async function alternarStatus(p: Produto) {
    if (!idLojista) return
    setErroPainel(null)
    setEnviando(true)
    const { data, error } = await supabase
      .from('produto')
      .update({ status: p.status === 'Ativo' ? 'Inativo' : 'Ativo' })
      .eq('id_produto', p.id_produto)
      .eq('id_lojista', idLojista)
      .select('id_produto')
    setEnviando(false)
    if (error || !data || data.length === 0) {
      return setErroPainel(error ? mensagemDoBanco(error, 'Erro ao atualizar o produto.') : 'Você não tem permissão para alterar este produto.')
    }
    setPainel(false)
    carregar()
  }

  function pedirStatus(p: Produto) {
    if (p.status === 'Inativo') return void alternarStatus(p)
    dialogo('Desativar produto', `${p.nome} deixa de aparecer para venda no agendamento online. Continuar?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Desativar', style: 'destructive', onPress: () => alternarStatus(p) },
    ])
  }

  function pedirExclusao(p: Produto) {
    dialogo('Excluir produto', `Excluir "${p.nome}"? Produto que já foi vendido não pode ser excluído — nesse caso, desative.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setEnviando(true)
          const r = await chamarAcao('excluirProdutoAction', p.id_produto)
          setEnviando(false)
          if (r.error) return setErroPainel(r.error)
          setPainel(false)
          carregar()
        },
      },
    ])
  }

  const fracionavel = unidadeFracionavel(unidade)

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Produtos" />

      <View style={{ gap: spacing.md }}>
        <Botao rotulo="Novo produto" icone="add" onPress={() => abrir(null)} />
        <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar produto..." />
        <Segmentos
          valor={filtro}
          onChange={setFiltro}
          opcoes={[
            { valor: 'todos', rotulo: 'Todos' },
            { valor: 'baixo', rotulo: 'Estoque baixo' },
            { valor: 'inativos', rotulo: 'Inativos' },
          ]}
        />
        {erro && <Aviso tipo="alerta" texto={erro} />}
      </View>

      <View style={styles.lista}>
        {visiveis.length === 0 && !loading ? (
          <EmptyState
            icon="cube-outline"
            ilustracao={produtos.length === 0 ? 'produtos' : undefined}
            title={produtos.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'}
            subtitle={produtos.length === 0 ? 'Cadastre o primeiro produto em "Novo produto".' : 'Tente outro nome ou outro filtro.'}
          />
        ) : (
          visiveis.map(p => {
            const st = statusEstoque(p.estoque_atual, p.estoque_minimo)
            const cor = COR_ESTOQUE[st]
            return (
              <Card key={p.id_produto} style={styles.item} onPress={() => abrir(p)}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.nome, p.status === 'Inativo' && styles.inativo]} numberOfLines={2}>{p.nome}</Text>
                  <Text style={styles.sub}>
                    {formatarMoeda(p.preco_venda)} / {rotuloUnidade(p.unidade_venda).toLowerCase()}
                    {p.id_categoria && nomeCategoria.get(p.id_categoria) ? ` · ${nomeCategoria.get(p.id_categoria)}` : ''}
                    {p.status === 'Inativo' ? ' · Inativo' : ''}
                  </Text>
                </View>
                <View style={styles.estoqueCol}>
                  <Text style={styles.estoque}>{rotuloEstoque(p.estoque_atual, p.unidade_venda)}</Text>
                  <View style={[styles.selo, { backgroundColor: cor.fundo }]}>
                    <Text style={[styles.seloTexto, { color: cor.texto }]}>{ROTULO_STATUS_ESTOQUE[st]}</Text>
                  </View>
                </View>
              </Card>
            )
          })
        )}
      </View>

      <Folha visivel={painel} titulo={aberto?.nome ?? 'Novo produto'} onFechar={() => setPainel(false)} ocupado={enviando}>
        {aberto && (
          <Segmentos valor={aba} onChange={v => { setAba(v); setErroPainel(null) }} opcoes={[{ valor: 'estoque', rotulo: 'Estoque' }, { valor: 'dados', rotulo: 'Dados do produto' }]} />
        )}
        {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}

        {aberto && aba === 'estoque' ? (
          <>
            <Text style={styles.sub}>
              Em estoque: {rotuloEstoque(aberto.estoque_atual, aberto.unidade_venda)}
              {aberto.estoque_minimo > 0 ? ` · mínimo ${rotuloEstoque(aberto.estoque_minimo, aberto.unidade_venda)}` : ''}
            </Text>
            <Segmentos valor={tipo} onChange={setTipo} opcoes={[{ valor: 'entrada', rotulo: 'Entrada (chegou)' }, { valor: 'saida', rotulo: 'Saída (baixa)' }]} />
            <Campo
              rotulo={`Quantidade (${rotuloUnidade(aberto.unidade_venda).toLowerCase()})`}
              value={quantidade}
              onChangeText={setQuantidade}
              keyboardType={unidadeFracionavel(aberto.unidade_venda) ? 'decimal-pad' : 'number-pad'}
              placeholder={unidadeFracionavel(aberto.unidade_venda) ? 'Ex.: 2,5' : 'Ex.: 3'}
              maxLength={10}
            />
            <Campo rotulo="Motivo (opcional)" value={motivo} onChangeText={setMotivo} placeholder="Ex.: compra do fornecedor" maxLength={200} />
            <Botao rotulo={tipo === 'entrada' ? 'Registrar entrada' : 'Registrar saída'} onPress={movimentar} carregando={enviando} />
            <Botao
              rotulo={aberto.status === 'Ativo' ? 'Desativar produto' : 'Reativar produto'}
              variante={aberto.status === 'Ativo' ? 'perigo' : 'secundario'}
              onPress={() => pedirStatus(aberto)}
              desativado={enviando}
            />
          </>
        ) : (
          <>
            <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Ex.: Shampoo neutro 500 ml" maxLength={100} />
            <Text style={styles.rotulo}>Categoria</Text>
            {categorias.length === 0 ? (
              <Text style={styles.sub}>Nenhuma categoria — crie uma em Produtos no painel web.</Text>
            ) : (
              <Segmentos valor={idCategoria} onChange={setIdCategoria} opcoes={categorias.map(c => ({ valor: c.id_categoria, rotulo: c.nome }))} />
            )}
            <Text style={styles.rotulo}>Vendido por</Text>
            <Segmentos valor={unidade} onChange={setUnidade} opcoes={UNIDADES_VENDA.map(u => ({ valor: u.value, rotulo: u.label }))} />
            <View style={styles.duas}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Preço de venda (R$)" value={preco} onChangeText={setPreco} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
              </View>
              {custos && (
                <View style={{ flex: 1 }}>
                  <Campo rotulo="Custo (R$, opcional)" value={custo} onChangeText={setCusto} keyboardType="decimal-pad" placeholder="0,00" maxLength={10} />
                </View>
              )}
            </View>
            <View style={styles.duas}>
              {!aberto && (
                <View style={{ flex: 1 }}>
                  <Campo
                    rotulo="Estoque inicial"
                    value={estoqueInicial}
                    onChangeText={setEstoqueInicial}
                    keyboardType={fracionavel ? 'decimal-pad' : 'number-pad'}
                    placeholder="0"
                    maxLength={10}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Campo
                  rotulo="Estoque mínimo"
                  value={estoqueMinimo}
                  onChangeText={setEstoqueMinimo}
                  keyboardType={fracionavel ? 'decimal-pad' : 'number-pad'}
                  placeholder="0"
                  maxLength={10}
                />
              </View>
            </View>
            <LinhaSwitch
              titulo="Vender no agendamento online"
              detalhe="O cliente pode comprar junto com o serviço."
              valor={online}
              onChange={setOnline}
            />
            <Botao rotulo={aberto ? 'Salvar produto' : 'Cadastrar produto'} onPress={salvarDados} carregando={enviando} />
            {aberto && <Botao rotulo="Excluir produto" icone="trash-outline" variante="perigo" onPress={() => pedirExclusao(aberto)} desativado={enviando} />}
          </>
        )}
      </Folha>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  lista: { marginTop: spacing.lg, gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  inativo: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  rotulo: { ...typography.label.md, color: colors.textDim },
  duas: { flexDirection: 'row', gap: spacing.md },
  estoqueCol: { alignItems: 'flex-end', gap: 4 },
  estoque: { ...typography.label.md, color: colors.text },
  selo: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
})
