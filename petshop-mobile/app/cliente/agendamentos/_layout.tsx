import { Stack } from 'expo-router'

// Quem chega direto no "novo agendamento" (pela Início ou pela lista de
// petshops) ainda volta pra lista de agendamentos.
export const unstable_settings = { anchor: 'index' }

export default function AgendamentosClienteLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="novo" />
      <Stack.Screen name="remarcar" />
      <Stack.Screen name="editar" />
    </Stack>
  )
}
