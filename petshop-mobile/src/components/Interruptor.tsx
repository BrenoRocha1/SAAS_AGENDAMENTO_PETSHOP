import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet } from 'react-native'
import { colors } from '@/theme/theme'

interface Props {
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
  accessibilityLabel?: string
}

// Medidas e cores do `.switch` do site NO CELULAR (petshop-app/src/app/
// globals.css): trilho de 40×22, bolinha branca de 18 que anda 18, 0,2s,
// cinza (--gray-600) desligado e índigo (--primary-500) ligado. O verde do
// `.switch-on` é só da tela grande; até 768px o site troca pelo índigo, e é
// essa versão que o app copia. Mudou lá, muda aqui.
const LARGURA = 40
const ALTURA = 22
const BOLINHA = 18
const FOLGA = 2

// Liga/desliga do app — o MESMO do painel do site, e não o do sistema do
// celular (que no iPhone e no Android tem outro tamanho, outra cor e outro
// formato). Aceita as mesmas propriedades do Switch do React Native.
export function Interruptor({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  const progresso = useRef(new Animated.Value(value ? 1 : 0)).current

  useEffect(() => {
    // Cor de fundo não anima pelo driver nativo.
    Animated.timing(progresso, { toValue: value ? 1 : 0, duration: 200, easing: Easing.ease, useNativeDriver: false }).start()
  }, [value, progresso])

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      // O trilho é pequeno; a área de toque fica com os 44pt de sempre.
      hitSlop={{ top: 11, bottom: 11, left: 6, right: 6 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      accessibilityLabel={accessibilityLabel}
      style={disabled && styles.desativado}
    >
      <Animated.View
        style={[
          styles.trilho,
          { backgroundColor: progresso.interpolate({ inputRange: [0, 1], outputRange: [colors.textFaint, colors.primary500] }) },
        ]}
      >
        <Animated.View
          style={[
            styles.bolinha,
            { transform: [{ translateX: progresso.interpolate({ inputRange: [0, 1], outputRange: [0, LARGURA - BOLINHA - FOLGA * 2] }) }] },
          ]}
        />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  desativado: { opacity: 0.6 },
  trilho: { width: LARGURA, height: ALTURA, borderRadius: ALTURA / 2, padding: FOLGA },
  bolinha: {
    width: BOLINHA,
    height: BOLINHA,
    borderRadius: BOLINHA / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
})
