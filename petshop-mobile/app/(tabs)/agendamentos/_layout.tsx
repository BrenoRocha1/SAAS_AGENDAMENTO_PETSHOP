import { Stack } from 'expo-router'

// Quem chega direto num agendamento (pela tela Início) ainda volta pra
// lista do dia.
export const unstable_settings = { anchor: 'index' }

export default function AgendamentosLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="novo" />
      <Stack.Screen name="remarcar" />
      <Stack.Screen name="editar" />
    </Stack>
  )
}
