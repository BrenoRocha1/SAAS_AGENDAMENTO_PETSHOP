import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { coresStatus, etapaEncerrada, rotuloStatus } from '@/lib/statusAgendamento'
import { Text } from '@/components/Texto'

// Mistura uma cor "#rrggbb" com branco/transparente — o equivalente ao
// color-mix(in srgb, cor X%, transparent) do CSS, que o RN não tem.
function corComAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Selo de status das telas do cliente (Início, Agendamentos): pílula
// suave com pontinho pulsando, igual a um shadcn "Status" component —
// bem mais discreto que o StatusBadge cheio/maiúsculo do lojista, que
// não mexo aqui porque é compartilhado com as telas dele.
export function StatusAgendamentoMinimo({ status }: { status: string }) {
  const cor = coresStatus(status).solid
  // Finalizado/Cancelado não mudam mais, então o ponto fica parado.
  const parado = etapaEncerrada(status)
  const pulso = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (parado) return
    // Sequência com um passo de duração 0 pra voltar a 0 explicitamente
    // antes de cada repetição — o reset automático do Animated.loop não
    // é confiável no fallback JS do Expo web (fica parado no fim do 1º ciclo).
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulso, parado])

  return (
    <View style={[styles.pilula, { backgroundColor: corComAlpha(cor, 0.12), borderColor: corComAlpha(cor, 0.28) }]}>
      <View style={styles.pontoCaixa}>
        {!parado && (
          <Animated.View
            style={[
              styles.pontoPulso,
              { backgroundColor: cor, opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }] },
            ]}
          />
        )}
        <View style={[styles.ponto, { backgroundColor: cor }]} />
      </View>
      <Text style={[styles.texto, { color: cor }]}>{rotuloStatus(status)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pilula: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
  },
  pontoCaixa: { width: 7, height: 7, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  pontoPulso: { position: 'absolute', width: 7, height: 7, borderRadius: 4 },
  texto: { fontSize: 12, fontWeight: '600' },
})
