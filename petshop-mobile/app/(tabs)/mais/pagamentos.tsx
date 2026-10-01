import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from '@/components/ScreenContainer'
import { DetailHeader } from '@/components/DetailHeader'
import { Card } from '@/components/Card'
import { SemPermissao } from '@/components/SemPermissao'
import { Aviso } from '@/components/Aviso'
import { Botao } from '@/components/Botao'
import { Campo } from '@/components/Campo'
import { LinhaSwitch } from '@/components/LinhaSwitch'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { faltaMigration, mensagemDoBanco } from '@/lib/erros'
import { FORMAS_LOJA_PADRAO, normalizarFormasLoja, type FormasLoja } from '@/lib/pagamento'
import { colors, spacing, typography } from '@/theme/theme'

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
        <DetailHeader title="Formas de pagamento" />
        <SemPermissao area="mudar as formas de pagamento" />
      </ScreenContainer>
    )
  }

  const marcar = (campo: 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito') => (v: boolean) => {
    setSalvo(false)
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
      <DetailHeader title="Formas de pagamento" />

      {loading ? (
        <ActivityIndicator color={colors.primary600} />
      ) : semMigration ? (
        <Aviso tipo="alerta" texto="As formas de pagamento ainda não foram ativadas no sistema da loja." />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.sub}>
            O cliente escolhe uma destas ao agendar. Escolher a forma não é pagar: a loja marca "pago" quando receber.
          </Text>

          <Card style={{ gap: spacing.md }}>
            <LinhaSwitch titulo="Pix" detalhe="O cliente vê a chave para pagar." valor={formas.pix} onChange={marcar('pix')} />
            {formas.pix && (
              <>
                <Campo rotulo="Chave Pix" value={chave} onChangeText={t => { setChave(t); setSalvo(false) }} autoCapitalize="none" autoCorrect={false} maxLength={140} />
                <Campo
                  rotulo="Nome de quem recebe"
                  value={nome}
                  onChangeText={t => { setNome(t); setSalvo(false) }}
                  maxLength={100}
                  ajuda="Aparece para o cliente conferir antes de pagar."
                />
              </>
            )}
          </Card>

          <Card style={{ gap: spacing.md }}>
            <LinhaSwitch titulo="Dinheiro" valor={formas.dinheiro} onChange={marcar('dinheiro')} />
            <LinhaSwitch titulo="Cartão de crédito" valor={formas.cartao_credito} onChange={marcar('cartao_credito')} />
            <LinhaSwitch titulo="Cartão de débito" valor={formas.cartao_debito} onChange={marcar('cartao_debito')} />
          </Card>

          {erro && <Aviso tipo="erro" texto={erro} />}
          {salvo && <Aviso tipo="sucesso" texto="Formas de pagamento salvas." />}
          <Botao rotulo="Salvar" onPress={salvar} carregando={salvando} />
        </View>
      )}
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  sub: { ...typography.body.md, color: colors.textMuted },
})
