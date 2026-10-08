import { StyleSheet, View } from 'react-native'
import { LogoSimbolo } from '@/components/LogoSaip'
import { Text } from '@/components/Texto'
import { FONTE_TITULO } from '@/theme/fontes'
import { colors, spacing } from '@/theme/theme'

export const SLOGAN_SAIP = 'Sistema de agendamento inteligente para petshop'

// Marca das telas de entrada (login, código de acesso): o mesmo bloco do site
// (petshop-app/src/components/MarcaSaip.tsx) — selo com a patinha, o nome e o
// slogan embaixo. Se o slogan mudar lá, muda aqui.
export function MarcaSaip() {
  return (
    <View style={styles.marca}>
      <LogoSimbolo altura={30} />
      <View style={styles.texto}>
        <Text style={styles.nome}>SAIP</Text>
        <Text style={styles.slogan}>{SLOGAN_SAIP}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  marca: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  texto: { flex: 1, gap: 1 },
  nome: { fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: 3, fontFamily: FONTE_TITULO, color: colors.text },
  slogan: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
})
