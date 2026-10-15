import { useEffect, useMemo, useState } from 'react'
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Folha, depoisDeFechar } from '@/components/Folha'
import { SearchField } from '@/components/SearchField'
import { Seletor } from '@/components/Seletor'
import { Avatar } from '@/components/Avatar'
import { Botao } from '@/components/Botao'
import { EmptyState } from '@/components/EmptyState'
import { ProdutoCartao } from '@/components/ProdutoCartao'
import { IconArrowRight, IconChevronLeft, IconPackage } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { supabase } from '@/lib/supabase'
import { hojeBrasilISO } from '@/lib/agenda'
import { formatarMoeda, linkWhatsApp } from '@/lib/format'
import {
  COLUNAS_MARKETPLACE, COLUNAS_MARKETPLACE_MINIMAS, escaparIlike, nomeCategoria, normalizarBusca,
  palavrasBusca, precoDoProduto, relevancia, unidadeCurta, type LojaMarketplace, type ProdutoMarketplace,
} from '@/lib/marketplace'
import { colors, radius, spacing, typography } from '@/theme/theme'

type Ordem = 'relevancia' | 'menor_preco' | 'maior_preco' | 'desconto'
const ORDENS: { valor: Ordem; rotulo: string }[] = [
  { valor: 'relevancia', rotulo: 'Mais relevantes' },
  { valor: 'menor_preco', rotulo: 'Menor preço' },
  { valor: 'maior_preco', rotulo: 'Maior preço' },
  { valor: 'desconto', rotulo: 'Maior desconto' },
]
const LIMITE_VITRINE = 240
const LIMITE_BUSCA = 120
const MAX_FILEIRA = 8
const LARGURA_FILEIRA = 160

