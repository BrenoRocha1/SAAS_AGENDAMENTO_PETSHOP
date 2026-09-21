import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { ScreenContainer } from './ScreenContainer'
import { DetailHeader } from './DetailHeader'
import { Card } from './Card'
import { colors, radius, spacing, typography } from '@/theme/theme'

interface Props {
  titulo: string
  icone: keyof typeof Ionicons.glyphMap
  descricao: string
}

// Tela estrutural: a rota, a navegação e o lugar na identidade visual já
// existem — só o conteúdo é que vem depois, conectado ao mesmo backend
// que o dashboard web já usa. Não usa dado fictício de propósito.
export function EmBreve({ titulo, icone, descricao }: Props) {
  return (
    <ScreenContainer>
      <DetailHeader title={titulo} />
      <Card style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name={icone} size={26} color={colors.primary600} />
        </View>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.descricao}>{descricao}</Text>
        <View style={styles.tag}>
          <Ionicons name="construct-outline" size={13} color={colors.warningFg} />
          <Text style={styles.tagTexto}>Em construção</Text>
        </View>
      </Card>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing['2xl'] },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  titulo: { ...typography.heading.md, color: colors.text },
  descricao: { ...typography.body.lg, color: colors.textMuted, textAlign: 'center' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
  tagTexto: { ...typography.label.md, color: colors.warningFg },
})
