import { useRef, useState, type ComponentType } from 'react'
import * as Clipboard from 'expo-clipboard'
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Folha } from '@/components/Folha'
import { IconCheck, IconCopy, IconCreditCard, IconMoney, IconPrinter, IconQrCode, type IconeProps } from '@/components/IconesDoSite'
import { Text, TextInput } from '@/components/Texto'
import {
  FORMAS_PAGAMENTO,
  ROTULO_FORMA_PAGAMENTO,
  formasAtivas,
  rotuloForma,
  type FormaPagamento,
  type FormasLoja,
} from '@/lib/pagamento'
import {
  centavos,
  dataHoraVenda,
  descontoEmReais,
  lerValorDigitado,
  mensagemPdv,
  rotuloNumeroVenda,
  subtotalLinha,
  sugestoesRecebido,
  textoQuantidade,
  totalVenda,
  type ClientePdv,
  type DescontoPdv,
  type ItemCarrinho,
  type VendaRegistrada,
} from '@/lib/pdv'
import { supabase } from '@/lib/supabase'
import { formatarReais } from '@/lib/taxidog'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors } from '@/theme/theme'

const ICONE_FORMA: Record<FormaPagamento, ComponentType<IconeProps>> = {
  pix: IconQrCode,
  dinheiro: IconMoney,
  cartao_credito: IconCreditCard,
  cartao_debito: IconCreditCard,
}

interface Comprovante {
  venda: VendaRegistrada
  itens: ItemCarrinho[]
  subtotal: number
  desconto: number
  forma: FormaPagamento
  recebido: number | null
  cliente: ClientePdv | null
  quando: Date
}

interface Props {
  visivel: boolean
  itens: ItemCarrinho[]
  desconto: DescontoPdv
  cliente: ClientePdv | null
  formas: FormasLoja
  nomeLoja: string
  // Chamado uma vez, assim que o banco confirma a venda (a tela limpa o carrinho e baixa o estoque local).
  onRegistrada: (itens: ItemCarrinho[], venda: VendaRegistrada) => void
  // "Nova venda" / fechar depois de concluída.
  onEncerrar: () => void
  onFechar: () => void
}

const valorNoCampo = (v: number) => v.toFixed(2).replace('.', ',')

// O recibo em texto, com as mesmas linhas do recibo impresso do site.
function textoDoRecibo(c: Comprovante, nomeLoja: string): string {
  const data = dataHoraVenda(c.quando, true, true)
  const linhas = [nomeLoja, `Venda ${rotuloNumeroVenda(c.venda.numero)} · ${data}`]
  if (c.cliente) linhas.push(`Cliente: ${c.cliente.nome}`)
  linhas.push('--------------------------------')
  for (const i of c.itens) {
    linhas.push(i.produto.nome)
    linhas.push(`  ${textoQuantidade(i.quantidade, i.produto.unidade_venda)} × ${formatarReais(i.produto.preco_venda)}  =  ${formatarReais(subtotalLinha(i))}`)
  }
  linhas.push('--------------------------------')
  linhas.push(`Subtotal: ${formatarReais(c.subtotal)}`)
  if (c.desconto > 0) linhas.push(`Desconto: -${formatarReais(c.desconto)}`)
  linhas.push(`TOTAL: ${formatarReais(c.venda.total)}`)
  linhas.push('--------------------------------')
  linhas.push(`Pagamento: ${rotuloForma(c.forma)}`)
  if (c.recebido !== null) {
    linhas.push(`Recebido: ${formatarReais(c.recebido)}`)
    linhas.push(`Troco: ${formatarReais(c.venda.troco)}`)
  }
  linhas.push('--------------------------------')
  linhas.push('Obrigado pela preferência!')
  linhas.push('Comprovante não fiscal')
  return linhas.join('\n')
}

