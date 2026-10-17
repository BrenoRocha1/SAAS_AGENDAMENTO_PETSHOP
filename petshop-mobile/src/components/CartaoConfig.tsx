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
            <Icone size={18} color={colors.primary600} />
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
  // Ícone e interruptor no alto do texto (`.cfg-area` do site no celular).
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  cabecalho: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // `.cfg-area .dash-icon-btn`: o quadrado roxo-claro de 36 com o desenho de 18.
  icone: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  descricao: { fontSize: 13, lineHeight: 19.5, color: colors.textMuted },
  corpo: { marginTop: 16 },
  erro: { marginBottom: 16 },
})
