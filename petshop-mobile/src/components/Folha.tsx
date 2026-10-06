import { ReactNode } from 'react'
import { IconeApp } from '@/components/IconeApp'
import { Text } from '@/components/Texto'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  visivel: boolean
  titulo: string
  onFechar: () => void
  children: ReactNode
  // Enquanto salva, tocar fora ou no X não fecha.
  ocupado?: boolean
}

// Fecha uma folha e abre outra no lugar (a pergunta de exclusão depois da
// janela de edição). No iPhone, abrir enquanto a anterior ainda desce faz
// a nova não aparecer — por isso a espera.
export function depoisDeFechar(abrir: () => void) {
  if (Platform.OS === 'ios') setTimeout(abrir, 500)
  else abrir()
}

// Painel que sobe de baixo (o "modal" do web no celular): motivo do
// cancelamento, forma de pagamento, escolha de profissional...
export function Folha({ visivel, titulo, onFechar, children, ocupado }: Props) {
  const insets = useSafeAreaInsets()
  const fechar = () => { if (!ocupado) onFechar() }
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={fechar} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fundo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.fora} onPress={fechar} accessibilityLabel="Fechar" />
        <View style={[styles.painel, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
            <Pressable onPress={fechar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar" style={styles.fechar}>
              <IconeApp name="close" size={15} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.conteudo}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' },
  fora: { flex: 1 },
  painel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  titulo: { flex: 1, ...typography.heading.md, color: colors.text },
  // `.modal-close` do site: 32 de área com o "X" de 15.
  fechar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  conteudo: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
})
