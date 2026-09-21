import { Stack } from 'expo-router'

// Header próprio em cada tela (DetailHeader/título custom) em vez do
// header nativo — mesma decisão do resto do app, pra manter a mesma
// linguagem visual em todo lugar.
export default function ClientesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  )
}
