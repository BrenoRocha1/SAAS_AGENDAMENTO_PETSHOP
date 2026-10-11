import { useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from 'expo-router'
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SemPermissao } from '@/components/SemPermissao'
import { SearchField } from '@/components/SearchField'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { CampoQuantidade, quantidadeBase } from '@/components/CampoQuantidade'
import { Folha, depoisDeFechar } from '@/components/Folha'
import { FolhaConfirmar } from '@/components/FolhaConfirmar'
import { IconCheck, IconClose, IconImage, IconPencil, IconPlus, IconTrash } from '@/components/IconesDoSite'
import { Interruptor } from '@/components/Interruptor'
import { ProdutoCartao, TrocaDeVisualizacao, type ModoVisualizacao } from '@/components/ProdutoCartao'
import { Segmentos } from '@/components/Opcao'
import { Seletor } from '@/components/Seletor'
import { Text, TextInput } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { chamarAcao, form, type Arquivo } from '@/lib/acoes'
import { dialogo } from '@/lib/dialogo'
import { mensagemDoBanco } from '@/lib/erros'
import { escolherImagem } from '@/lib/imagem'
import { formatarMoeda } from '@/lib/format'
import { ORIGENS_MERCADORIA, type ProdutoFiscal } from '@/lib/fiscal'
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
  foto_url?: string | null
  disponivel_agendamento_online?: boolean
}

interface Categoria { id_categoria: string; nome: string }

// A mesma chave que o site usa para guardar a escolha no navegador.
const CHAVE_MODO = 'petshop:produtos:modo-visualizacao'

const COR_ESTOQUE: Record<StatusEstoque, { fundo: string; texto: string }> = {
  zerado: { fundo: colors.dangerBg, texto: colors.dangerFg },
  baixo: { fundo: colors.warningBg, texto: colors.warningFg },
  em_estoque: { fundo: colors.successBg, texto: colors.successFg },
}

type Filtro = 'todos' | 'baixo' | 'inativos'
type Aba = 'estoque' | 'dados'

// "32,5% (R$ 6,40 por unidade)" — margem sobre o preço de venda.
function textoMargem(preco: number, custo: number): string | null {
  if (!(preco > 0) || !Number.isFinite(custo)) return null
  const lucro = preco - custo
  return `${((lucro / preco) * 100).toFixed(1).replace('.', ',')}% (R$ ${lucro.toFixed(2).replace('.', ',')} por unidade)`
}

