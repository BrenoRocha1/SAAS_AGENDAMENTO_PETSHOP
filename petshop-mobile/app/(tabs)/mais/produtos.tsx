import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Alert, StyleSheet, Text, View } from 'react-native'
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
import { Segmentos } from '@/components/Opcao'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { mensagemDoBanco } from '@/lib/erros'
import { formatarMoeda } from '@/lib/format'
import { ROTULO_STATUS_ESTOQUE, erroQuantidadeInteira, rotuloEstoque, rotuloUnidade, statusEstoque, unidadeFracionavel, type StatusEstoque } from '@/lib/produto'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Produto {
  id_produto: string
  nome: string
  unidade_venda: string
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  status: 'Ativo' | 'Inativo'
}

const COR_ESTOQUE: Record<StatusEstoque, { fundo: string; texto: string }> = {
  zerado: { fundo: colors.dangerBg, texto: colors.dangerFg },
  baixo: { fundo: colors.warningBg, texto: colors.warningFg },
  em_estoque: { fundo: colors.successBg, texto: colors.successFg },
}

type Filtro = 'todos' | 'baixo' | 'inativos'

// Catálogo e estoque da loja (tabela `produto`, migration 037). Pelo
// celular: consultar, dar entrada/saída de estoque (fn_movimentar_estoque,
// a mesma do painel web) e ativar/desativar. Cadastro, preço, custo,
// categoria e foto ficam no painel web.
export default function ProdutosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.podeGerenciarProdutos
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')

  // Painel de movimentação.
  const [aberto, setAberto] = useState<Produto | null>(null)
  const [tipo, setTipo] = useState<'entrada' | 'saida'>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erroPainel, setErroPainel] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const { data, error } = await supabase.from('produto').select('*').eq('id_lojista', idLojista).order('nome')
    if (error) {
      setErro('Não foi possível carregar os produtos.')
    } else {
      setErro(null)
      setProdutos(((data ?? []) as Produto[]).map(p => ({
        ...p,
        preco_venda: Number(p.preco_venda),
        estoque_atual: Number(p.estoque_atual),
        estoque_minimo: Number(p.estoque_minimo),
      })))
    }
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

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

  function abrir(p: Produto) {
    setAberto(p)
    setTipo('entrada')
    setQuantidade('')
    setMotivo('')
    setErroPainel(null)
  }

  async function movimentar() {
    if (!aberto) return
    const qtd = Number(quantidade.replace(',', '.'))
    if (!quantidade.trim() || !Number.isFinite(qtd) || qtd <= 0) {
      setErroPainel('Informe uma quantidade maior que zero.')
      return
    }
    const erroInteiro = erroQuantidadeInteira(aberto.unidade_venda, qtd)
    if (erroInteiro) {
      setErroPainel(erroInteiro)
      return
    }
    if (motivo.length > 200) {
      setErroPainel('Motivo muito longo (até 200 letras).')
      return
    }
    setErroPainel(null)
    setEnviando(true)
    const { error } = await supabase.rpc('fn_movimentar_estoque', {
      p_id_produto: aberto.id_produto,
      p_tipo: tipo,
      p_quantidade: qtd,
      p_motivo: motivo.trim() || null,
    })
    setEnviando(false)
    if (error) {
      setErroPainel(mensagemDoBanco(error, 'Não foi possível movimentar o estoque.'))
      return
    }
    setAberto(null)
    carregar()
  }

  async function alternarStatus(p: Produto) {
    if (!idLojista) return
    const novo = p.status === 'Ativo' ? 'Inativo' : 'Ativo'
    setErroPainel(null)
    setEnviando(true)
    const { data, error } = await supabase
      .from('produto')
      .update({ status: novo })
      .eq('id_produto', p.id_produto)
      .eq('id_lojista', idLojista)
      .select('id_produto')
    setEnviando(false)
    if (error || !data || data.length === 0) {
      setErroPainel(error ? mensagemDoBanco(error, 'Erro ao atualizar o produto.') : 'Você não tem permissão para alterar este produto.')
      return
    }
    setAberto(null)
    carregar()
  }

  function pedirStatus(p: Produto) {
    if (p.status === 'Inativo') {
      alternarStatus(p)
      return
    }
    Alert.alert('Desativar produto', `${p.nome} deixa de aparecer para venda no agendamento online. Continuar?`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Desativar', style: 'destructive', onPress: () => alternarStatus(p) },
    ])
  }

  return (
    <ScreenContainer refreshing={loading} onRefresh={carregar}>
      <DetailHeader title="Produtos" />

      <View style={{ gap: spacing.md }}>
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
      </View>

      <View style={styles.lista}>
        {erro ? (
          <EmptyState icon="alert-circle-outline" title="Não foi possível carregar" subtitle={erro} />
        ) : visiveis.length === 0 && !loading ? (
          <EmptyState
            icon="cube-outline"
            title={produtos.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto encontrado'}
            subtitle={produtos.length === 0 ? 'Cadastre os produtos pelo painel web — eles aparecem aqui.' : 'Tente outro nome ou outro filtro.'}
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

      <Folha visivel={!!aberto} titulo={aberto?.nome ?? 'Produto'} onFechar={() => setAberto(null)} ocupado={enviando}>
        {aberto && (
          <>
            <Text style={styles.sub}>
              Em estoque: {rotuloEstoque(aberto.estoque_atual, aberto.unidade_venda)}
              {aberto.estoque_minimo > 0 ? ` · mínimo ${rotuloEstoque(aberto.estoque_minimo, aberto.unidade_venda)}` : ''}
            </Text>
            {erroPainel && <Aviso tipo="erro" texto={erroPainel} />}
            <Segmentos
              valor={tipo}
              onChange={setTipo}
              opcoes={[{ valor: 'entrada', rotulo: 'Entrada (chegou)' }, { valor: 'saida', rotulo: 'Saída (baixa)' }]}
            />
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
  estoqueCol: { alignItems: 'flex-end', gap: 4 },
  estoque: { ...typography.label.md, color: colors.text },
  selo: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
})
