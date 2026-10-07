import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { CartaoVazio } from '@/components/CartaoVazio'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import {
  IconAlert,
  IconCart,
  IconChevronLeft,
  IconClose,
  IconMinus,
  IconPackage,
  IconPlus,
  IconReceipt,
  IconSearch,
  IconTrash,
  IconUser,
} from '@/components/IconesDoSite'
import { Text, TextInput } from '@/components/Texto'
import { FolhaCheckoutPdv } from '@/components/pdv/FolhaCheckoutPdv'
import { FolhaClientePdv } from '@/components/pdv/FolhaClientePdv'
import { useAuth } from '@/contexts/AuthContext'
import { hojeBrasilISO } from '@/lib/agenda'
import { FORMAS_LOJA_PADRAO, normalizarFormasLoja, type FormasLoja } from '@/lib/pagamento'
import {
  arredondarQuantidade,
  descontoEmReais,
  lerValorDigitado,
  passoQuantidade,
  subtotalCarrinho,
  subtotalLinha,
  totalVenda,
  type ClientePdv,
  type ItemCarrinho,
  type ProdutoPdv,
  type TipoDesconto,
  type VendaRegistrada,
} from '@/lib/pdv'
import { rotuloEstoque, statusEstoque } from '@/lib/produto'
import { supabase } from '@/lib/supabase'
import { formatarReais } from '@/lib/taxidog'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

interface Categoria {
  id_categoria: string
  nome: string
}

const SEM_CATEGORIA = '__sem_categoria__'

// Sem acento e em minúscula — "racao" acha "Ração".
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const textoNumero = (n: number) => String(arredondarQuantidade(n)).replace('.', ',')
const sufixoUnidade = (u: string) => (u === 'unidade' ? '' : ` / ${u}`)

// Campo de quantidade da linha. Digita-se à vontade e só vale ao sair do
// campo; `key={valor}` no uso recria o campo quando a quantidade muda por
// outro caminho (botões +/−).
function CampoQtd({ valor, unidade, onConfirmar }: { valor: number; unidade: string; onConfirmar: (q: number) => void }) {
  const [texto, setTexto] = useState(textoNumero(valor))
  const fracionavel = passoQuantidade(unidade) < 1

  function confirmar() {
    let q = lerValorDigitado(texto)
    if (!fracionavel) q = Math.round(q)
    if (q === valor) return setTexto(textoNumero(valor))
    onConfirmar(q)
  }

  return (
    <TextInput
      value={texto}
      onChangeText={setTexto}
      onBlur={confirmar}
      onSubmitEditing={confirmar}
      keyboardType={fracionavel ? 'decimal-pad' : 'number-pad'}
      returnKeyType="done"
      selectTextOnFocus
      accessibilityLabel="Quantidade"
      style={styles.qtdCampo}
    />
  )
}

