import { IconeApp } from '@/components/IconeApp'
import { Text } from '@/components/Texto'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { colors, spacing } from '@/theme/theme'

// `onVoltar`: pra tela que não tem "tela anterior" na própria pilha (o
// menu, aberto pela barra do topo) dizer pra onde a seta leva.
// `junto`: fichas (cliente, pet) começam 8 abaixo da faixa; as demais telas
// de dentro, 20 — no site elas têm o cabeçalho de página, escondido no
// celular mas com a margem dele.
export function DetailHeader({ title, onVoltar, junto }: { title: string; onVoltar?: () => void; junto?: boolean }) {
  const router = useRouter()
  return (
    <View style={[styles.row, junto && styles.junto]}>
      <Pressable
        onPress={onVoltar ?? (() => router.back())}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        style={styles.voltar}
      >
        <IconeApp name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  )
}

const styles = StyleSheet.create({
  // Mesma faixa do cabeçalho das telas de dentro do site no celular: 52 de
  // altura a partir do topo e 20 até o conteúdo. Sem padding horizontal:
  // quem usa já está dentro do ScreenContainer, que dá a margem lateral —
  // e a margem de cima dele é devolvida aqui (marginTop negativo).
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 52, marginTop: -spacing.lg, marginBottom: 20 },
  junto: { marginBottom: spacing.sm },
  voltar: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.xs },
  title: { flex: 1, fontSize: 18, lineHeight: 28.8, fontWeight: '700', color: colors.text },
  spacer: { width: 32 },
})
