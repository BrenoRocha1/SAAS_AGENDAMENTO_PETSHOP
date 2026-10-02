import { useEffect, useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { registrarDialogo, type BotaoDialogo, type PedidoDialogo } from '@/lib/dialogo'
import { colors, radius, shadow, spacing, typography } from '@/theme/theme'

// Desenha as perguntas de confirmação quando o app roda no navegador (no
// celular quem pergunta é o Alert nativo — ver lib/dialogo). Fica montado
// uma vez, na raiz.
export function DialogoHost() {
  const [pedido, setPedido] = useState<PedidoDialogo | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    return registrarDialogo(setPedido)
  }, [])

  if (!pedido) return null

  const voltar = pedido.botoes.find(b => b.style === 'cancel')
  // A ação principal em cima; "voltar" sempre por último.
  const acoes = pedido.botoes.filter(b => b.style !== 'cancel').reverse()

  function escolher(botao: BotaoDialogo | undefined) {
    setPedido(null)
    botao?.onPress?.()
  }

  return (
    // Sem animação de propósito: aba em segundo plano pausa animações, e a
    // pergunta ficaria invisível com a tela travada atrás dela.
    <Modal visible transparent animationType="none" onRequestClose={() => escolher(voltar)}>
      <View style={styles.fundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => escolher(voltar)} accessibilityLabel="Fechar" />
        <View style={styles.caixa} accessibilityRole="alert">
          <Text style={styles.titulo}>{pedido.titulo}</Text>
          {pedido.mensagem ? <Text style={styles.mensagem}>{pedido.mensagem}</Text> : null}
          <View style={styles.botoes}>
            {acoes.map((b, i) => (
              <Pressable
                key={`${b.text}-${i}`}
                onPress={() => escolher(b)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.botao,
                  b.style === 'destructive' ? styles.botaoPerigo : i === 0 ? styles.botaoPrimario : styles.botaoSecundario,
                  pressed && styles.pressionado,
                ]}
              >
                <Text style={[styles.botaoTexto, b.style === 'destructive' || i === 0 ? styles.textoClaro : styles.textoEscuro]}>{b.text}</Text>
              </Pressable>
            ))}
            {(voltar || acoes.length === 0) && (
              <Pressable
                onPress={() => escolher(voltar)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.botao, styles.botaoSecundario, pressed && styles.pressionado]}
              >
                <Text style={[styles.botaoTexto, styles.textoEscuro]}>{voltar?.text ?? 'OK'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fundo: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'], backgroundColor: 'rgba(17,24,39,0.45)' },
  caixa: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadow.md,
  },
  titulo: { ...typography.heading.md, color: colors.text },
  mensagem: { ...typography.body.lg, color: colors.textDim },
  botoes: { marginTop: spacing.md, gap: spacing.sm },
  botao: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderWidth: 1 },
  botaoPrimario: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  botaoPerigo: { backgroundColor: colors.dangerFg, borderColor: colors.dangerFg },
  botaoSecundario: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  pressionado: { opacity: 0.8 },
  botaoTexto: { ...typography.heading.sm, textAlign: 'center' },
  textoClaro: { color: colors.white },
  textoEscuro: { color: colors.text },
})