// Aba "Produtos" da tela Petshops do cliente — a mesma busca do site
// (petshop-app/src/components/cliente/BuscaProdutos.tsx, migration 098):
// sem busca, "Em promoção" e uma fileira por petshop; buscando, os
// produtos separados por petshop (ou juntos, ordenados por preço). O
// produto abre o painel com o preço, o petshop e como comprar.
export function BuscaProdutosMarketplace({ lojas, onComprar }: {
  lojas: LojaMarketplace[]
  // "Comprar ao agendar": abre o agendamento da loja com o produto no pedido.
  onComprar: (loja: LojaMarketplace, produto: ProdutoMarketplace) => void
}) {
  const [termo, setTermo] = useState('')
  const [idLoja, setIdLoja] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('relevancia')
  const [produtos, setProdutos] = useState<ProdutoMarketplace[]>([])
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro' | 'indisponivel'>('carregando')
  const [atualizando, setAtualizando] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [aberto, setAberto] = useState<ProdutoMarketplace | null>(null)
  const [hoje] = useState(hojeBrasilISO)

  const palavras = useMemo(() => palavrasBusca(termo), [termo])
  const chaveBusca = palavras.join(' ')
  const buscando = chaveBusca.length >= 2
  const idsLojas = useMemo(() => lojas.map(l => l.id), [lojas])
  const lojaPorId = useMemo(() => new Map(lojas.map(l => [l.id, l])), [lojas])

  useEffect(() => {
    if (idsLojas.length === 0) return
    let cancelado = false
    const ws = buscando ? chaveBusca.split(' ') : []
    const ids = idLoja ? [idLoja] : idsLojas
    const limite = ws.length > 0 || idLoja ? LIMITE_BUSCA : LIMITE_VITRINE
    const t = setTimeout(async () => {
      setAtualizando(true)
      const consultar = (colunas: string, campo: 'nome_busca' | 'nome') => {
        let q = supabase
          .from('produto')
          .select(colunas)
          .eq('disponivel_marketplace', true)
          .eq('status', 'Ativo')
          .is('excluido_em', null)
          .gt('estoque_atual', 0)
          .in('id_lojista', ids)
          .order('nome')
          .limit(limite)
        for (const w of ws) q = q.ilike(campo, `%${escaparIlike(w)}%`)
        return q
      }
      let r = await consultar(COLUNAS_MARKETPLACE, 'nome_busca')
      if (r.error) r = await consultar(COLUNAS_MARKETPLACE_MINIMAS, 'nome')
      if (cancelado) return
      setAtualizando(false)
      if (r.error) {
        setProdutos([])
        setEstado(/disponivel_marketplace/i.test(r.error.message) ? 'indisponivel' : 'erro')
        return
      }
      setProdutos((r.data ?? []) as unknown as ProdutoMarketplace[])
      setEstado('pronto')
    }, ws.length > 0 ? 280 : 0)
    return () => { cancelado = true; clearTimeout(t) }
  }, [chaveBusca, buscando, idLoja, idsLojas, tentativa])

  const categorias = useMemo(() => {
    const cont = new Map<string, { rotulo: string; n: number }>()
    for (const p of produtos) {
      const nome = nomeCategoria(p)
      if (!nome) continue
      const chave = normalizarBusca(nome)
      const atual = cont.get(chave)
      if (atual) atual.n++
      else cont.set(chave, { rotulo: nome, n: 1 })
    }
    return [...cont.entries()]
      .map(([chave, v]) => ({ chave, ...v }))
      .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  }, [produtos])
  const categoriaAtiva = categorias.some(c => c.chave === categoria) ? categoria : ''

  const lista = useMemo(() => {
    const ws = buscando ? palavras : []
    const final = (p: ProdutoMarketplace) => precoDoProduto(p, hoje).final
    const desconto = (p: ProdutoMarketplace) => precoDoProduto(p, hoje).desconto
    return produtos
      .filter(p => !categoriaAtiva || normalizarBusca(nomeCategoria(p) ?? '') === categoriaAtiva)
      .sort((a, b) => {
        if (ordem === 'menor_preco') return final(a) - final(b)
        if (ordem === 'maior_preco') return final(b) - final(a)
        if (ordem === 'desconto') return desconto(b) - desconto(a) || final(a) - final(b)
        return relevancia(a, ws) - relevancia(b, ws) || a.nome.localeCompare(b.nome, 'pt-BR')
      })
  }, [produtos, categoriaAtiva, ordem, buscando, palavras, hoje])

  const vitrine = !buscando && !idLoja && !categoriaAtiva && ordem === 'relevancia'
  const filtrando = buscando || !!idLoja || !!categoriaAtiva || ordem !== 'relevancia'
  const lojaFiltro = idLoja ? lojaPorId.get(idLoja) ?? null : null
  const porLoja = useMemo(() => lojas
    .map(loja => ({ loja, itens: lista.filter(p => p.id_lojista === loja.id) }))
    .filter(g => g.itens.length > 0), [lojas, lista])
  const emPromocao = useMemo(() => lista
    .filter(p => precoDoProduto(p, hoje).desconto > 0)
    .sort((a, b) => precoDoProduto(b, hoje).desconto - precoDoProduto(a, hoje).desconto)
    .slice(0, MAX_FILEIRA), [lista, hoje])

  const limpar = () => { setTermo(''); setIdLoja(''); setCategoria(''); setOrdem('relevancia') }
  const total = lista.length
  const qtd = (n: number) => `${n} ${n === 1 ? 'produto' : 'produtos'}`

  const cartao = (p: ProdutoMarketplace, sub: 'loja' | 'categoria', naFileira?: boolean) => {
    const { cheio, desconto, final } = precoDoProduto(p, hoje)
    return (
      <ProdutoCartao
        key={p.id_produto}
        nome={p.nome}
        categoria={sub === 'loja' ? lojaPorId.get(p.id_lojista)?.nome ?? null : nomeCategoria(p) ?? ' '}
        foto={p.foto_url}
        preco={formatarMoeda(final)}
        precoAntigo={desconto > 0 ? formatarMoeda(cheio) : null}
        promo={desconto}
        unidade={unidadeCurta(p.unidade_venda)}
        pe={naFileira ? undefined : p.disponivel_agendamento_online ? 'Leve no agendamento' : 'Compra na loja'}
        acessivel={`${p.nome}, ${formatarMoeda(final)}. Ver detalhes`}
        onPress={() => setAberto(p)}
        style={naFileira ? styles.cardFileira : undefined}
      />
    )
  }

  const grade = (itens: ProdutoMarketplace[], sub: 'loja' | 'categoria') => (
    <View style={styles.grade}>
      {itens.map(p => <View key={p.id_produto} style={styles.gradeCaixa}>{cartao(p, sub)}</View>)}
    </View>
  )

  const fileira = (itens: ProdutoMarketplace[], sub: 'loja' | 'categoria') => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fileira} contentContainerStyle={styles.fileiraConteudo}>
      {itens.slice(0, MAX_FILEIRA).map(p => cartao(p, sub, true))}
    </ScrollView>
  )

  if (lojas.length === 0) {
    return <EmptyState icon="cube-outline" title="Nenhum petshop disponível" subtitle="Quando houver petshops na plataforma, os produtos deles aparecem aqui." />
  }

  const aberta = aberto ? lojaPorId.get(aberto.id_lojista) ?? null : null

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <SearchField value={termo} onChangeText={setTermo} placeholder="Buscar ração, shampoo, coleira..." />
        <View style={styles.selects}>
          <Seletor
            titulo="Petshop"
            valor={idLoja}
            opcoes={[{ valor: '', rotulo: 'Todos os petshops' }, ...lojas.map(l => ({ valor: l.id, rotulo: l.nome }))]}
            onChange={v => { setIdLoja(v); setCategoria('') }}
            style={{ flex: 1 }}
          />
          <Seletor titulo="Ordenar" valor={ordem} opcoes={ORDENS} onChange={setOrdem} style={{ flex: 1 }} />
        </View>
        {categorias.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fileira} contentContainerStyle={styles.chips}>
            <Chip rotulo="Todas" ativo={!categoriaAtiva} onPress={() => setCategoria('')} />
            {categorias.map(c => (
              <Chip key={c.chave} rotulo={c.rotulo} n={c.n} ativo={categoriaAtiva === c.chave} onPress={() => setCategoria(categoriaAtiva === c.chave ? '' : c.chave)} />
            ))}
          </ScrollView>
        )}
      </View>

      {lojaFiltro && (
        <View style={styles.lojaDestaque}>
          <Pressable onPress={() => setIdLoja('')} accessibilityRole="button" style={styles.voltar} hitSlop={8}>
            <IconChevronLeft size={14} color={colors.textMuted} />
            <Text style={styles.voltarTexto}>Todos os petshops</Text>
          </Pressable>
          <CabecalhoLoja loja={lojaFiltro} detalhe={estado === 'pronto' ? qtd(total) : null} />
        </View>
      )}

      {estado === 'carregando' ? (
        <View style={styles.grade}>
          {Array.from({ length: 4 }, (_, i) => <View key={i} style={styles.gradeCaixa}><View style={styles.esqueleto} /></View>)}
        </View>
      ) : estado !== 'pronto' ? (
        <View style={{ gap: spacing.md, alignItems: 'center' }}>
          <EmptyState
            icon="cube-outline"
            title={estado === 'indisponivel' ? 'Busca de produtos em breve' : 'Não foi possível carregar os produtos'}
            subtitle={estado === 'indisponivel' ? 'Os petshops ainda estão preparando a vitrine de produtos.' : 'Verifique a sua conexão e tente de novo.'}
          />
          {estado === 'erro' && <Botao rotulo="Tentar de novo" variante="secundario" compacto onPress={() => setTentativa(n => n + 1)} />}
        </View>
      ) : total === 0 ? (
        <View style={{ gap: spacing.md, alignItems: 'center' }}>
          <EmptyState
            icon="search-outline"
            title={filtrando ? 'Nenhum produto encontrado' : 'Ainda não há produtos por aqui'}
            subtitle={buscando
              ? 'Confira o que foi digitado ou procure por outro nome.'
              : idLoja ? 'Este petshop ainda não colocou produtos à venda aqui.' : 'Os petshops ainda não colocaram produtos à venda no marketplace.'}
          />
          {filtrando && <Botao rotulo="Limpar filtros" variante="secundario" compacto onPress={limpar} />}
        </View>
      ) : vitrine ? (
        <View style={[styles.secoes, atualizando && styles.atualizando]}>
          {emPromocao.length > 0 && (
            <View style={styles.secao}>
              <View style={styles.secaoTopo}>
                <Text style={styles.secaoTitulo}>Em promoção</Text>
                <Link rotulo="Ver todas" onPress={() => setOrdem('desconto')} />
              </View>
              {fileira(emPromocao, 'loja')}
            </View>
          )}
          {porLoja.map(({ loja, itens }) => (
            <View key={loja.id} style={styles.secao}>
              <CabecalhoLoja loja={loja} detalhe={qtd(itens.length)} acao={<Link rotulo="Ver todos" onPress={() => setIdLoja(loja.id)} />} />
              {fileira(itens, 'categoria')}
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.secoes, atualizando && styles.atualizando]}>
          <View style={styles.secaoTopo}>
            <Text style={styles.contagem} numberOfLines={1}>{qtd(total)}{buscando ? ` para “${termo.trim()}”` : ''}</Text>
            {filtrando && <Link rotulo="Limpar filtros" onPress={limpar} semSeta />}
          </View>
          {!idLoja && ordem === 'relevancia'
            ? porLoja.map(({ loja, itens }) => (
              <View key={loja.id} style={styles.secao}>
                <CabecalhoLoja loja={loja} detalhe={qtd(itens.length)} acao={<Link rotulo="Ver loja" onPress={() => setIdLoja(loja.id)} />} />
                {grade(itens, 'categoria')}
              </View>
            ))
            : grade(lista, idLoja ? 'categoria' : 'loja')}
        </View>
      )}

      <Folha visivel={!!aberto} titulo="Detalhes do produto" onFechar={() => setAberto(null)}>
        {aberto && aberta && (
          <DetalheProduto
            produto={aberto}
            loja={aberta}
            hoje={hoje}
            onComprar={() => { const p = aberto; setAberto(null); depoisDeFechar(() => onComprar(aberta, p)) }}
          />
        )}
      </Folha>
    </View>
  )
}

