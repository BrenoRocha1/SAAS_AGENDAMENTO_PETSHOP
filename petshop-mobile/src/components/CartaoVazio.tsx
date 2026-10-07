import type { ComponentType, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import type { IconeProps } from '@/components/IconesDoSite'
import { Ilustracao, type NomeIlustracao } from '@/components/Ilustracao'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'

interface Props {
  ilustracao?: NomeIlustracao
  // No lugar do desenho (ex.: tela desativada nas configurações).
  icone?: ComponentType<IconeProps>
  titulo: string
  texto?: string
  // Um botão embaixo do texto.
  children?: ReactNode
}

// O `.empty-state.card` do site no celular: cartão com o desenho de 130,
// título de 18 e texto de 16, tudo centralizado. É o "não há nada aqui" de
// página inteira (relatório sem vendas, dia sem agendamentos, sem
// permissão); dentro de listas o app usa o EmptyState, menor.
export function CartaoVazio({ ilustracao, icone: Icone, titulo, texto, children }: Props) {
  return (
    <View style={styles.cartao}>
      {ilustracao ? (
        <Ilustracao nome={ilustracao} altura={130} style={styles.figura} />
      ) : Icone ? (
        <View style={[styles.figura, styles.icone]}>
          <Icone size={36} color={colors.textFaint} />
        </View>
      ) : null}
      <Text style={styles.titulo}>{titulo}</Text>
      {texto ? <Text style={styles.texto}>{texto}</Text> : null}
      {children ? <View style={styles.acao}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  cartao: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  figura: { marginBottom: 16 },
  icone: { alignItems: 'center' },
  titulo: { fontSize: 18, lineHeight: 28.8, fontWeight: '600', color: colors.textMuted, textAlign: 'center', marginBottom: 8 },
  texto: { fontSize: 16, lineHeight: 25.6, color: colors.textDim, textAlign: 'center' },
  acao: { alignItems: 'center', marginTop: 16 },
})
