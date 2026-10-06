import { Stack } from 'expo-router'

// Quem chega direto num pet (pela ficha do cliente) ainda volta pra lista.
export const unstable_settings = { anchor: 'index' }

export default function PetsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  )
}
