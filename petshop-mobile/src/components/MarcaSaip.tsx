import { StyleSheet, View } from 'react-native'
import { LogoSaip } from '@/components/LogoSaip'
import { Text } from '@/components/Texto'
import { colors, spacing } from '@/theme/theme'

export const SLOGAN_SAIP = 'Sistema de agendamento inteligente para petshop'

// Marca das telas de entrada (login, código de acesso): o mesmo bloco do site
// (petshop-app/src/components/MarcaSaip.tsx) — selo com a patinha, o nome e o
// slogan embaixo. Se o slogan mudar lá, muda aqui.
export function MarcaSaip() {
  return (
    <View style={styles.marca}>
      <View style={styles.texto}>
        <LogoSaip altura={30} />
        <Text style={styles.slogan}>{SLOGAN_SAIP}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  marca: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  texto: { flex: 1, gap: 6, alignItems: 'flex-start' },
  slogan: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
})