// Finalizar a venda — a janela do caixa do site (CheckoutModal): total,
// forma de pagamento (com troco no dinheiro e a chave no Pix), confirmação
// e, depois, a venda concluída com o recibo.
export function FolhaCheckoutPdv({ visivel, itens, desconto, cliente, formas, nomeLoja, onRegistrada, onEncerrar, onFechar }: Props) {
  const ativas = formasAtivas(formas)
  const [escolhida, setForma] = useState<FormaPagamento | null>(null)
  // Sem escolha (ou com uma que a loja não aceita), vale a primeira ativa.
  const forma = escolhida && ativas.includes(escolhida) ? escolhida : (ativas[0] ?? null)
  const [recebidoTexto, setRecebidoTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [comprovante, setComprovante] = useState<Comprovante | null>(null)
  const [copiado, setCopiado] = useState(false)
  const enviandoRef = useRef(false)

  const subtotal = centavos(itens.reduce((s, i) => s + subtotalLinha(i), 0))
  const descontoReais = descontoEmReais(subtotal, desconto)
  const total = totalVenda(subtotal, descontoReais)

  const recebido = lerValorDigitado(recebidoTexto)
  // Campo vazio = valor exato (sem troco).
  const recebidoEfetivo = recebidoTexto.trim() === '' ? total : recebido
  const troco = centavos(recebidoEfetivo - total)
  const faltando = forma === 'dinheiro' && recebidoEfetivo < total

  async function confirmar() {
    if (!forma || enviandoRef.current || faltando) return
    enviandoRef.current = true
    setEnviando(true)
    setErro(null)
    const vendidos = itens
    const { data, error } = await supabase.rpc('fn_registrar_venda_pdv', {
      p_itens: vendidos.map(i => ({ id_produto: i.produto.id_produto, quantidade: i.quantidade })),
      p_desconto: descontoReais,
      p_forma: forma,
      p_valor_recebido: forma === 'dinheiro' ? recebidoEfetivo : null,
      p_id_cliente: cliente?.id_cliente ?? null,
    })
    enviandoRef.current = false
    setEnviando(false)
    if (error || !data) return setErro(mensagemPdv(error, 'Não foi possível registrar a venda. Tente novamente.'))

    const r = data as { id_venda: string; numero: number | string; total: number | string; troco: number | string | null }
    const venda: VendaRegistrada = { id_venda: r.id_venda, numero: Number(r.numero), total: Number(r.total), troco: Number(r.troco ?? 0) }
    setComprovante({
      venda,
      itens: vendidos,
      subtotal,
      desconto: descontoReais,
      forma,
      recebido: forma === 'dinheiro' ? recebidoEfetivo : null,
      cliente,
      quando: new Date(),
    })
    onRegistrada(vendidos, venda)
  }

  async function copiarPix() {
    if (!formas.pix_chave) return
    try {
      await Clipboard.setStringAsync(formas.pix_chave)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch { /* área de transferência indisponível */ }
  }

  // No celular o recibo sai pela folha de compartilhar (WhatsApp, impressora
  // do aparelho…); no navegador, abre para imprimir.
  async function recibo(c: Comprovante) {
    const texto = textoDoRecibo(c, nomeLoja)
    if (Platform.OS === 'web') {
      const janela = window.open('', '_blank', 'width=380,height=600')
      if (!janela) return
      janela.document.write(`<pre style="font: 12px/1.45 ui-monospace, monospace; white-space: pre-wrap">${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`)
      janela.document.close()
      janela.print()
      return
    }
    try { await Share.share({ message: texto }) } catch { /* a pessoa desistiu */ }
  }

  function encerrar() {
    setComprovante(null)
    setRecebidoTexto('')
    setErro(null)
    onEncerrar()
  }

  // ---------- Venda concluída ----------
  if (comprovante) {
    const c = comprovante
    return (
      <Folha visivel={visivel} titulo="Venda concluída" onFechar={encerrar}>
        <View style={styles.sucesso}>
          <View style={styles.sucessoIcone}>
            <IconCheck size={30} color={colors.success} />
          </View>
          <Text style={styles.sucessoTitulo}>Venda {rotuloNumeroVenda(c.venda.numero)} concluída</Text>
          <Text style={styles.sucessoValor}>{formatarReais(c.venda.total)}</Text>
          <Text style={styles.sucessoTexto}>{rotuloForma(c.forma)}{c.cliente ? ` · ${c.cliente.nome}` : ''}</Text>
          {c.forma === 'dinheiro' && c.venda.troco > 0 && (
            <View style={[styles.troco, styles.trocoOk, styles.trocoInteiro]}>
              <Text style={[styles.trocoRotulo, styles.textoOk]}>Troco a devolver</Text>
              <Text style={[styles.trocoValor, styles.textoOk]}>{formatarReais(c.venda.troco)}</Text>
            </View>
          )}
        </View>
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo="Nova venda" onPress={encerrar} />
          <BotaoPequeno
            normal
            variante="fantasma"
            rotulo={Platform.OS === 'web' ? 'Imprimir recibo' : 'Compartilhar recibo'}
            icone={IconPrinter}
            tamanhoDoIcone={16}
            onPress={() => recibo(c)}
          />
        </View>
      </Folha>
    )
  }

  // ---------- Pagamento ----------
  return (
    <Folha visivel={visivel} titulo="Finalizar venda" onFechar={onFechar} ocupado={enviando}>
      <View style={styles.total}>
        <Text style={styles.totalRotulo}>Total a pagar</Text>
        <Text style={styles.totalValor}>{formatarReais(total)}</Text>
        <Text style={styles.totalApoio}>
          {itens.length} {itens.length === 1 ? 'produto' : 'produtos'}
          {descontoReais > 0 ? ` · desconto de ${formatarReais(descontoReais)}` : ''}
          {cliente ? ` · ${cliente.nome}` : ''}
        </Text>
      </View>

      {erro && <Aviso tipo="erro" texto={erro} />}

      {ativas.length === 0 ? (
        <Aviso tipo="erro" texto="Nenhuma forma de pagamento ativa. Ative em Configurações → Formas de pagamento." />
      ) : (
        <View style={styles.formas} accessibilityRole="radiogroup" accessibilityLabel="Forma de pagamento">
          {FORMAS_PAGAMENTO.filter(f => ativas.includes(f)).map(f => {
            const Icone = ICONE_FORMA[f]
            const ativa = forma === f
            return (
              <Pressable
                key={f}
                onPress={() => setForma(f)}
                disabled={enviando}
                accessibilityRole="radio"
                accessibilityState={{ checked: ativa, disabled: enviando }}
                style={[styles.forma, ativa && styles.formaAtiva]}
              >
                <Icone size={22} color={ativa ? colors.primary600 : '#858d99'} />
                <Text style={[styles.formaTexto, ativa && styles.formaTextoAtivo]}>{ROTULO_FORMA_PAGAMENTO[f]}</Text>
              </Pressable>
            )
          })}
        </View>
      )}

      {forma === 'dinheiro' && (
        <View style={styles.dinheiro}>
          <View style={styles.grupo}>
            <Text style={styles.rotulo}>Valor recebido</Text>
            <View style={styles.moeda}>
              <Text style={styles.moedaPrefixo}>R$</Text>
              <TextInput
                value={recebidoTexto}
                onChangeText={setRecebidoTexto}
                placeholder={valorNoCampo(total)}
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={confirmar}
                editable={!enviando}
                accessibilityLabel="Valor recebido"
                style={styles.moedaCampo}
              />
            </View>
          </View>
          <View style={styles.sugestoes}>
            {sugestoesRecebido(total).map((v, i) => (
              <Pressable key={v} onPress={() => setRecebidoTexto(valorNoCampo(v))} disabled={enviando} accessibilityRole="button" style={styles.chip}>
                <Text style={styles.chipTexto}>{i === 0 ? 'Valor exato' : formatarReais(v)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.troco, faltando ? styles.trocoFalta : troco > 0 ? styles.trocoOk : null]}>
            <Text style={[styles.trocoRotulo, faltando ? styles.textoFalta : troco > 0 ? styles.textoOk : null]}>{faltando ? 'Faltam' : 'Troco'}</Text>
            <Text style={[styles.trocoValor, faltando ? styles.textoFalta : troco > 0 ? styles.textoOk : null]}>{formatarReais(Math.abs(troco))}</Text>
          </View>
        </View>
      )}

      {forma === 'pix' && (
        <>
          {formas.pix_chave ? (
            <View style={styles.pix}>
              <View style={styles.pixTextos}>
                <Text style={styles.pixRotulo}>Chave Pix{formas.pix_nome ? ` · ${formas.pix_nome}` : ''}</Text>
                <Text style={styles.pixChave}>{formas.pix_chave}</Text>
              </View>
              <BotaoPequeno rotulo={copiado ? 'Copiada' : 'Copiar'} icone={copiado ? IconCheck : IconCopy} onPress={copiarPix} style={styles.copiar} />
            </View>
          ) : null}
          <Text style={styles.nota}>Confirme que o Pix caiu na conta antes de concluir.</Text>
        </>
      )}

      {(forma === 'cartao_credito' || forma === 'cartao_debito') && (
        <Text style={styles.nota}>Passe o cartão na maquininha e conclua quando aprovar.</Text>
      )}

      <View style={styles.rodape}>
        <BotaoPequeno
          normal
          variante="primario"
          rotulo={enviando ? 'Registrando…' : `Concluir · ${formatarReais(total)}`}
          desativado={enviando || !forma || faltando || ativas.length === 0}
          onPress={confirmar}
        />
        <BotaoPequeno normal variante="fantasma" rotulo="Voltar" desativado={enviando} onPress={onFechar} />
      </View>
    </Folha>
  )
}

// Medidas do pdv.css do site em largura de celular.
const styles = StyleSheet.create({
  // `.pdv-modal-total`
  total: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  totalRotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', letterSpacing: 0.78, textTransform: 'uppercase', color: '#858d99' },
  totalValor: { fontFamily: FONTE_TITULO, fontSize: 34, lineHeight: 39.1, fontWeight: '800', letterSpacing: -1.36, color: colors.text },
  totalApoio: { fontSize: 13, lineHeight: 20.8, color: '#858d99', textAlign: 'center' },
  // `.pdv-formas`: uma por linha no celular.
  formas: { gap: 12 },
  forma: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13.6, paddingHorizontal: 14.4, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  formaAtiva: { borderColor: colors.primary600, backgroundColor: 'rgba(79,70,229,0.08)' },
  formaTexto: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: '#1f2937' },
  formaTextoAtivo: { color: colors.primary700 },
  // `.pdv-dinheiro`
  dinheiro: { gap: 12 },
  grupo: { gap: 4 },
  rotulo: { fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: colors.textDim },
  moeda: { flexDirection: 'row', alignItems: 'center', height: 52, paddingLeft: 14, paddingRight: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  moedaPrefixo: { width: 30, fontSize: 16, lineHeight: 25.6, fontWeight: '700', color: '#858d99' },
  moedaCampo: { flex: 1, height: '100%', fontFamily: FONTE_TITULO, fontSize: 20, fontWeight: '700', color: colors.text },
  sugestoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 14.4, borderRadius: 17, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipTexto: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colors.textMuted },
  // `.pdv-troco`
  troco: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12.8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  trocoOk: { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' },
  trocoFalta: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' },
  trocoInteiro: { alignSelf: 'stretch', marginTop: 8 },
  trocoRotulo: { fontSize: 15, lineHeight: 24, fontWeight: '600', color: colors.textMuted },
  trocoValor: { fontFamily: FONTE_TITULO, fontSize: 20, lineHeight: 32, fontWeight: '800', color: colors.text },
  textoOk: { color: colors.successFg },
  textoFalta: { color: colors.dangerFg },
  // `.pdv-pix`
  pix: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14.4, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  pixTextos: { flex: 1, minWidth: 0 },
  pixRotulo: { fontSize: 12, lineHeight: 19.2, color: '#858d99' },
  pixChave: { fontSize: 15, lineHeight: 24, fontWeight: '700', color: colors.text },
  copiar: { flexShrink: 0 },
  nota: { fontSize: 13, lineHeight: 20.8, color: '#858d99', textAlign: 'center' },
  // Pé da janela, como nas outras do app: a ação em cima, "Voltar" embaixo.
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
  // `.pdv-sucesso`
  sucesso: { alignItems: 'center', gap: 8, paddingTop: 16, paddingBottom: 8 },
  sucessoIcone: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  sucessoTitulo: { fontFamily: FONTE_TITULO, fontSize: 20, lineHeight: 25, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sucessoValor: { fontFamily: FONTE_TITULO, fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -0.96, color: colors.text },
  sucessoTexto: { fontSize: 14, lineHeight: 22.4, color: '#858d99', textAlign: 'center' },
})
