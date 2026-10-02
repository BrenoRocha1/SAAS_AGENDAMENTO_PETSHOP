import { Stack } from 'expo-router'

export const unstable_settings = { anchor: 'index' }

export default function MenuClienteLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="planos" />
      <Stack.Screen name="perfil" />
    </Stack>
  )
}