// Catálogo e estoque da loja (tabela `produto`, migration 037): consultar,
// cadastrar e editar, dar entrada/saída de estoque (fn_movimentar_estoque)
// e ativar/desativar. Cadastro e edição passam pelas mesmas actions do
// painel web, a foto também (atualizarFotoProdutoAction).
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
  // Lista ou grade, como no site; a escolha fica guardada no aparelho.
  const [modo, setModo] = useState<ModoVisualizacao>('grade')
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_MODO).then(salvo => { if (salvo === 'lista') setModo('lista') }).catch(() => {})
  }, [])
  const trocarModo = (novo: ModoVisualizacao) => {
    setModo(novo)
    AsyncStorage.setItem(CHAVE_MODO, novo).catch(() => {})
  }

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
  // Informações fiscais (migration 094): null = a tabela ainda não existe.
  const [fiscais, setFiscais] = useState<Map<string, ProdutoFiscal> | null>(null)
  const [verFiscal, setVerFiscal] = useState(false)
  const [codigoBarras, setCodigoBarras] = useState('')
  const [ncm, setNcm] = useState('')
  const [cest, setCest] = useState('')
  const [cfop, setCfop] = useState('')
  const [cstCsosn, setCstCsosn] = useState('')
  const [origem, setOrigem] = useState('')
  const [estoqueInicial, setEstoqueInicial] = useState('')
  const [estoqueMinimo, setEstoqueMinimo] = useState('')
  const [online, setOnline] = useState(false)
  // Estoque digitado em g/ml (produto vendido por kg/litro).
  const [minimoSub, setMinimoSub] = useState(false)
  const [inicialSub, setInicialSub] = useState(false)
  // Foto: a escolhida só sobe junto com o "Salvar Produto".
  const [fotoPendente, setFotoPendente] = useState<{ arquivo: Arquivo; uri: string } | null>(null)
  const [removerFoto, setRemoverFoto] = useState(false)
  // Produto esperando o "sim" da janela de exclusão.
  const [excluir, setExcluir] = useState<Produto | null>(null)
  // Janela "Categorias de produto".
  const [gerenciar, setGerenciar] = useState(false)
  const [erroCategoria, setErroCategoria] = useState<string | null>(null)
  const [novaCategoria, setNovaCategoria] = useState('')
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [nomeRenomeado, setNomeRenomeado] = useState('')
  const [ocupadoCategoria, setOcupadoCategoria] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    // Categoria resolvida aqui por id (sem embed), como no painel web.
    const [prods, cats, custosRes, fiscalRes] = await Promise.all([
      supabase.from('produto').select('*').eq('id_lojista', idLojista).order('nome'),
      supabase.from('categoria_produto').select('id_categoria, nome').eq('id_lojista', idLojista).order('nome'),
      supabase.from('produto_custo').select('id_produto, custo_unitario').eq('id_lojista', idLojista),
      supabase.from('produto_fiscal').select('id_produto, codigo_barras, ncm, cest, cfop, origem, cst_csosn').eq('id_lojista', idLojista),
    ])
    if (prods.error) {
      setErro('Não foi possível carregar os produtos.')
    } else {
      setErro(null)
      // Produto excluído depois de vendido (migration 087) continua no banco
      // pelo histórico, mas não aparece mais aqui. Sem a coluna, ninguém sai.
      setProdutos(((prods.data ?? []) as (Produto & { excluido_em?: string | null })[]).filter(p => !p.excluido_em).map(p => ({
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
    setFiscais(fiscalRes.error
      ? null
      : new Map(((fiscalRes.data ?? []) as (ProdutoFiscal & { id_produto: string })[]).map(({ id_produto, ...f }) => [id_produto, f])))
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
    const f = p ? fiscais?.get(p.id_produto) : undefined
    setCodigoBarras(f?.codigo_barras ?? '')
    setNcm(f?.ncm ?? '')
    setCest(f?.cest ?? '')
    setCfop(f?.cfop ?? '')
    setCstCsosn(f?.cst_csosn ?? '')
    setOrigem(f?.origem != null ? String(f.origem) : '')
    setVerFiscal(!!f && Object.values(f).some(v => v !== null && v !== ''))
    setEstoqueInicial('')
    setEstoqueMinimo(p ? formatarQuantidade(p.estoque_minimo) : '0')
    setOnline(!!p?.disponivel_agendamento_online)
    setMinimoSub(false)
    setInicialSub(false)
    setFotoPendente(null)
    setRemoverFoto(false)
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
    if (!preco.trim() || !Number.isFinite(valor) || valor < 0) return setErroPainel('Informe o preço de venda.')
    const minimo = quantidadeBase(estoqueMinimo, unidade, minimoSub)
    const inicial = quantidadeBase(estoqueInicial, unidade, inicialSub)
    if (!Number.isFinite(minimo) || minimo < 0) return setErroPainel('Estoque mínimo inválido.')
    if (!aberto && !estoqueInicial.trim()) return setErroPainel('Informe o estoque atual.')
    if (!Number.isFinite(inicial) || inicial < 0) return setErroPainel('Estoque atual inválido.')
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
      ...(custos ? { custo_unitario: custo.trim() ? String(paraNumero(custo)) : '' } : {}),
      // Só vai quando a tabela fiscal existe no banco (migration 094).
      ...(fiscais ? {
        fiscal_presente: '1',
        fiscal_codigo_barras: codigoBarras,
        fiscal_ncm: ncm,
        fiscal_cest: cest,
        fiscal_cfop: cfop,
        fiscal_cst_csosn: cstCsosn,
        fiscal_origem: origem,
      } : {}),
    }
    const r = aberto
      ? await chamarAcao<{ produto: { id_produto: string } }>('editarProdutoAction', aberto.id_produto, form(campos))
      : await chamarAcao<{ produto: { id_produto: string } }>('criarProdutoAction', form({ ...campos, estoque_atual: inicial }))
    if (r.error || !r.produto) {
      setEnviando(false)
      return setErroPainel(r.error ?? 'Erro ao salvar produto.')
    }

    // A foto sobe depois, já com o id do produto (como no site).
    let aviso = r.aviso ?? null
    if (fotoPendente) {
      const foto = await chamarAcao<{ url: string }>('atualizarFotoProdutoAction', r.produto.id_produto, form({ foto: fotoPendente.arquivo }))
      if (foto.error) aviso = `Produto salvo, mas a foto não pôde ser enviada: ${foto.error}`
    } else if (removerFoto) {
      await chamarAcao('removerFotoProdutoAction', r.produto.id_produto)
    }
    setEnviando(false)
    setPainel(false)
    carregar()
    if (aviso) setErro(aviso)
  }

  // ── Foto ──
  async function escolherFoto(origem: 'galeria' | 'camera') {
    setErroPainel(null)
    const escolhida = await escolherImagem(origem)
    if (!escolhida) return
    if ('erro' in escolhida) return setErroPainel(escolhida.erro)
    setFotoPendente(escolhida)
    setRemoverFoto(false)
  }

  function pedirFoto() {
    // No navegador só existe o seletor de arquivos.
    if (Platform.OS === 'web') return void escolherFoto('galeria')
    dialogo('Foto do produto', 'De onde vem a imagem?', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Tirar foto', onPress: () => escolherFoto('camera') },
      { text: 'Escolher das fotos', onPress: () => escolherFoto('galeria') },
    ])
  }

  function tirarFoto() {
    if (fotoPendente) setFotoPendente(null)
    else if (aberto?.foto_url) setRemoverFoto(true)
  }

  // ── Categorias ──
  async function criarCategoria() {
    const novo = novaCategoria.trim()
    if (!novo || !idLojista) return
    if (novo.length < 2) return setErroCategoria('Nome muito curto')
    setErroCategoria(null)
    setOcupadoCategoria(true)
    const { data, error } = await supabase
      .from('categoria_produto')
      .insert({ id_lojista: idLojista, nome: novo })
      .select('id_categoria, nome')
      .single()
    setOcupadoCategoria(false)
    if (error || !data) return setErroCategoria(error?.code === '23505' ? 'Já existe uma categoria com esse nome.' : 'Erro ao criar categoria.')
    const criada = data as Categoria
    setCategorias(lista => [...lista, criada].sort((a, b) => a.nome.localeCompare(b.nome)))
    if (!idCategoria) setIdCategoria(criada.id_categoria)
    setNovaCategoria('')
  }

  async function salvarRenomeio(id: string) {
    const novo = nomeRenomeado.trim()
    if (!novo || !idLojista) return
    if (novo.length < 2) return setErroCategoria('Nome muito curto')
    setErroCategoria(null)
    setOcupadoCategoria(true)
    const { data, error } = await supabase
      .from('categoria_produto')
      .update({ nome: novo })
      .eq('id_categoria', id)
      .eq('id_lojista', idLojista)
      .select('id_categoria')
    setOcupadoCategoria(false)
    if (error) return setErroCategoria(error.code === '23505' ? 'Já existe uma categoria com esse nome.' : 'Erro ao renomear categoria.')
    if (!data || data.length === 0) return setErroCategoria('Você não tem permissão para gerenciar produtos.')
    setCategorias(lista => lista.map(c => (c.id_categoria === id ? { ...c, nome: novo } : c)).sort((a, b) => a.nome.localeCompare(b.nome)))
    setRenomeando(null)
  }

  // Apagar a categoria não apaga os produtos dela: ficam "sem categoria".
  async function excluirCategoria(id: string) {
    if (!idLojista) return
    setErroCategoria(null)
    setOcupadoCategoria(true)
    const { data, error } = await supabase
      .from('categoria_produto')
      .delete()
      .eq('id_categoria', id)
      .eq('id_lojista', idLojista)
      .select('id_categoria')
    setOcupadoCategoria(false)
    if (error) return setErroCategoria('Erro ao excluir categoria.')
    if (!data || data.length === 0) return setErroCategoria('Você não tem permissão para gerenciar produtos.')
    const restantes = categorias.filter(c => c.id_categoria !== id)
    setCategorias(restantes)
    setProdutos(lista => lista.map(p => (p.id_categoria === id ? { ...p, id_categoria: null } : p)))
    if (idCategoria === id) setIdCategoria(restantes[0]?.id_categoria ?? '')
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

  // Como no site: a janela do produto fecha e a pergunta abre no lugar.
  function pedirExclusao(p: Produto) {
    setPainel(false)
    setErro(null)
    depoisDeFechar(() => setExcluir(p))
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setEnviando(true)
    const r = await chamarAcao('excluirProdutoAction', excluir.id_produto)
    setEnviando(false)
    setExcluir(null)
    if (r.error) return setErro(r.error)
    carregar()
  }

  const fotoParaExibir = fotoPendente?.uri ?? (!removerFoto ? aberto?.foto_url : null) ?? null
  const margem = custo.trim() ? textoMargem(paraNumero(preco), paraNumero(custo)) : null

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Produtos" />

      <View style={{ gap: spacing.md }}>
        <Botao rotulo="Novo produto" icone="add" onPress={() => abrir(null)} />
        {/* A busca e, ao lado, a troca lista/grade. */}
        <View style={styles.buscaLinha}>
          <View style={styles.busca}>
            <SearchField value={busca} onChangeText={setBusca} placeholder="Buscar produto..." />
          </View>
          <TrocaDeVisualizacao modo={modo} onChange={trocarModo} />
        </View>
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
        ) : modo === 'grade' ? (
          // Dois por linha com 12 de vão: cada caixa tem 50% e 6 de respiro em volta.
          <View style={styles.grade}>
            {visiveis.map(p => {
              const st = statusEstoque(p.estoque_atual, p.estoque_minimo)
              return (
                <View key={p.id_produto} style={styles.gradeCaixa}>
                  <ProdutoCartao
                    nome={p.nome}
                    categoria={(p.id_categoria && nomeCategoria.get(p.id_categoria)) || null}
                    foto={p.foto_url}
                    preco={formatarMoeda(p.preco_venda)}
                    unidade={rotuloUnidade(p.unidade_venda).toLowerCase()}
                    estoque={rotuloEstoque(p.estoque_atual, p.unidade_venda)}
                    selo={st === 'em_estoque' ? null : { texto: ROTULO_STATUS_ESTOQUE[st], tom: st === 'zerado' ? 'zerado' : 'baixo' }}
                    inativo={p.status === 'Inativo'}
                    onPress={() => abrir(p)}
                  />
                </View>
              )
            })}
          </View>
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
            <Text style={styles.subFolha}>
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
            {/* A mesma janela de produto do site (ProdutosList). */}
            <View style={styles.grupo}>
              <Text style={styles.rotulo}>Foto do produto</Text>
              <View style={styles.fotoLinha}>
                <View style={styles.fotoCaixa}>
                  {fotoParaExibir
                    ? <Image source={{ uri: fotoParaExibir }} style={styles.fotoImagem} />
                    : <IconImage size={22} color={colors.textFaint} />}
                </View>
                <View style={styles.fotoBotoes}>
                  <BotaoPequeno rotulo={fotoParaExibir ? 'Alterar foto' : 'Adicionar foto'} icone={IconPlus} desativado={enviando} onPress={pedirFoto} />
                  {fotoParaExibir && <BotaoPequeno variante="fantasma" rotulo="Remover" icone={IconTrash} desativado={enviando} onPress={tirarFoto} />}
                </View>
              </View>
            </View>

            <Campo rotulo="Nome do Produto" obrigatorio value={nome} onChangeText={setNome} placeholder="Ex: Ração Premier Adulto" maxLength={100} />

            <View style={styles.grupo}>
              <Text style={styles.rotulo}>Categoria<Text style={styles.estrela}> *</Text></Text>
              <Seletor titulo="Categoria" valor={idCategoria} opcoes={categorias.map(c => ({ valor: c.id_categoria, rotulo: c.nome }))} onChange={setIdCategoria} />
              {/* No celular as categorias se gerenciam daqui. */}
              <Pressable onPress={() => { setErroCategoria(null); setRenomeando(null); setGerenciar(true) }} accessibilityRole="button">
                <Text style={styles.link}>Gerenciar categorias</Text>
              </Pressable>
            </View>

            <View style={styles.grupo}>
              <Text style={styles.rotulo}>Unidade de venda<Text style={styles.estrela}> *</Text></Text>
              <Seletor titulo="Unidade de venda" valor={unidade} opcoes={UNIDADES_VENDA.map(u => ({ valor: u.value, rotulo: u.label }))} onChange={setUnidade} />
            </View>

            <Campo rotulo="Preço de venda (R$)" obrigatorio value={preco} onChangeText={setPreco} keyboardType="decimal-pad" placeholder="18.90" maxLength={10} />
            <CampoQuantidade
              rotulo="Estoque mínimo"
              unidade={unidade}
              valor={estoqueMinimo}
              onChange={setEstoqueMinimo}
              usarSub={minimoSub}
              onUsarSub={setMinimoSub}
              nota={'Abaixo disso, o produto aparece como "Baixo" na tela de Estoque. Deixe 0 pra não alertar.'}
            />

            {custos && (
              <Campo
                rotulo={`Custo por ${rotuloUnidade(unidade).toLowerCase()} (R$)`}
                value={custo}
                onChangeText={setCusto}
                keyboardType="decimal-pad"
                placeholder="Ex: 12.50"
                maxLength={10}
                nota={<>
                  Quanto a loja paga por unidade (CMV) — entra no faturamento líquido do Relatório de Vendas. Só a equipe vê.
                  {margem && <> Margem: <Text style={styles.forte}>{margem}</Text>.</>}
                </>}
              />
            )}

            {fiscais && (
              <View style={styles.fiscal}>
                <Pressable onPress={() => setVerFiscal(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: verFiscal }}>
                  <Text style={styles.onlineTitulo}>Informações fiscais</Text>
                  <Text style={styles.nota}>NCM, CEST, CFOP, origem e código de barras — para a emissão de nota no futuro.</Text>
                  <Text style={styles.link}>{verFiscal ? 'Esconder ▴' : 'Mostrar ▾'}</Text>
                </Pressable>
                {verFiscal && (
                  <>
                    <Campo rotulo="Código de barras (GTIN/EAN)" value={codigoBarras} onChangeText={v => setCodigoBarras(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Ex.: 7891234567895" maxLength={14} nota="Com ele, o Caixa acha o produto pelo leitor de código de barras." />
                    <Campo rotulo="NCM" value={ncm} onChangeText={v => setNcm(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Ex.: 23091000" maxLength={8} />
                    <Campo rotulo="CEST (se houver)" value={cest} onChangeText={v => setCest(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="7 dígitos" maxLength={7} />
                    <Campo rotulo="CFOP" value={cfop} onChangeText={v => setCfop(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Ex.: 5102" maxLength={4} />
                    <Campo rotulo="CST / CSOSN" value={cstCsosn} onChangeText={v => setCstCsosn(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Ex.: 102" maxLength={3} />
                    <View style={styles.grupo}>
                      <Text style={styles.rotulo}>Origem da mercadoria</Text>
                      <Seletor titulo="Origem da mercadoria" valor={origem} opcoes={ORIGENS_MERCADORIA} onChange={setOrigem} />
                    </View>
                    <Text style={styles.nota}>Na dúvida, confirme os códigos com o seu contador. Tudo é opcional.</Text>
                  </>
                )}
              </View>
            )}

            {!aberto && (
              <CampoQuantidade
                rotulo="Estoque atual"
                obrigatorio
                unidade={unidade}
                valor={estoqueInicial}
                onChange={setEstoqueInicial}
                usarSub={inicialSub}
                onUsarSub={setInicialSub}
                nota="Quanto a loja já tem hoje. Depois de cadastrado, o estoque muda clicando no produto na listagem (entrada, saída ou ajuste)."
              />
            )}

            <View style={styles.online}>
              <View style={{ flex: 1 }}>
                <Text style={styles.onlineTitulo}>Vender no Agendamento Online</Text>
                <Text style={styles.nota}>O cliente poderá adicionar este produto ao agendar pelo link da loja ou pela própria conta.</Text>
              </View>
              <Interruptor value={online} onValueChange={setOnline} accessibilityLabel="Vender no Agendamento Online" />
            </View>

            {/* `.modal-footer` no celular: salvar e, ao editar, excluir. */}
            <View style={styles.rodape}>
              <BotaoPequeno normal variante="primario" rotulo={enviando ? 'Salvando...' : 'Salvar Produto'} desativado={enviando} onPress={salvarDados} />
              {aberto && <BotaoPequeno normal variante="perigoClaro" icone={IconTrash} rotulo="Excluir produto" desativado={enviando} onPress={() => pedirExclusao(aberto)} />}
            </View>

            {/* Categorias de produto — abre por cima, como no site. */}
            <Folha visivel={gerenciar} titulo="Categorias de produto" onFechar={() => setGerenciar(false)} ocupado={ocupadoCategoria}>
              {erroCategoria && <Aviso tipo="erro" texto={erroCategoria} />}
              <View style={{ gap: 8 }}>
                {categorias.map(c => (
                  <View key={c.id_categoria} style={styles.categoria}>
                    {renomeando === c.id_categoria ? (
                      <>
                        <TextInput value={nomeRenomeado} onChangeText={setNomeRenomeado} autoFocus maxLength={50} accessibilityLabel="Nome da categoria" style={styles.categoriaCampo} />
                        <Pressable onPress={() => salvarRenomeio(c.id_categoria)} disabled={ocupadoCategoria} accessibilityRole="button" accessibilityLabel="Salvar" style={styles.categoriaBotao}>
                          <IconCheck size={14} color={colors.textMuted} />
                        </Pressable>
                        <Pressable onPress={() => setRenomeando(null)} accessibilityRole="button" accessibilityLabel="Cancelar" style={styles.categoriaBotao}>
                          <IconClose size={14} color={colors.textMuted} />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Text style={styles.categoriaNome}>{c.nome}</Text>
                        <Pressable onPress={() => { setRenomeando(c.id_categoria); setNomeRenomeado(c.nome) }} accessibilityRole="button" accessibilityLabel="Renomear" style={styles.categoriaBotao}>
                          <IconPencil size={14} color={colors.textMuted} />
                        </Pressable>
                        <Pressable onPress={() => excluirCategoria(c.id_categoria)} disabled={ocupadoCategoria} accessibilityRole="button" accessibilityLabel="Excluir" style={styles.categoriaBotao}>
                          <IconTrash size={14} color={colors.textMuted} />
                        </Pressable>
                      </>
                    )}
                  </View>
                ))}
                {categorias.length === 0 && <Text style={styles.semCategoria}>Nenhuma categoria cadastrada ainda.</Text>}
              </View>
              <View style={styles.novaCategoria}>
                <TextInput
                  value={novaCategoria}
                  onChangeText={setNovaCategoria}
                  onSubmitEditing={criarCategoria}
                  placeholder="Nova categoria"
                  placeholderTextColor={colors.textFaint}
                  maxLength={50}
                  accessibilityLabel="Nova categoria"
                  style={[styles.categoriaCampo, { height: 48 }]}
                />
                <BotaoPequeno rotulo="Adicionar" icone={IconPlus} desativado={ocupadoCategoria || !novaCategoria.trim()} style={{ height: 48 }} onPress={criarCategoria} />
              </View>
              <View style={styles.rodape}>
                <BotaoPequeno normal rotulo="Fechar" onPress={() => setGerenciar(false)} />
              </View>
            </Folha>
          </>
        )}
      </Folha>

      <FolhaConfirmar visivel={!!excluir} titulo="Excluir produto" nome={excluir?.nome} ocupado={enviando} onConfirmar={confirmarExclusao} onFechar={() => setExcluir(null)}>
        Essa ação não pode ser desfeita. Se ele já foi vendido, as vendas continuam no histórico e nos relatórios.
      </FolhaConfirmar>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  fiscal: { gap: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  lista: { marginTop: spacing.lg, gap: spacing.md },
  // `.prod-busca-linha`: a busca ocupa o que sobra ao lado da troca.
  buscaLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  busca: { flex: 1 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  gradeCaixa: { width: '50%', padding: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nome: { ...typography.body.lg, fontWeight: '700', color: colors.text },
  inativo: { color: colors.textMuted },
  sub: { ...typography.body.md, color: colors.textMuted },
  // `.sub-app` da folha de estoque do site.
  subFolha: { ...typography.cartao.sub, color: colors.textMuted },
  rotulo: { ...typography.label.md, color: colors.textDim },
  // Janela do produto, medida no site em 375 de largura.
  grupo: { gap: 4 },
  estrela: { color: colors.dangerFg },
  nota: { fontSize: 12, lineHeight: 16, color: '#858d99' },
  forte: { fontWeight: '700' },
  link: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.primary600 },
  fotoLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fotoCaixa: {
    width: 64,
    height: 64,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fotoImagem: { width: '100%', height: '100%' },
  fotoBotoes: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  online: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceMuted,
  },
  onlineTitulo: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.text },
  // A Folha deixa 24 no fim; janela com botões no pé (`.modal-footer`) deixa 16.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
  categoria: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  categoriaNome: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  categoriaBotao: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  categoriaCampo: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
  },
  semCategoria: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  novaCategoria: { flexDirection: 'row', gap: 8, marginTop: 16 },
  estoqueCol: { alignItems: 'flex-end', gap: 4 },
  estoque: { ...typography.label.md, color: colors.text },
  selo: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
})
