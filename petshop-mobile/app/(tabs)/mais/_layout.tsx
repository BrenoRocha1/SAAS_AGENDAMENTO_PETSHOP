import { Stack } from 'expo-router'

export default function MaisLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="funcionarios" />
      <Stack.Screen name="produtos" />
      <Stack.Screen name="relatorios" />
      <Stack.Screen name="configuracoes" />
      <Stack.Screen name="perfil-loja" />
    </Stack>
  )
}