function Chip({ rotulo, n, ativo, onPress }: { rotulo: string; n?: number; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: ativo }} style={[styles.chip, ativo && styles.chipAtivo]}>
      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
        {rotulo}{n != null && <Text style={[styles.chipQtd, ativo && styles.chipTextoAtivo]}>  {n}</Text>}
      </Text>
    </Pressable>
  )
}

function Link({ rotulo, onPress, semSeta }: { rotulo: string; onPress: () => void; semSeta?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={styles.link}>
      <Text style={styles.linkTexto}>{rotulo}</Text>
      {!semSeta && <IconArrowRight size={14} color={colors.primary600} />}
    </Pressable>
  )
}

function Status({ loja, detalhe }: { loja: LojaMarketplace; detalhe?: string | null }) {
  return (
    <View style={styles.statusLinha}>
      <View style={[styles.ponto, { backgroundColor: loja.status.aberto ? colors.success : colors.textFaint }]} />
      <Text style={styles.statusTexto} numberOfLines={1}>{[loja.status.rotulo, loja.local, detalhe].filter(Boolean).join(' · ')}</Text>
    </View>
  )
}

function CabecalhoLoja({ loja, detalhe, acao }: { loja: LojaMarketplace; detalhe: string | null; acao?: React.ReactNode }) {
  return (
    <View style={styles.loja}>
      <Avatar nome={loja.nome} fotoUrl={loja.logoUrl} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.lojaNome} numberOfLines={1}>{loja.nome}</Text>
        <Status loja={loja} detalhe={detalhe} />
      </View>
      {acao}
    </View>
  )
}

