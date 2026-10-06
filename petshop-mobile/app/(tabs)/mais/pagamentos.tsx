import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Campo } from '@/components/Campo'
import { IconCheck } from '@/components/IconesDoSite'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { FORMAS_LOJA_PADRAO, ROTULO_FORMA_PAGAMENTO, normalizarFormasLoja, type FormasLoja } from '@/lib/pagamento'
import { colors, spacing } from '@/theme/theme'

type Forma = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito'

// Ordem e textos da mesma tela no site (FormasPagamentoForm) — Pix primeiro,
// que tem campos.
const ORDEM: Forma[] = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito']
const DESCRICAO: Record<Forma, string> = {
  pix: 'O cliente vê a chave e o nome para conferir antes de pagar.',
  dinheiro: 'Pagamento em espécie na loja ou na entrega.',
  cartao_credito: 'Na maquininha da loja.',
  cartao_debito: 'Na maquininha da loja.',
}

// Formas de pagamento que a loja aceita (migration 057). As regras (Pix
// com chave e nome, ao menos uma forma ligada, quem pode mudar) estão em
// fn_salvar_formas_pagamento — dono ou administrador.
export default function PagamentosScreen() {
  const { contexto } = useAuth()
  const idLojista = contexto?.idLojista
  const pode = !!contexto?.acessoTotal
  const [formas, setFormas] = useState<FormasLoja>(FORMAS_LOJA_PADRAO)
  const [chave, setChave] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(true)
  const [semMigration, setSemMigration] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!idLojista || !pode) return
    const { data, error } = await supabase.rpc('fn_formas_pagamento_loja', { p_id_lojista: idLojista })
    setSemMigration(!!error)
    const f = normalizarFormasLoja(data)
    setFormas(f)
    setChave(f.pix_chave ?? '')
    setNome(f.pix_nome ?? '')
    setLoading(false)
  }, [idLojista, pode])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  if (!pode) {
    return (
      <ScreenContainer scroll={false}>
        <DetailHeader title="Formas de pagamentos aceitas" />
        <SemPermissao area="mudar as formas de pagamento" />
      </ScreenContainer>
    )
  }

  const marcar = (campo: Forma) => (v: boolean) => {
    setSalvo(false)
    setErro(null)
    setFormas(f => ({ ...f, [campo]: v }))
  }

  async function salvar() {
    if (formas.pix && (!chave.trim() || !nome.trim())) return setErro('Para ativar o Pix, preencha a chave e o nome de identificação.')
    if (!formas.pix && !formas.dinheiro && !formas.cartao_credito && !formas.cartao_debito) return setErro('Deixe pelo menos uma forma de pagamento ativada.')
    setErro(null)
    setSalvando(true)
    const { error } = await supabase.rpc('fn_salvar_formas_pagamento', {
      p_pix_ativo: formas.pix,
      p_pix_chave: chave.trim() || null,
      p_pix_nome: nome.trim() || null,
      p_dinheiro: formas.dinheiro,
      p_credito: formas.cartao_credito,
      p_debito: formas.cartao_debito,
    })
    setSalvando(false)
    if (error) {
      return setErro(faltaMigration(error) ? 'As formas de pagamento ainda não foram ativadas no sistema da loja.' : mensagemDoBanco(error, 'Não foi possível salvar as formas de pagamento.'))
    }
    setSalvo(true)
  }

  return (
    <ScreenContainer>
      <DetailHeader title="Formas de pagamentos aceitas" />

      {loading ? (
        <ActivityIndicator color={colors.primary600} />
      ) : semMigration ? (
        <Aviso tipo="alerta" texto="As formas de pagamento ainda não foram ativadas no sistema da loja." />
      ) : (
        <View style={styles.pilha}>
          {!formas.configurado && (
            <Aviso tipo="info" texto="Sua loja ainda não configurou: por enquanto valem Dinheiro, Cartão de crédito e Cartão de débito." />
          )}

          <View style={styles.cartao}>
            {ORDEM.map((forma, i) => (
              <View key={forma} style={[styles.linha, i > 0 && styles.linhaBorda]}>
                <View style={styles.topo}>
                  <View style={styles.textos}>
                    <Text style={styles.titulo}>{ROTULO_FORMA_PAGAMENTO[forma]}</Text>
                    <Text style={styles.descricao}>{DESCRICAO[forma]}</Text>
                  </View>
                  <Interruptor value={formas[forma]} onValueChange={marcar(forma)} accessibilityLabel={ROTULO_FORMA_PAGAMENTO[forma]} />
                </View>

                {forma === 'pix' && formas.pix && (
                  <View style={styles.pix}>
                    <Campo
                      rotulo="Chave Pix"
                      value={chave}
                      onChangeText={v => { setChave(v); setSalvo(false) }}
                      placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={140}
                    />
                    <Campo
                      rotulo="Nome de identificação"
                      value={nome}
                      onChangeText={v => { setNome(v); setSalvo(false) }}
                      placeholder="Ex.: Pet Shop SAIP"
                      maxLength={100}
                      ajuda="O nome que aparece no Pix — o cliente confere se está pagando para a loja certa."
                    />
                  </View>
                )}
              </View>
            ))}
          </View>

          {erro && <Aviso tipo="erro" texto={erro} />}

          <View style={styles.rodape}>
            {salvo && (
              <View style={styles.salvo}>
                <IconCheck size={14} color={colors.successFg} />
                <Text style={styles.salvoTexto}>Salvo</Text>
              </View>
            )}
            <Pressable
              onPress={salvar}
              disabled={salvando}
              accessibilityRole="button"
              style={({ pressed }) => [styles.salvar, (pressed || salvando) && { opacity: 0.8 }]}
            >
              {salvando ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.salvarTexto}>Salvar</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </ScreenContainer>
  )
}

// Medidas da página do site em largura de celular (FormasPagamentoForm).
const styles = StyleSheet.create({
  pilha: { gap: spacing.lg },
  cartao: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  linha: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, gap: spacing.lg },
  linhaBorda: { borderTopWidth: 1, borderTopColor: colors.border },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  textos: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  descricao: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  pix: { gap: spacing.md, padding: spacing.lg, borderRadius: 6, backgroundColor: colors.surfaceMuted },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md },
  salvo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  salvoTexto: { fontSize: 14, color: colors.successFg },
  salvar: {
    minWidth: 88,
    height: 46,
    paddingHorizontal: spacing.xl,
    borderRadius: 10,
    backgroundColor: colors.primary600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salvarTexto: { fontSize: 15, lineHeight: 15, fontWeight: '600', color: colors.white },
})
