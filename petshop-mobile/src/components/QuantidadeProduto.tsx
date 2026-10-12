import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Aviso } from '@/components/Aviso'
import { BotaoPequeno } from '@/components/BotaoPequeno'
import { Campo } from '@/components/Campo'
import { Folha } from '@/components/Folha'
import { IconMinus, IconPencil, IconPlus } from '@/components/IconesDoSite'
import { Text } from '@/components/Texto'
import { arredondarQuantidade, lerValorDigitado, textoQuantidade } from '@/lib/pdv'
import { rotuloUnidade, unidadeFracionavel } from '@/lib/produto'
import { colors } from '@/theme/theme'

interface Props {
  nome: string
  unidade: string
  // 0 = fora do pedido.
  quantidade: number
  estoque: number
  onChange: (quantidade: number) => void
  desativado?: boolean
}

// Quantidade de um produto no agendamento do cliente.
// • Produto contado em unidades (unidade, pacote, caixa…): botões de menos e
//   mais, um toque por unidade, até o que há em estoque.
// • Produto vendido por peso ou volume (kg, litro): um botão que abre uma
//   janela para digitar quanto — "0,5", "1,25" — em vez de ir de 0,1 em 0,1.
// Em 0 o produto sai do pedido.
export function QuantidadeProduto({ nome, unidade, quantidade, estoque, onChange, desativado }: Props) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  if (!unidadeFracionavel(unidade)) {
    const maximo = Math.floor(estoque)
    return (
      <View style={styles.passos}>
        <Pressable
          onPress={() => onChange(Math.max(0, quantidade - 1))}
          disabled={desativado || quantidade <= 0}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Menos ${nome}`}
          style={[styles.passo, (desativado || quantidade <= 0) && styles.parado]}
        >
          <IconMinus size={14} color={colors.primary300} />
        </Pressable>
        <Text style={styles.valor}>{quantidade}</Text>
        <Pressable
          onPress={() => onChange(Math.min(maximo, quantidade + 1))}
          disabled={desativado || quantidade >= maximo}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Mais ${nome}`}
          style={[styles.passo, (desativado || quantidade >= maximo) && styles.parado]}
        >
          <IconPlus size={14} color={colors.primary300} />
        </Pressable>
      </View>
    )
  }

  const nomeDaUnidade = rotuloUnidade(unidade).toLowerCase()

  function abrir() {
    setTexto(quantidade > 0 ? String(arredondarQuantidade(quantidade)).replace('.', ',') : '')
    setErro(null)
    setAberto(true)
  }

  function confirmar() {
    const valor = arredondarQuantidade(lerValorDigitado(texto))
    if (valor <= 0) return setErro(`Informe quanto você quer, em ${nomeDaUnidade}.`)
    if (valor > estoque) return setErro(`Só há ${textoQuantidade(estoque, unidade)} em estoque.`)
    onChange(valor)
    setAberto(false)
  }

  return (
    <>
      <BotaoPequeno
        icone={quantidade > 0 ? IconPencil : IconPlus}
        rotulo={quantidade > 0 ? textoQuantidade(quantidade, unidade) : 'Adicionar'}
        desativado={desativado}
        onPress={abrir}
      />
      <Folha visivel={aberto} titulo={nome} onFechar={() => setAberto(false)}>
        {erro && <Aviso tipo="erro" texto={erro} />}
        <Campo
          rotulo={`Quantidade (${nomeDaUnidade})`}
          value={texto}
          onChangeText={t => { setTexto(t.replace(/[^\d.,]/g, '')); setErro(null) }}
          keyboardType="decimal-pad"
          placeholder="0,5"
          maxLength={7}
          autoFocus
          nota={`Vendido por ${nomeDaUnidade}: pode usar vírgula. Em estoque: ${textoQuantidade(estoque, unidade)}.`}
        />
        <View style={styles.rodape}>
          <BotaoPequeno normal variante="primario" rotulo="Confirmar" onPress={confirmar} />
          {quantidade > 0 && (
            <BotaoPequeno normal variante="perigoClaro" rotulo="Tirar do pedido" onPress={() => { onChange(0); setAberto(false) }} />
          )}
          <BotaoPequeno normal rotulo="Cancelar" onPress={() => setAberto(false)} />
        </View>
      </Folha>
    </>
  )
}

const styles = StyleSheet.create({
  // `.ag2-stepper` do agendamento online do site.
  passos: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  parado: { opacity: 0.35 },
  valor: { minWidth: 22, textAlign: 'center', fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  rodape: { gap: 8, marginTop: 8, marginBottom: -8 },
})