// Caixa (PDV) — a mesma tela do site (/lojista/pdv) em largura de celular:
// busca, categorias e a grade de produtos; o carrinho é uma tela cheia que
// sobe pela barra de baixo, e dela saem o cliente e o fechamento da venda.
// Preço, estoque, forma aceita e permissão são conferidos de novo no banco
// (fn_registrar_venda_pdv, migration 083). O caixa mexe no estoque, então
// segue a permissão de Produtos.
export default function PdvScreen() {
  const { contexto } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: larguraDaTela } = useWindowDimensions()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.podeGerenciarProdutos

  const [produtos, setProdutos] = useState<ProdutoPdv[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [formas, setFormas] = useState<FormasLoja>(FORMAS_LOJA_PADRAO)
  const [nomeLoja, setNomeLoja] = useState('Meu Petshop')
  const [hoje, setHoje] = useState({ vendas: 0, total: 0 })
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState(false)

  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [cliente, setCliente] = useState<ClientePdv | null>(null)
  const [descontoTipo, setDescontoTipo] = useState<TipoDesconto>('valor')
  const [descontoTexto, setDescontoTexto] = useState('')
  const [descontoAberto, setDescontoAberto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [carrinhoAberto, setCarrinhoAberto] = useState(false)
  const [clienteAberto, setClienteAberto] = useState(false)
  // `vez` recria a janela a cada venda, para ela abrir sempre zerada.
  const [checkout, setCheckout] = useState({ aberto: false, vez: 0 })
  const avisoRelogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const inicioHoje = `${hojeBrasilISO()}T00:00:00-03:00`
    const [produtosRes, categoriasRes, formasRes, lojaRes, hojeRes] = await Promise.all([
      supabase
        .from('produto')
        .select('id_produto, nome, id_categoria, unidade_venda, preco_venda, estoque_atual, estoque_minimo, foto_url')
        .eq('id_lojista', idLojista)
        .eq('status', 'Ativo')
        .order('nome'),
      supabase.from('categoria_produto').select('id_categoria, nome').eq('id_lojista', idLojista).order('nome'),
      supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista }),
      supabase.from('lojista').select('nome_loja').eq('id_lojista', idLojista).maybeSingle(),
      // Também serve de teste: sem a migration 083 a tabela não existe.
      supabase.from('venda').select('total').eq('id_lojista', idLojista).eq('status', 'concluida').gte('created_at', inicioHoje),
    ])
    setCarregando(false)
    if (hojeRes.error) return setErroCarga(true)
    setErroCarga(false)
    setProdutos(((produtosRes.data ?? []) as Record<string, unknown>[]).map(p => ({
      id_produto: p.id_produto as string,
      nome: p.nome as string,
      id_categoria: (p.id_categoria as string | null) ?? null,
      unidade_venda: p.unidade_venda as string,
      preco_venda: Number(p.preco_venda),
      estoque_atual: Number(p.estoque_atual),
      estoque_minimo: Number(p.estoque_minimo),
      foto_url: (p.foto_url as string | null) ?? null,
    })))
    setCategorias((categoriasRes.data ?? []) as Categoria[])
    setFormas(normalizarFormasLoja(formasRes.data))
    setNomeLoja((lojaRes.data as { nome_loja: string } | null)?.nome_loja ?? 'Meu Petshop')
    const vendas = (hojeRes.data ?? []) as { total: number | string }[]
    setHoje({ vendas: vendas.length, total: vendas.reduce((s, v) => s + Number(v.total), 0) })
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))
  useEffect(() => () => { if (avisoRelogio.current) clearTimeout(avisoRelogio.current) }, [])

  const avisar = useCallback((msg: string) => {
    setAviso(msg)
    if (avisoRelogio.current) clearTimeout(avisoRelogio.current)
    avisoRelogio.current = setTimeout(() => setAviso(null), 3200)
  }, [])

  // ---------- Cálculos ----------
  const subtotal = subtotalCarrinho(carrinho)
  const desconto = { tipo: descontoTipo, valor: lerValorDigitado(descontoTexto) }
  const descontoReais = descontoEmReais(subtotal, desconto)
  const total = totalVenda(subtotal, descontoReais)
  const qtdLinhas = carrinho.length

  const noCarrinho = useMemo(() => {
    const m = new Map<string, number>()
    carrinho.forEach(i => m.set(i.produto.id_produto, i.quantidade))
    return m
  }, [carrinho])

  // ---------- Carrinho ----------
  function adicionar(p: ProdutoPdv) {
    const atual = noCarrinho.get(p.id_produto) ?? 0
    const nova = arredondarQuantidade(atual + 1)
    if (nova > p.estoque_atual) return avisar(`Só há ${rotuloEstoque(p.estoque_atual, p.unidade_venda)} de “${p.nome}”.`)
    setCarrinho(c => (c.some(i => i.produto.id_produto === p.id_produto)
      ? c.map(i => (i.produto.id_produto === p.id_produto ? { ...i, quantidade: nova } : i))
      : [{ produto: p, quantidade: nova }, ...c]))
  }

  function definirQuantidade(id: string, q: number) {
    const item = carrinho.find(i => i.produto.id_produto === id)
    if (!item) return
    const quantidade = arredondarQuantidade(q)
    if (!(quantidade > 0)) return setCarrinho(c => c.filter(i => i.produto.id_produto !== id))
    const max = item.produto.estoque_atual
    if (quantidade > max) {
      avisar(`Só há ${rotuloEstoque(max, item.produto.unidade_venda)} de “${item.produto.nome}”.`)
      return setCarrinho(c => c.map(i => (i.produto.id_produto === id ? { ...i, quantidade: max } : i)))
    }
    setCarrinho(c => c.map(i => (i.produto.id_produto === id ? { ...i, quantidade } : i)))
  }

  function limparVenda() {
    setCarrinho([])
    setCliente(null)
    setDescontoTexto('')
    setDescontoTipo('valor')
    setDescontoAberto(false)
    setAviso(null)
  }

  // ---------- Lista de produtos ----------
  const categoriasUsadas = useMemo(() => {
    const usadas = new Set(produtos.map(p => p.id_categoria ?? SEM_CATEGORIA))
    return categorias.filter(c => usadas.has(c.id_categoria))
  }, [produtos, categorias])
  const haSemCategoria = produtos.some(p => p.id_categoria === null)

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim())
    return produtos.filter(p => {
      if (categoria === SEM_CATEGORIA && p.id_categoria !== null) return false
      if (categoria && categoria !== SEM_CATEGORIA && p.id_categoria !== categoria) return false
      return !termo || normalizar(p.nome).includes(termo)
    })
  }, [produtos, busca, categoria])

  // ---------- Depois da venda ----------
  function aoRegistrar(vendidos: ItemCarrinho[], venda: VendaRegistrada) {
    const baixa = new Map(vendidos.map(i => [i.produto.id_produto, i.quantidade]))
    setProdutos(ps => ps.map(p => {
      const q = baixa.get(p.id_produto)
      return q ? { ...p, estoque_atual: arredondarQuantidade(p.estoque_atual - q) } : p
    }))
    setHoje(h => ({ vendas: h.vendas + 1, total: h.total + venda.total }))
    limparVenda()
  }

  function encerrarCheckout() {
    setCheckout(c => ({ aberto: false, vez: c.vez + 1 }))
    setCarrinhoAberto(false)
  }

  if (!pode) {
    return (
      <ScreenContainer>
        <DetailHeader title="Caixa" />
        <CartaoVazio icone={IconAlert} titulo="Sem permissão para usar o caixa" texto="Fale com o responsável pelo petshop para liberar esse acesso." />
      </ScreenContainer>
    )
  }

  // A grade do site: quantas colunas de 140 (no mínimo) couberem, com 8 entre elas.
  const larguraUtil = larguraDaTela - 32
  const colunas = Math.max(1, Math.floor((larguraUtil + 8) / 148))
  const larguraDoCartao = (larguraUtil - 8 * (colunas - 1)) / colunas

  return (
    <View style={styles.tela}>
      <ScreenContainer refreshing={carregando} onRefresh={carregar} contentStyle={styles.conteudo}>
        <DetailHeader title="Caixa" />

        {carregando ? null : erroCarga ? (
          <Aviso tipo="erro" texto="Não foi possível abrir o caixa agora. Tente novamente." />
        ) : (
          <>
            <View style={styles.cabecalho}>
              <View style={styles.hoje}>
                <Text style={styles.hojeTexto}>Hoje</Text>
                <Text style={[styles.hojeTexto, styles.hojeForte]}>{hoje.vendas} {hoje.vendas === 1 ? 'venda' : 'vendas'}</Text>
                <Text style={styles.hojeTexto}>·</Text>
                <Text style={[styles.hojeTexto, styles.hojeForte]}>{formatarReais(hoje.total)}</Text>
              </View>
              <BotaoPequeno rotulo="Histórico" icone={IconReceipt} tamanhoDoIcone={16} onPress={() => router.push('/mais/pdv/vendas' as never)} style={styles.historico} />
            </View>

            <View style={styles.principal}>
              <View style={styles.busca}>
                <IconSearch size={18} color="#858d99" />
                <TextInput
                  value={busca}
                  onChangeText={setBusca}
                  placeholder="Buscar produto…"
                  placeholderTextColor={colors.textFaint}
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel="Buscar produto"
                  style={styles.buscaCampo}
                />
              </View>

              {(categoriasUsadas.length > 0 || haSemCategoria) && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categorias} style={styles.categoriasRolagem}>
                  <Chip rotulo="Todos" ativo={categoria === ''} onPress={() => setCategoria('')} />
                  {categoriasUsadas.map(c => (
                    <Chip key={c.id_categoria} rotulo={c.nome} ativo={categoria === c.id_categoria} onPress={() => setCategoria(c.id_categoria)} />
                  ))}
                  {haSemCategoria && <Chip rotulo="Sem categoria" ativo={categoria === SEM_CATEGORIA} onPress={() => setCategoria(SEM_CATEGORIA)} />}
                </ScrollView>
              )}

              {filtrados.length === 0 ? (
                <View style={styles.vazio}>
                  <IconPackage size={32} color={colors.textFaint} style={styles.vazioIcone} />
                  <Text style={styles.vazioTitulo}>{produtos.length === 0 ? 'Nenhum produto ativo' : 'Nada encontrado'}</Text>
                  <Text style={styles.vazioTexto}>
                    {produtos.length === 0 ? 'Cadastre produtos em Produtos para vendê-los no caixa.' : 'Tente outro nome ou categoria.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.grade}>
                  {filtrados.map(p => {
                    const status = statusEstoque(p.estoque_atual, p.estoque_minimo)
                    const qtd = noCarrinho.get(p.id_produto)
                    const zerado = status === 'zerado'
                    return (
                      <Pressable
                        key={p.id_produto}
                        onPress={() => adicionar(p)}
                        disabled={zerado}
                        accessibilityRole="button"
                        accessibilityLabel={`Adicionar ${p.nome}, ${formatarReais(p.preco_venda)}`}
                        accessibilityState={{ disabled: zerado }}
                        style={({ pressed }) => [styles.produto, { width: larguraDoCartao }, pressed && styles.produtoTocado]}
                      >
                        <View style={[styles.produtoFoto, zerado && styles.apagado]}>
                          {p.foto_url ? <Image source={{ uri: p.foto_url }} style={styles.produtoImagem} /> : <IconPackage size={30} color={colors.textFaint} />}
                        </View>
                        <View style={[styles.produtoInfo, zerado && styles.apagado]}>
                          <Text style={styles.produtoNome} numberOfLines={2}>{p.nome}</Text>
                          <Text style={[styles.produtoEstoque, status === 'baixo' && styles.estoqueBaixo, zerado && styles.estoqueZerado]}>
                            {zerado ? 'Sem estoque' : status === 'baixo' ? `Restam ${rotuloEstoque(p.estoque_atual, p.unidade_venda)}` : rotuloEstoque(p.estoque_atual, p.unidade_venda)}
                          </Text>
                          <View style={styles.produtoPrecoLinha}>
                            <Text style={styles.produtoPreco}>{formatarReais(p.preco_venda)}</Text>
                            {p.unidade_venda !== 'unidade' && <Text style={styles.produtoUnidade}>{sufixoUnidade(p.unidade_venda)}</Text>}
                          </View>
                        </View>
                        {qtd !== undefined && (
                          <View style={styles.produtoQtd}>
                            <Text style={styles.produtoQtdTexto}>{textoNumero(qtd)}</Text>
                          </View>
                        )}
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScreenContainer>

      {/* Fora do carrinho, o aviso de estoque aparece em cima da barra. */}
      {aviso && !carrinhoAberto && (
        <View style={[styles.avisoSolto, { bottom: 148 + insets.bottom }]} accessibilityRole="alert">
          <Text style={styles.avisoTexto}>{aviso}</Text>
        </View>
      )}

      {/* Barra do carrinho: fica acima da barra de abas. */}
      {carrinho.length > 0 && !carrinhoAberto && (
        <Pressable
          onPress={() => setCarrinhoAberto(true)}
          accessibilityRole="button"
          accessibilityLabel={`Abrir a venda atual, ${qtdLinhas} ${qtdLinhas === 1 ? 'item' : 'itens'}, ${formatarReais(total)}`}
          style={({ pressed }) => [styles.barra, { bottom: 84 + insets.bottom }, pressed && styles.barraTocada]}
        >
          <View style={styles.barraItens}>
            <IconCart size={20} color={colors.white} />
            <Text style={styles.barraTexto}>{qtdLinhas} {qtdLinhas === 1 ? 'item' : 'itens'}</Text>
          </View>
          <Text style={styles.barraTotal}>{formatarReais(total)}</Text>
        </Pressable>
      )}

      {/* ============ Carrinho: tela cheia ============ */}
      <Modal visible={carrinhoAberto} animationType="slide" onRequestClose={() => setCarrinhoAberto(false)}>
        <SafeAreaView style={styles.carrinho} edges={['top']}>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.carrinhoTopo}>
              <View style={styles.carrinhoTitulo}>
                <Pressable onPress={() => setCarrinhoAberto(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar aos produtos" style={styles.voltar}>
                  <IconChevronLeft size={15} color={colors.textMuted} />
                </Pressable>
                <Text style={styles.carrinhoTituloTexto}>Venda atual</Text>
                {qtdLinhas > 0 && (
                  <View style={styles.contagem}>
                    <Text style={styles.contagemTexto}>{qtdLinhas}</Text>
                  </View>
                )}
              </View>
              <Pressable
                onPress={limparVenda}
                disabled={qtdLinhas === 0 && !cliente}
                accessibilityRole="button"
                style={[styles.limpar, qtdLinhas === 0 && !cliente && styles.limparParado]}
              >
                <Text style={styles.limparTexto}>Limpar</Text>
              </Pressable>
            </View>

            {cliente ? (
              <View style={[styles.cliente, styles.clienteDefinido]}>
                <IconUser size={16} color={colors.text} />
                <Text style={styles.clienteNome} numberOfLines={1}>{cliente.nome}</Text>
                <Pressable onPress={() => setCliente(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remover cliente" style={styles.clienteX}>
                  <IconClose size={12} color="#858d99" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setClienteAberto(true)} accessibilityRole="button" style={styles.cliente}>
                <IconUser size={16} color={colors.textMuted} />
                <Text style={styles.clienteTexto}>Adicionar cliente (opcional)</Text>
              </Pressable>
            )}

            <ScrollView style={styles.flex} contentContainerStyle={[styles.itens, carrinho.length === 0 && styles.itensVazios]} keyboardShouldPersistTaps="handled">
              {carrinho.length === 0 ? (
                <View style={styles.carrinhoVazio}>
                  <IconCart size={34} color={colors.textFaint} style={styles.carrinhoVazioIcone} />
                  <Text style={styles.carrinhoVazioTitulo}>Carrinho vazio</Text>
                  <Text style={styles.carrinhoVazioTexto}>Toque em um produto para começar a venda.</Text>
                </View>
              ) : (
                carrinho.map((item, i) => {
                  const p = item.produto
                  const passo = passoQuantidade(p.unidade_venda)
                  const noMaximo = item.quantidade >= p.estoque_atual
                  return (
                    <View key={p.id_produto} style={[styles.item, i === carrinho.length - 1 && styles.itemUltimo]}>
                      <View style={styles.itemLinha}>
                        <Text style={styles.itemNome}>{p.nome}</Text>
                        <Text style={styles.itemTotal}>{formatarReais(subtotalLinha(item))}</Text>
                      </View>
                      <View style={styles.itemLinha}>
                        <Text style={styles.itemUnit}>{formatarReais(p.preco_venda)}{sufixoUnidade(p.unidade_venda)}</Text>
                        <View style={styles.itemControles}>
                          <View style={styles.qtd}>
                            <Pressable onPress={() => definirQuantidade(p.id_produto, item.quantidade - passo)} accessibilityRole="button" accessibilityLabel="Diminuir quantidade" style={styles.qtdBotao}>
                              <IconMinus size={14} color={colors.textMuted} />
                            </Pressable>
                            <CampoQtd key={item.quantidade} valor={item.quantidade} unidade={p.unidade_venda} onConfirmar={q => definirQuantidade(p.id_produto, q)} />
                            <Pressable
                              onPress={() => definirQuantidade(p.id_produto, item.quantidade + passo)}
                              disabled={noMaximo}
                              accessibilityRole="button"
                              accessibilityLabel="Aumentar quantidade"
                              style={[styles.qtdBotao, noMaximo && styles.qtdBotaoParado]}
                            >
                              <IconPlus size={14} color={colors.textMuted} />
                            </Pressable>
                          </View>
                          <Pressable onPress={() => setCarrinho(c => c.filter(x => x.produto.id_produto !== p.id_produto))} accessibilityRole="button" accessibilityLabel={`Remover ${p.nome}`} style={styles.remover}>
                            <IconTrash size={15} color="#858d99" />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  )
                })
              )}
            </ScrollView>

            {aviso && (
              <View style={styles.aviso} accessibilityRole="alert">
                <Text style={styles.avisoTexto}>{aviso}</Text>
              </View>
            )}

            <View style={[styles.rodape, { paddingBottom: Math.max(20, insets.bottom) }]}>
              <View style={styles.linha}>
                <Text style={styles.linhaRotulo}>Subtotal</Text>
                <Text style={styles.linhaValor}>{formatarReais(subtotal)}</Text>
              </View>

              {descontoAberto ? (
                <View style={styles.linha}>
                  <Text style={styles.linhaRotulo}>Desconto</Text>
                  <View style={styles.descontoEditor}>
                    <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel="Tipo de desconto">
                      {(['valor', 'percentual'] as const).map(t => (
                        <Pressable
                          key={t}
                          onPress={() => setDescontoTipo(t)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: descontoTipo === t }}
                          style={[styles.segBotao, descontoTipo === t && styles.segBotaoAtivo]}
                        >
                          <Text style={[styles.segTexto, descontoTipo === t && styles.segTextoAtivo]}>{t === 'valor' ? 'R$' : '%'}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      value={descontoTexto}
                      onChangeText={setDescontoTexto}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      autoFocus
                      accessibilityLabel="Valor do desconto"
                      style={styles.descontoCampo}
                    />
                    <Pressable onPress={() => { setDescontoAberto(false); setDescontoTexto('') }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remover desconto" style={styles.clienteX}>
                      <IconClose size={12} color="#858d99" />
                    </Pressable>
                  </View>
                </View>
              ) : descontoReais > 0 ? (
                <View style={styles.linha}>
                  <Text style={styles.linhaRotulo}>Desconto</Text>
                  <Text style={[styles.linhaValor, styles.descontoValor]}>− {formatarReais(descontoReais)}</Text>
                </View>
              ) : (
                <View style={styles.linha}>
                  <Pressable onPress={() => setDescontoAberto(true)} disabled={qtdLinhas === 0} accessibilityRole="button" style={qtdLinhas === 0 && styles.limparParado}>
                    <Text style={styles.adicionarDesconto}>+ Adicionar desconto</Text>
                  </Pressable>
                </View>
              )}
              {descontoAberto && descontoReais > 0 && (
                <View style={styles.linha}>
                  <View />
                  <Text style={[styles.linhaValor, styles.descontoValor]}>− {formatarReais(descontoReais)}</Text>
                </View>
              )}

              <View style={styles.total}>
                <Text style={styles.totalRotulo}>Total</Text>
                <Text style={styles.totalValor}>{formatarReais(total)}</Text>
              </View>

              <Pressable
                onPress={() => setCheckout(c => ({ ...c, aberto: true }))}
                disabled={carrinho.length === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: carrinho.length === 0 }}
                style={({ pressed }) => [styles.finalizar, (pressed || carrinho.length === 0) && styles.finalizarParado]}
              >
                <Text style={styles.finalizarTexto}>Finalizar venda</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>

        {/* As duas janelas abrem por cima do carrinho. */}
        <FolhaClientePdv
          visivel={clienteAberto}
          onEscolher={c => { setCliente(c); setClienteAberto(false) }}
          onFechar={() => setClienteAberto(false)}
        />
        <FolhaCheckoutPdv
          key={checkout.vez}
          visivel={checkout.aberto}
          itens={carrinho}
          desconto={desconto}
          cliente={cliente}
          formas={formas}
          nomeLoja={nomeLoja}
          onRegistrada={aoRegistrar}
          onEncerrar={encerrarCheckout}
          onFechar={() => setCheckout(c => ({ ...c, aberto: false }))}
        />
      </Modal>
    </View>
  )
}

function Chip({ rotulo, ativo, onPress }: { rotulo: string; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: ativo }} style={[styles.chip, ativo && styles.chipAtivo]}>
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  )
}

// Medidas do pdv.css do site em largura de celular (até 900px).
const styles = StyleSheet.create({
  tela: { flex: 1 },
  flex: { flex: 1 },
  // Sobra embaixo para a barra do carrinho não cobrir o último produto.
  conteudo: { paddingBottom: 32 + 76 },
  // `.pdv-cabecalho`: o resumo do dia e o histórico, à direita.
  cabecalho: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginBottom: 20 },
  hoje: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6.4, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  hojeTexto: { fontSize: 13, lineHeight: 20.8, color: colors.textMuted },
  hojeForte: { fontWeight: '700', color: colors.text },
  historico: { gap: 6 },
  principal: { gap: 16 },
  // `.pdv-busca`
  busca: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  buscaCampo: { flex: 1, height: '100%', fontSize: 16, color: colors.text },
  // `.pdv-categorias`: rola de lado, sem barra.
  categoriasRolagem: { flexGrow: 0 },
  categorias: { gap: 8, paddingBottom: 2 },
  chip: { height: 34, paddingHorizontal: 14.4, borderRadius: 17, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipAtivo: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  chipTexto: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colors.textMuted },
  chipTextoAtivo: { color: colors.white },
  // `.pdv-grade` e `.pdv-produto`
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  produto: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  produtoTocado: { transform: [{ scale: 0.985 }] },
  produtoFoto: { aspectRatio: 4 / 3, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  produtoImagem: { width: '100%', height: '100%' },
  produtoInfo: { padding: 12, gap: 2, minHeight: 88 },
  produtoNome: { fontSize: 14, lineHeight: 18.2, fontWeight: '600', color: colors.text },
  produtoEstoque: { fontSize: 12, lineHeight: 14.5, color: '#858d99' },
  estoqueBaixo: { color: colors.warningFg, fontWeight: '600' },
  estoqueZerado: { color: colors.dangerFg, fontWeight: '600' },
  produtoPrecoLinha: { flexDirection: 'row', alignItems: 'baseline', marginTop: 'auto', paddingTop: 8 },
  produtoPreco: { fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 20, fontWeight: '800', letterSpacing: -0.16, color: colors.text },
  produtoUnidade: { fontSize: 12, lineHeight: 20, fontWeight: '500', color: '#858d99' },
  produtoQtd: { position: 'absolute', top: 8, right: 8, minWidth: 26, height: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: colors.primary600, alignItems: 'center', justifyContent: 'center' },
  produtoQtdTexto: { fontSize: 13, lineHeight: 16, fontWeight: '700', color: colors.white },
  apagado: { opacity: 0.5 },
  // `.pdv-vazio`
  vazio: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 16 },
  vazioIcone: { marginBottom: 12 },
  vazioTitulo: { fontSize: 15, lineHeight: 24, fontWeight: '700', color: '#1f2937', marginBottom: 2 },
  vazioTexto: { fontSize: 15, lineHeight: 24, color: '#858d99', textAlign: 'center' },
  // `.pdv-barra-mobile`
  barra: { position: 'absolute', left: 16, right: 16, height: 56, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.primary600, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, shadowColor: colors.primary600, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  barraTocada: { opacity: 0.9 },
  barraItens: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barraTexto: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.white },
  barraTotal: { fontFamily: FONTE_TITULO, fontSize: 17, lineHeight: 27.2, fontWeight: '800', color: colors.white },
  avisoSolto: { position: 'absolute', left: 16, right: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: colors.warningBg },
  // ---------- Carrinho ----------
  carrinho: { flex: 1, backgroundColor: colors.surface },
  carrinhoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  carrinhoTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voltar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  carrinhoTituloTexto: { fontFamily: FONTE_TITULO, fontSize: 16, lineHeight: 25.6, fontWeight: '700', color: colors.text },
  contagem: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.primary50, alignItems: 'center', justifyContent: 'center' },
  contagemTexto: { fontSize: 12, lineHeight: 14, fontWeight: '700', color: colors.primary700 },
  limpar: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 4 },
  limparParado: { opacity: 0.4 },
  limparTexto: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: '#858d99' },
  // `.pdv-cliente`
  cliente: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginHorizontal: 20, paddingVertical: 8.8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted },
  clienteDefinido: { borderStyle: 'solid', borderColor: 'rgba(79,70,229,0.25)', backgroundColor: 'rgba(79,70,229,0.08)' },
  clienteTexto: { fontSize: 14, lineHeight: 17, color: colors.textMuted },
  clienteNome: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 17, fontWeight: '600', color: colors.text },
  clienteX: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  // `.pdv-itens` e `.pdv-item`
  itens: { paddingVertical: 8, paddingHorizontal: 20 },
  itensVazios: { flexGrow: 1 },
  item: { gap: 2, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemUltimo: { borderBottomWidth: 0 },
  itemLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  itemNome: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18.2, fontWeight: '600', color: colors.text },
  itemTotal: { fontSize: 14, lineHeight: 22.4, fontWeight: '700', color: colors.text },
  itemUnit: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 19.2, color: '#858d99' },
  itemControles: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtd: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  qtdBotao: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  qtdBotaoParado: { opacity: 0.35 },
  qtdCampo: { width: 44, height: 30, padding: 0, textAlign: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, fontSize: 14, fontWeight: '700', color: colors.text },
  remover: { width: 30, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  // `.pdv-carrinho-vazio`
  carrinhoVazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  carrinhoVazioIcone: { marginBottom: 4 },
  carrinhoVazioTitulo: { fontSize: 15, lineHeight: 24, fontWeight: '700', color: '#1f2937' },
  carrinhoVazioTexto: { fontSize: 14, lineHeight: 22.4, color: '#858d99', textAlign: 'center' },
  // `.pdv-aviso`
  aviso: { marginHorizontal: 20, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: colors.warningBg },
  avisoTexto: { fontSize: 13, lineHeight: 20.8, fontWeight: '500', color: colors.warningFg },
  // `.pdv-rodape`
  rodape: { paddingTop: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, gap: 8 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  linhaRotulo: { fontSize: 14, lineHeight: 22.4, color: colors.textMuted },
  linhaValor: { fontSize: 14, lineHeight: 22.4, fontWeight: '600', color: colors.text },
  descontoValor: { color: colors.successFg },
  adicionarDesconto: { fontSize: 14, lineHeight: 17, fontWeight: '600', color: colors.primary600 },
  descontoEditor: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seg: { flexDirection: 'row', padding: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted },
  segBotao: { height: 28, paddingHorizontal: 9.6, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  segBotaoAtivo: { backgroundColor: colors.surface, shadowColor: colors.black, shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segTexto: { fontSize: 13, lineHeight: 16, fontWeight: '700', color: '#858d99' },
  segTextoAtivo: { color: colors.primary700 },
  descontoCampo: { width: 84, height: 32, paddingVertical: 0, paddingHorizontal: 9.6, textAlign: 'right', borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, fontSize: 14, fontWeight: '600', color: colors.text },
  // `.pdv-total`
  total: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 8 },
  totalRotulo: { fontFamily: FONTE_TITULO, fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.textMuted },
  totalValor: { fontFamily: FONTE_TITULO, fontSize: 30, lineHeight: 48, fontWeight: '800', letterSpacing: -0.9, color: colors.text },
  // `.pdv-finalizar`
  finalizar: { height: 52, marginTop: 8, borderRadius: 6, backgroundColor: colors.primary600, alignItems: 'center', justifyContent: 'center' },
  finalizarParado: { opacity: 0.5 },
  finalizarTexto: { fontSize: 16, lineHeight: 16, fontWeight: '600', color: colors.white },
})