function DetalheProduto({ produto, loja, hoje, onComprar }: { produto: ProdutoMarketplace; loja: LojaMarketplace; hoje: string; onComprar: () => void }) {
  const { cheio, desconto, final } = precoDoProduto(produto, hoje)
  const unidade = unidadeCurta(produto.unidade_venda)
  const categoria = nomeCategoria(produto)
  const whats = linkWhatsApp(loja.telefone, `Olá! Vi o produto "${produto.nome}" da ${loja.nome} no SAIP. Ainda tem disponível?`)
  const online = produto.disponivel_agendamento_online
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.detFoto}>
        {produto.foto_url
          ? <Image source={{ uri: produto.foto_url }} style={styles.detImagem} resizeMode="cover" />
          : <IconPackage size={44} color={colors.primary300} />}
        {desconto > 0 && (
          <View style={styles.detSelo}><Text style={styles.detSeloTexto}>-{desconto}%</Text></View>
        )}
      </View>

      <View style={{ gap: 4 }}>
        <Text style={styles.detNome}>{produto.nome}</Text>
        <Text style={styles.detSub}>{[categoria, `Vendido por ${unidade}`].filter(Boolean).join(' · ')}</Text>
        <View style={styles.detPrecoLinha}>
          {desconto > 0 && <Text style={styles.detPrecoAntigo}>{formatarMoeda(cheio)}</Text>}
          <Text style={styles.detPreco}>{formatarMoeda(final)}</Text>
          <Text style={styles.detUnidade}>/ {unidade}</Text>
        </View>
        {desconto > 0 && (
          <View style={styles.economia}><Text style={styles.economiaTexto}>Você economiza {formatarMoeda(cheio - final)}</Text></View>
        )}
      </View>

      <View style={styles.detLoja}>
        <Avatar nome={loja.nome} fotoUrl={loja.logoUrl} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.lojaNome} numberOfLines={1}>{loja.nome}</Text>
          <Status loja={loja} />
        </View>
      </View>

      <Text style={styles.detComo}>
        {online
          ? 'Você escolhe o serviço e o horário no agendamento da loja, e o produto já vai junto no mesmo pedido.'
          : 'Este produto é vendido direto na loja. Fale com o petshop para reservar ou combinar a retirada.'}
      </Text>

      <View style={{ gap: spacing.sm }}>
        {online && <Botao rotulo="Comprar ao agendar" icone="calendar-outline" onPress={onComprar} />}
        {whats && (
          <Botao
            rotulo={online ? 'Falar no WhatsApp' : 'Reservar pelo WhatsApp'}
            icone="logo-whatsapp"
            variante={online ? 'secundario' : 'primario'}
            onPress={() => Linking.openURL(whats)}
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  selects: { flexDirection: 'row', gap: spacing.sm },
  // Rola de ponta a ponta da tela (o ScreenContainer tem 16 de respiro).
  fileira: { marginHorizontal: -spacing.lg },
  fileiraConteudo: { paddingHorizontal: spacing.lg, paddingBottom: 4, gap: spacing.md },
  cardFileira: { flex: 0, width: LARGURA_FILEIRA },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  chip: { height: 34, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipAtivo: { borderColor: colors.primary200, backgroundColor: 'rgba(79,70,229,0.08)' },
  chipTexto: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipQtd: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  chipTextoAtivo: { color: colors.primary600 },

  secoes: { gap: spacing['2xl'] },
  atualizando: { opacity: 0.55 },
  secao: { gap: spacing.md },
  secaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  secaoTitulo: { ...typography.heading.sm, fontSize: 17, fontWeight: '700', color: colors.text },
  contagem: { flex: 1, fontSize: 14, color: colors.textMuted },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkTexto: { fontSize: 14, fontWeight: '600', color: colors.primary600 },

  loja: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lojaNome: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text },
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  statusTexto: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textDim },
  lojaDestaque: { gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  voltarTexto: { fontSize: 13, fontWeight: '600', color: colors.textMuted },

  grade: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  gradeCaixa: { width: '50%', padding: 6 },
  esqueleto: { height: 230, borderRadius: 14, backgroundColor: colors.surfaceMuted },

  detFoto: { aspectRatio: 16 / 10, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(79,70,229,0.12)' },
  detImagem: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  detSelo: { position: 'absolute', left: 10, bottom: 10, paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.full, backgroundColor: colors.success },
  detSeloTexto: { fontSize: 12, fontWeight: '800', color: colors.white },
  detNome: { ...typography.heading.md, color: colors.text },
  detSub: { fontSize: 13, lineHeight: 18, color: colors.textDim },
  detPrecoLinha: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  detPrecoAntigo: { fontSize: 15, color: colors.textDim, textDecorationLine: 'line-through' },
  detPreco: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  detUnidade: { fontSize: 14, color: colors.textDim },
  economia: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.full, backgroundColor: colors.successBg },
  economiaTexto: { fontSize: 13, fontWeight: '700', color: colors.successFg },
  detLoja: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  detComo: { ...typography.body.md, color: colors.textMuted },
})
