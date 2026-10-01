import { Stack } from 'expo-router'

// Header próprio em cada tela (DetailHeader/título custom) em vez do
// header nativo — mesma decisão do resto do app, pra manter a mesma
// linguagem visual em todo lugar.
// Quem chega direto num cliente (pelo agendamento) ainda volta pra lista.
export const unstable_settings = { anchor: 'index' }

export default function ClientesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="novo" />
    </Stack>
  )
}
