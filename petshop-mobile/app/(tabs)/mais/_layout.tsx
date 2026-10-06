import { Stack } from 'expo-router'

export default function MaisLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="servicos" />
      <Stack.Screen name="planos" />
      <Stack.Screen name="pagamentos" />
      <Stack.Screen name="taxidog-config" />
      <Stack.Screen name="funcionarios" />
      <Stack.Screen name="produtos" />
      <Stack.Screen name="relatorios" />
      <Stack.Screen name="configuracoes" />
      <Stack.Screen name="config-agendamentos" />
      <Stack.Screen name="horarios" />
      <Stack.Screen name="perfil-loja" />
    </Stack>
  )
}
