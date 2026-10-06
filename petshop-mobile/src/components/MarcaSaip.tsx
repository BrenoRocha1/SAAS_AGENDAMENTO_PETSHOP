import { StyleSheet, View } from 'react-native'
import { IconePets } from '@/components/IconesAbas'
import { Text } from '@/components/Texto'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, radius, spacing } from '@/theme/theme'

export const SLOGAN_SAIP = 'Sistema de agendamento inteligente para petshop'

// Marca das telas de entrada (login, código de acesso): o mesmo bloco do site
// (petshop-app/src/components/MarcaSaip.tsx) — selo com a patinha, o nome e o
// slogan embaixo. Se o slogan mudar lá, muda aqui.
export function MarcaSaip() {
  return (
    <View style={styles.marca}>
      <View style={styles.selo}>
        <IconePets color={colors.primary600} size={18} />
      </View>
      <View style={styles.texto}>
        <Text style={styles.nome}>
          SA<Text style={{ color: colors.primary600 }}>IP</Text>
        </Text>
        <Text style={styles.slogan}>{SLOGAN_SAIP}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  marca: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  selo: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primary50,
    borderWidth: 1,
    borderColor: colors.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { flex: 1, gap: 1 },
  nome: { fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, fontFamily: FONTE_TITULO, color: colors.text },
  slogan: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
})
