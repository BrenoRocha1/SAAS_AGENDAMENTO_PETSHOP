import { useState, type ComponentType, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import type { IconeProps } from '@/components/IconesDoSite'
import { Interruptor } from '@/components/Interruptor'
import { Text } from '@/components/Texto'
import { colors } from '@/theme/theme'

interface Props {
  icone: ComponentType<IconeProps>
  titulo: string
  descricao: string
  // Acima do cabeçalho (o erro do liga/desliga).
  antes?: ReactNode
  // À direita do cabeçalho (o liga/desliga).
  lateral?: ReactNode
  // O formulário do cartão, embaixo do cabeçalho.
  children?: ReactNode
}

// Cartão das telas de configuração do site (`.card` com o ícone numa
// caixinha, título e explicação) — com ou sem formulário embaixo.
export function CartaoConfig({ icone: Icone, titulo, descricao, antes, lateral, children }: Props) {
  return (
    <View style={styles.cartao}>
      {antes}
      <View style={styles.topo}>
        <View style={styles.cabecalho}>
          <View style={styles.icone}>
            <Icone size={17} color={colors.textDim} />
          </View>
          <View style={styles.textos}>
            <Text style={styles.titulo}>{titulo}</Text>
            <Text style={styles.descricao}>{descricao}</Text>
          </View>
        </View>
        {lateral}
      </View>
      {children ? <View style={styles.corpo}>{children}</View> : null}
    </View>
  )
}

interface PropsInterruptor {
  icone: ComponentType<IconeProps>
  titulo: string
  descricao: string
  // Emendado na explicação enquanto está desligado.
  descricaoDesativado?: string
  valor: boolean
  // Grava o valor novo; devolve a mensagem de erro, se não deu.
  onMudar: (ativo: boolean) => Promise<string | undefined>
  desativado?: boolean
}

// Cartão de uma configuração de ligar e desligar (o ConfigToggleCard do site).
export function CartaoInterruptor({ icone, titulo, descricao, descricaoDesativado, valor, onMudar, desativado }: PropsInterruptor) {
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function mudar(ativo: boolean) {
    setErro(null)
    setOcupado(true)
    const falha = await onMudar(ativo)
    setOcupado(false)
    if (falha) setErro(falha)
  }

  return (
    <CartaoConfig
      icone={icone}
      titulo={titulo}
      descricao={`${descricao}${!valor && descricaoDesativado ? ` ${descricaoDesativado}` : ''}`}
      antes={erro ? <Aviso tipo="erro" texto={erro} style={styles.erro} /> : undefined}
      lateral={<Interruptor value={valor} disabled={desativado || ocupado} onValueChange={mudar} accessibilityLabel={titulo} />}
    />
  )
}

// Medidas do `.card` das configurações no site, em 375 de largura.
const styles = StyleSheet.create({
  cartao: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  cabecalho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  // `.dash-icon-btn`: a caixinha de 40 com o desenho de 17.
  icone: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1 },
  titulo: { fontSize: 16, lineHeight: 25.6, fontWeight: '600', color: colors.text },
  descricao: { fontSize: 14, lineHeight: 20, color: '#858d99' },
  corpo: { marginTop: 16 },
  erro: { marginBottom: 16 },
})
